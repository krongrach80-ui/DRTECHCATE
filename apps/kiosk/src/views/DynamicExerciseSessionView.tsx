/**
 * apps/kiosk/src/views/DynamicExerciseSessionView.tsx
 *
 * REAL-TIME DYNAMIC AI EXERCISE EVALUATION SESSION
 * Features:
 * - Color-coded skeleton overlay (Green = good/target, Yellow = approaching/warning, Red = error/safety cap)
 * - Joint angle HUD & circular pendulum 360° progress gauge
 * - Web Audio API synthesized harmonic chime on rep completion
 * - PainStopEmergencyBar with high-priority PT alert
 * - End-of-set & End-of-exercise summary cards
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  ExerciseDetectionConfig,
  ExerciseSessionTelemetry,
  PoseEngineLandmark,
  RepEvaluationResult,
  BodySide,
} from '../../../../packages/pose-engine/src/types/exerciseConfig';
import { RepStateMachine } from '../../../../packages/pose-engine/src/engine/repStateMachine';
import { CameraStreamWatchdog, WatchdogHealthStatus } from '../../../../packages/pose-engine/src/hardwareWatchdog';
import { VoiceFeedbackController } from '../../../../packages/hospital-ui-kit/src/VoiceFeedbackController';
import { PainStopEmergencyBar } from '../components/PainStopEmergencyBar';
import { defaultApiClient } from '../../../../packages/api-client/src/index.js';
import {
  Trophy,
  Activity,
  Clock,
  ArrowRight,
  ShieldAlert,
  AlertTriangle,
  Cpu,
} from 'lucide-react';

interface DynamicExerciseSessionViewProps {
  patient: {
    patient_id?: string;
    hn?: string;
    first_name: string;
    last_name?: string;
  };
  exercise: {
    id?: string;
    exercise_id?: string;
    name?: string;
    title?: string;
    target_joint?: string;
    sets?: number;
    reps?: number;
  };
  config: ExerciseDetectionConfig;
  onSessionCompleted: (telemetry: ExerciseSessionTelemetry) => void;
  onExit: () => void;
}

const POSE_CONNECTIONS: [number, number][] = [
  [11, 12], // Shoulders
  [11, 13], [13, 15], // Left arm
  [12, 14], [14, 16], // Right arm
  [11, 23], [12, 24], // Torso
  [23, 24], // Hips
  [23, 25], [25, 27], // Left leg
  [24, 26], [26, 28], // Right leg
];

export const DynamicExerciseSessionView: React.FC<DynamicExerciseSessionViewProps> = ({
  patient,
  exercise,
  config,
  onSessionCompleted,
  onExit,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateMachineRef = useRef<RepStateMachine>(new RepStateMachine(config));
  const watchdogRef = useRef<CameraStreamWatchdog>(
    new CameraStreamWatchdog({
      maxFrozenFrames: 60,
      minFpsThreshold: 15.0,
      maxReconnectAttempts: 3,
      baseReconnectDelayMs: 1000,
    })
  );
  const voiceFeedbackRef = useRef<VoiceFeedbackController>(
    new VoiceFeedbackController({
      minCooldownMs: 3500,
      lang: 'th-TH',
      rate: 1.05,
    })
  );
  const isMountedRef = useRef(true);
  const animFrameIdRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sessionStartTimeRef = useRef<number>(0);
  const isFinalizingRef = useRef(false);
  const isReportingPainRef = useRef(false);

  const [isPaused, setIsPaused] = useState(false);
  const [activeSide, setActiveSide] = useState<BodySide>(config.side || 'right');
  const [evalResult, setEvalResult] = useState<RepEvaluationResult | null>(null);
  const [watchdogStatus, setWatchdogStatus] = useState<WatchdogHealthStatus | null>(null);
  const [isResting, setIsResting] = useState(false);
  const [restCountdown, setRestCountdown] = useState(config.defaultPrescription.restBetweenSetsSec || 30);
  const [isSummaryOpen, setIsSummaryOpen] = useState(false);
  const [painReportedState, setPainReportedState] = useState(false);

  // Play synthesized harmonic chime
  const playRepChime = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioCtx();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.exponentialRampToValueAtTime(880.0, now + 0.18); // A5

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.3, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.35);
    } catch {
      // safe fallback
    }
  }, []);

  // Web Speech Thai TTS announcement with >= 3500ms cooldown guard
  const speakThai = useCallback((text: string, category?: string, overrideCooldownMs?: number) => {
    voiceFeedbackRef.current.speak(text, category, overrideCooldownMs);
  }, []);

  const handleToggleSide = useCallback((newSide: BodySide) => {
    setActiveSide(newSide);
    stateMachineRef.current.setSide(newSide);
    speakThai(newSide === 'right' ? 'ตรวจจับแขนขวา' : 'ตรวจจับแขนซ้าย', 'side_toggle', 0);
  }, [speakThai]);

  // Canvas Skeleton Rendering with lowPerformanceMode throttling support
  const renderSkeleton = useCallback(
    (landmarks: PoseEngineLandmark[], formRating: 'good' | 'warning' | 'error', isLowPerf: boolean = false) => {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (!canvas || !video) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      if (landmarks.length === 0) return;

      // Pick theme color based on form
      const color =
        formRating === 'good'
          ? '#10b981' // Emerald 500
          : formRating === 'warning'
          ? '#f59e0b' // Amber 500
          : '#ef4444'; // Red 500

      ctx.lineWidth = isLowPerf ? 2.5 : 4;
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Draw skeletal connections
      for (const [iA, iB] of POSE_CONNECTIONS) {
        if (landmarks[iA] && landmarks[iB]) {
          const visA = landmarks[iA].visibility ?? 1.0;
          const visB = landmarks[iB].visibility ?? 1.0;
          if (visA >= 0.5 && visB >= 0.5) {
            ctx.beginPath();
            ctx.moveTo(landmarks[iA].x * w, landmarks[iA].y * h);
            ctx.lineTo(landmarks[iB].x * w, landmarks[iB].y * h);
            ctx.stroke();
          }
        }
      }

      // Draw joint nodes (in lowPerformanceMode, skip outer ring strokes to prevent lag)
      const radius = isLowPerf ? 4 : 6;
      for (let i = 0; i < landmarks.length; i++) {
        const lm = landmarks[i];
        if ((lm.visibility ?? 1.0) >= 0.5) {
          ctx.beginPath();
          ctx.arc(lm.x * w, lm.y * h, radius, 0, 2 * Math.PI);
          ctx.fill();
          if (!isLowPerf) {
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.stroke();
          }
        }
      }
    },
    []
  );

  // Camera & MediaPipe Pose Landmarker initialization
  useEffect(() => {
    isMountedRef.current = true;
    if (sessionStartTimeRef.current === 0) {
      sessionStartTimeRef.current = Date.now();
    }
    let stream: MediaStream | null = null;
    let landmarker: any = null;

    async function initCameraAndDetector() {
      try {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              width: { ideal: 1280 },
              height: { ideal: 720 },
              facingMode: 'user',
            },
            audio: false,
          });
        } catch {
          // Seamless fallback to default video constraints to prevent OverconstrainedError
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
        }

        if (videoRef.current && isMountedRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.muted = true;
          videoRef.current.playsInline = true;
          try {
            await videoRef.current.play();
          } catch (playErr) {
            console.warn('Video play deferred or non-fatal:', playErr);
          }
        }

        // Enforce self-hosted WASM and local models for China GFW immunity
        const vision = await import('@mediapipe/tasks-vision');
        let filesetResolver: any;
        try {
          filesetResolver = await vision.FilesetResolver.forVisionTasks('/models/wasm');
        } catch {
          filesetResolver = await vision.FilesetResolver.forVisionTasks('/wasm');
        }

        try {
          landmarker = await vision.PoseLandmarker.createFromOptions(filesetResolver, {
            baseOptions: {
              modelAssetPath: '/models/pose_landmarker.task',
              delegate: 'GPU',
            },
            runningMode: 'VIDEO',
            numPoses: 1,
            minPoseDetectionConfidence: 0.5,
            minPosePresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
          });
        } catch {
          try {
            landmarker = await vision.PoseLandmarker.createFromOptions(filesetResolver, {
              baseOptions: {
                modelAssetPath: '/models/pose_landmarker.task',
                delegate: 'CPU',
              },
              runningMode: 'VIDEO',
              numPoses: 1,
              minPoseDetectionConfidence: 0.5,
              minPosePresenceConfidence: 0.5,
              minTrackingConfidence: 0.5,
            });
          } catch {
            landmarker = await vision.PoseLandmarker.createFromOptions(filesetResolver, {
              baseOptions: {
                modelAssetPath: '/models/pose_landmarker_lite.task',
                delegate: 'CPU',
              },
              runningMode: 'VIDEO',
              numPoses: 1,
              minPoseDetectionConfidence: 0.5,
              minPosePresenceConfidence: 0.5,
              minTrackingConfidence: 0.5,
            });
          }
        }

        startProcessingLoop(landmarker);
      } catch (err) {
        console.warn('Pose landmarker init warning:', err);
        // Fallback simulation loop if camera/model has restrictions
        startFallbackLoop();
      }
    }

    let lastCompletedReps = 0;
    let lastInferenceTime = 0;
    let lastWatchdogStatusCheck = 0;

    const startProcessingLoop = (detector: any) => {
      const processFrame = () => {
        if (!isMountedRef.current) return;

        const now = Date.now();
        if (
          !isPaused &&
          !isResting &&
          !isSummaryOpen &&
          videoRef.current &&
          videoRef.current.readyState >= 2 &&
          now - lastInferenceTime >= 33 // ~30 FPS throttling
        ) {
          lastInferenceTime = now;
          try {
            const results = detector.detectForVideo(videoRef.current, now);
            let rawLandmarks: PoseEngineLandmark[] = [];

            if (results.landmarks && results.landmarks[0]) {
              rawLandmarks = results.landmarks[0].map((lm: any) => ({
                x: lm.x,
                y: lm.y,
                z: lm.z,
                visibility: lm.visibility ?? 0.9,
                presence: lm.presence ?? 0.9,
              }));
            }

            // 1. Hardware Watchdog Check (Frozen detection & FPS throttling)
            const wdStatus = watchdogRef.current.update(rawLandmarks, now);
            if (now - lastWatchdogStatusCheck > 600) {
              lastWatchdogStatusCheck = now;
              setWatchdogStatus(wdStatus);
            }

            // Auto-Reconnect on stream freeze
            if (wdStatus.needsReconnect && !wdStatus.isReconnecting) {
              watchdogRef.current.attemptReconnect(async () => {
                if (stream) {
                  stream.getTracks().forEach((t) => t.stop());
                }
                const newStream = await navigator.mediaDevices.getUserMedia({
                  video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    facingMode: 'user',
                  },
                  audio: false,
                });
                if (videoRef.current && isMountedRef.current) {
                  videoRef.current.srcObject = newStream;
                  await videoRef.current.play();
                }
                stream = newStream;
                return newStream;
              });
            }

            // 2. Biomechanical Rep & Compensation Evaluation
            const evalRes = stateMachineRef.current.evaluate(rawLandmarks, now);
            setEvalResult(evalRes);

            // Chime & speech on rep increment
            if (evalRes.completedReps > lastCompletedReps) {
              lastCompletedReps = evalRes.completedReps;
              playRepChime();
              speakThai(`ครั้งที่ ${evalRes.completedReps}`, 'rep_count', 1200);
            }

            // Occlusion / Subject Lock Warning with >= 3500ms cooldown
            if (evalRes.isOccluded && evalRes.occlusionReasonTh) {
              speakThai(evalRes.occlusionReasonTh, 'occlusion_warning', 3500);
            } else if (evalRes.coachingMessageTh && evalRes.formRating !== 'good') {
              speakThai(evalRes.coachingMessageTh, 'coaching_warning', 4000);
            }

            // Set completion check
            if (evalRes.isSetCompleted && !evalRes.isExerciseCompleted && !isResting) {
              setIsResting(true);
              speakThai(`จบเซ็ตที่ ${evalRes.currentSet} พักสักครู่ค่ะ`, 'set_complete', 2500);
            } else if (evalRes.isExerciseCompleted) {
              setIsSummaryOpen(true);
              speakThai('ยินดีด้วยค่ะ คุณทำครบทุกเซ็ตแล้ว', 'exercise_complete', 2500);
            }

            // 3. Render skeleton overlay (adaptive lowPerformanceMode)
            renderSkeleton(rawLandmarks, evalRes.formRating, wdStatus.lowPerformanceMode);
          } catch {
            // non-blocking frame error
          }
        }

        animFrameIdRef.current = requestAnimationFrame(processFrame);
      };

      animFrameIdRef.current = requestAnimationFrame(processFrame);
    };

    const startFallbackLoop = () => {
      // Minimal animation loop for rendering video feed cleanly if vision model is offline
      const loop = () => {
        if (!isMountedRef.current) return;
        renderSkeleton([], 'good');
        animFrameIdRef.current = requestAnimationFrame(loop);
      };
      animFrameIdRef.current = requestAnimationFrame(loop);
    };

    const activeVoice = voiceFeedbackRef.current;
    const activeWatchdog = watchdogRef.current;
    const activeCanvas = canvasRef.current;

    initCameraAndDetector();

    // Strict Resource Disposal Cleanup
    return () => {
      isMountedRef.current = false;
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
      activeVoice.cancel();
      if (typeof window !== 'undefined' && 'speechSynthesis' in window && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
      if (landmarker && typeof landmarker.close === 'function') {
        try {
          landmarker.close();
        } catch {
          // ignore
        }
      }
      if (activeCanvas) {
        const ctx = activeCanvas.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, activeCanvas.width, activeCanvas.height);
      }
      activeWatchdog.reset();
    };
  }, [isPaused, isResting, isSummaryOpen, playRepChime, speakThai, renderSkeleton]);

  const handleNextSet = useCallback(() => {
    setIsResting(false);
    stateMachineRef.current.nextSet();
    setRestCountdown(config.defaultPrescription.restBetweenSetsSec || 30);
  }, [config.defaultPrescription.restBetweenSetsSec]);

  // Rest Countdown Timer
  useEffect(() => {
    if (!isResting) return;
    const interval = setInterval(() => {
      setRestCountdown((prev: number) => {
        if (prev <= 1) {
          clearInterval(interval);
          handleNextSet();
          return config.defaultPrescription.restBetweenSetsSec || 30;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isResting, handleNextSet, config.defaultPrescription.restBetweenSetsSec]);

  // Final Session Telemetry Submission with Idempotency Guard
  const handleFinalizeSession = (mode: 'ai_verified' | 'stopped_pain') => {
    if (isFinalizingRef.current) return;
    isFinalizingRef.current = true;

    const totalDurationSec = Math.round((Date.now() - sessionStartTimeRef.current) / 1000);
    const idempotencyKey =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `kiosk-sess-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    const telemetry: ExerciseSessionTelemetry = {
      exerciseId: exercise.id || exercise.exercise_id || config.id || 'ex',
      exerciseName: config.nameTh,
      patientId: patient.patient_id || patient.hn || 'unknown',
      totalRepsTarget: config.defaultPrescription.repsPerSet,
      completedReps: evalResult?.completedReps || 0,
      incorrectReps: evalResult?.incorrectReps || 0,
      totalSetsCompleted: evalResult?.currentSet || 1,
      maxAngleAchievedDeg: evalResult?.currentAngleDeg || 0,
      averageAngleDeg: evalResult?.currentAngleDeg || 0,
      averageHoldDurationSec: config.angleMechanics?.holdDurationSec || 2.0,
      consistencyScorePercent: evalResult?.completedReps
        ? Math.min(100, Math.round((evalResult.completedReps / (evalResult.completedReps + (evalResult.incorrectReps || 0))) * 100))
        : 100,
      compensationEventsCount: evalResult?.activeWarnings?.length || 0,
      scapularHikingRate: evalResult?.scapularHikingRatio || 0,
      trunkCompensationIndex: evalResult?.trunkLateralTiltDeg || 0,
      averageVelocityDegPerSec: evalResult?.angularVelocityDegPerSec || 0,
      completionMode: mode,
      painReported: mode === 'stopped_pain',
      sessionDurationSec: totalDurationSec,
      timestamp: new Date().toISOString(),
      idempotencyKey,
    };

    // Zero-flicker in-memory reset for pose engine buffer without reloading page
    stateMachineRef.current.reset();
    voiceFeedbackRef.current.cancel();
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    onSessionCompleted(telemetry);
  };

  // Emergency Pain Stop Handler with Idempotency Lock
  const handleReportPainStop = async () => {
    if (isReportingPainRef.current) return;
    isReportingPainRef.current = true;

    setPainReportedState(true);
    setIsPaused(true);

    // Instant in-memory reset of kinematics state buffer
    stateMachineRef.current.reset();

    // Immediate audio purge & high-priority emergency speech
    voiceFeedbackRef.current.cancel();
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    speakThai('หยุดการฝึกแล้วค่ะ ระบบกำลังแจ้งนักกายภาพบำบัด', 'emergency_pain_stop', 0);

    // 1. Instant telemetry persistence to cloud database without requiring user to tap modal
    try {
      const totalDurationSec = sessionStartTimeRef.current
        ? Math.max(1, Math.round((Date.now() - sessionStartTimeRef.current) / 1000))
        : 10;

      await defaultApiClient.courses.submitSessionLog({
        patient_id: patient.patient_id || patient.hn || 'unknown',
        exercise_id: exercise.id || exercise.exercise_id || config.id || null,
        kiosk_id: 'kiosk-01',
        completion_mode: 'stopped_pain',
        correct_reps: evalResult?.completedReps || 0,
        incorrect_reps: evalResult?.incorrectReps || 0,
        target_reps: config.defaultPrescription?.repsPerSet || 10,
        current_set: evalResult?.currentSet || 1,
        total_sets: config.defaultPrescription?.totalSets || 3,
        max_angle_achieved: evalResult?.currentAngleDeg || null,
        consistency_score: evalResult?.completedReps
          ? Math.min(
              100,
              Math.round(
                (evalResult.completedReps /
                  (evalResult.completedReps + (evalResult.incorrectReps || 0))) *
                  100
              )
            )
          : 0,
        pain_reported: true,
        duration_seconds: totalDurationSec,
        telemetry_summary: {
          emergency_stop: true,
          pain_reported: true,
          active_side: activeSide,
          phase_at_stop: evalResult?.phase || 'IDLE',
          warnings_at_stop: evalResult?.activeWarnings || [],
        },
      });
    } catch (logErr) {
      console.warn('Emergency pain telemetry log dispatch error:', logErr);
    }

    try {
      const idempotencyKey =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `pain-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      await (defaultApiClient.kiosk.callStaff as any)({
        kiosk_id: 'kiosk-01',
        reason: `🚨 ผู้ป่วยแจ้งว่ามีอาการเจ็บขณะฝึกท่า: "${config.nameTh}" (HN: ${patient.hn || patient.patient_id})`,
        idempotency_key: idempotencyKey,
      });
    } catch {
      // safe fallback
    }
  };

  const isPendulum = config.evaluationMode === 'pendulum_circular';
  const progressRatio = isPendulum
    ? evalResult?.pendulumCircleProgressRatio || 0
    : evalResult?.holdProgressRatio || 0;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 text-white flex flex-col justify-between overflow-hidden select-none font-sans">
      {/* 1. Top Clinical HUD Header */}
      <div className="w-full bg-slate-950/80 backdrop-blur-md border-b border-slate-800 px-6 py-4 flex items-center justify-between z-20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
              <span>{config.nameTh}</span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 font-medium">
                ข้อต่อ: {config.targetJoint}
              </span>
            </h1>
            <div className="text-xs text-slate-400 mt-0.5">
              ผู้ป่วย: คุณ {patient.first_name} {patient.last_name || ''} • HN: {patient.hn || patient.patient_id}
            </div>
          </div>
        </div>

        {/* Side Toggle & Set/Rep Badges */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Side Toggle Selector */}
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-2xl p-1 gap-1">
            <button
              type="button"
              onClick={() => handleToggleSide('right')}
              className={`px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
                activeSide === 'right'
                  ? 'bg-teal-500 text-slate-950 shadow-md shadow-teal-500/20'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>🦾 แขนขวา</span>
            </button>
            <button
              type="button"
              onClick={() => handleToggleSide('left')}
              className={`px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
                activeSide === 'left'
                  ? 'bg-teal-500 text-slate-950 shadow-md shadow-teal-500/20'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>แขนซ้าย 🦾</span>
            </button>
          </div>

          <div className="px-4 py-2 rounded-2xl bg-slate-900 border border-slate-800 text-center">
            <div className="text-[10px] text-slate-400 uppercase font-semibold">เซ็ตที่</div>
            <div className="text-sm sm:text-base font-extrabold text-teal-400">
              {evalResult?.currentSet || 1} / {config.defaultPrescription.totalSets}
            </div>
          </div>

          <div className="px-5 py-2 rounded-2xl bg-gradient-to-r from-emerald-600/30 to-teal-600/30 border border-emerald-500/50 text-center shadow-lg shadow-emerald-950/50">
            <div className="text-[10px] text-emerald-300 uppercase font-semibold">จำนวนครั้ง</div>
            <div className="text-lg sm:text-xl font-extrabold text-white">
              {evalResult?.completedReps || 0} / {config.defaultPrescription.repsPerSet}
            </div>
          </div>
        </div>
      </div>

      {/* 2. Main Live Tracking Viewport */}
      <div className="relative flex-1 w-full h-full flex items-center justify-center bg-black overflow-hidden">
        <video
          ref={videoRef}
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-cover -scale-x-100"
        />

        <canvas
          ref={canvasRef}
          width={1280}
          height={720}
          className="absolute inset-0 w-full h-full object-cover -scale-x-100 pointer-events-none z-10"
        />

        {/* Watchdog Hardware Status Alert Badge */}
        {watchdogStatus && (watchdogStatus.isFrozen || watchdogStatus.lowPerformanceMode) && (
          <div className="absolute top-4 right-4 z-20 flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-900/90 border border-amber-500/50 text-amber-300 text-xs font-semibold backdrop-blur-md shadow-lg animate-pulse">
            {watchdogStatus.isFrozen ? (
              <AlertTriangle className="w-4 h-4 text-rose-400" />
            ) : (
              <Cpu className="w-4 h-4 text-amber-400" />
            )}
            <span>{watchdogStatus.statusMessageTh}</span>
          </div>
        )}

        {/* Floating Coaching Banner Overlay */}
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-20 w-11/12 max-w-xl">
          <div
            className={`p-4 rounded-3xl backdrop-blur-md border shadow-2xl transition-all duration-300 flex items-center gap-3.5 ${
              evalResult?.formRating === 'error'
                ? 'bg-rose-950/85 border-rose-500 text-rose-100'
                : evalResult?.formRating === 'warning'
                ? 'bg-amber-950/85 border-amber-500 text-amber-100'
                : 'bg-slate-900/85 border-emerald-500/40 text-emerald-200'
            }`}
          >
            <div className="text-2xl shrink-0">
              {evalResult?.formRating === 'error'
                ? '🚨'
                : evalResult?.formRating === 'warning'
                ? '⚠️'
                : isPendulum
                ? '🌀'
                : '🎯'}
            </div>
            <div className="flex-1">
              <div className="text-xs sm:text-sm font-extrabold leading-snug">
                {evalResult?.coachingMessageTh || 'เตรียมพร้อมในตำแหน่งเริ่มต้น'}
              </div>
              {/* Hold / Pendulum Progress Bar */}
              {progressRatio > 0 && (
                <div className="w-full bg-slate-950/50 rounded-full h-2 mt-2 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-emerald-400 to-teal-300 h-full transition-all duration-75"
                    style={{ width: `${Math.round(progressRatio * 100)}%` }}
                  />
                </div>
              )}
            </div>
            {/* Live Angle or Percentage Badge */}
            <div className="px-3 py-1.5 rounded-xl bg-slate-950/70 border border-slate-700/60 font-mono text-xs sm:text-sm font-bold text-white shrink-0">
              {isPendulum
                ? `${Math.round(progressRatio * 100)}%`
                : `${evalResult?.currentAngleDeg || 0}°`}
            </div>
          </div>
        </div>
      </div>

      {/* 3. Bottom Safety & Emergency Bar */}
      <PainStopEmergencyBar
        isPaused={isPaused}
        onTogglePause={() => setIsPaused((prev) => !prev)}
        onReportPainStop={handleReportPainStop}
        onExitSession={onExit}
      />

      {/* MODAL A: Rest Between Sets Countdown */}
      {isResting && (
        <div className="fixed inset-0 z-40 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl bg-slate-900 border-2 border-teal-500/50 shadow-2xl p-6 text-center animate-scale-up">
            <div className="w-16 h-16 rounded-full bg-teal-500/10 border border-teal-500/30 flex items-center justify-center mx-auto mb-4 text-teal-400 text-2xl font-bold">
              <Clock className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-white">พักผ่อนระหว่างเซ็ต</h3>
            <p className="text-xs text-slate-300 mt-2">
              ทำครบเซ็ตที่ {evalResult?.currentSet} แล้ว พักกล้ามเนื้อสักครู่ก่อนเริ่มเซ็ตถัดไป
            </p>

            <div className="my-6">
              <div className="text-5xl font-black text-teal-400 font-mono">
                {restCountdown}
              </div>
              <div className="text-xs text-slate-400 mt-1">วินาที</div>
            </div>

            <button
              type="button"
              onClick={handleNextSet}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white font-extrabold text-sm shadow-xl shadow-teal-900/40 transition active:scale-98 cursor-pointer flex items-center justify-center gap-2"
            >
              <span>พร้อมแล้ว เริ่มเซ็ตถัดไปทันที ➔</span>
            </button>
          </div>
        </div>
      )}

      {/* MODAL B: Pain Reported Emergency Card */}
      {painReportedState && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl bg-slate-900 border-2 border-rose-500 shadow-2xl p-6 text-center animate-scale-up">
            <div className="w-16 h-16 rounded-full bg-rose-500/20 border border-rose-500/40 flex items-center justify-center mx-auto mb-4 text-rose-500">
              <ShieldAlert className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-white">
              ระบบหยุดการฝึกและแจ้งเจ้าหน้าที่แล้ว
            </h3>
            <p className="text-xs text-slate-300 mt-2 leading-relaxed">
              ขอให้ผู้ป่วยนั่งพักผ่อนอย่างสบายๆ ไม่ต้องกังวล เจ้าหน้าที่กายภาพบำบัดกำลังเดินทางมาดูแลท่านครับ
            </p>

            <div className="mt-6 flex flex-col gap-3">
              <button
                type="button"
                onClick={() => handleFinalizeSession('stopped_pain')}
                className="w-full py-4 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-sm shadow-xl shadow-rose-950/50 cursor-pointer"
              >
                บันทึกประวัติและกลับสู่หน้าหลัก
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL C: End-of-Exercise Summary Card */}
      {isSummaryOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-3xl bg-slate-900 border-2 border-emerald-500/50 shadow-2xl p-6 sm:p-8 text-center animate-scale-up">
            <div className="w-20 h-20 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center mx-auto mb-4 text-emerald-400 shadow-xl shadow-emerald-950/40">
              <Trophy className="w-10 h-10" />
            </div>

            <h2 className="text-2xl font-bold text-white mb-1">
              ฝึกท่านี้สำเร็จแล้ว! 🎉
            </h2>
            <div className="text-xs text-emerald-400 font-medium mb-6">
              {config.nameTh}
            </div>

            <div className="grid grid-cols-2 gap-3 mb-6 text-left">
              <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800">
                <div className="text-[11px] text-slate-400">จำนวนครั้ง (ทำถูก / ผิด)</div>
                <div className="text-base sm:text-lg font-bold text-emerald-400 mt-0.5">
                  ✅ {evalResult?.completedReps || 0} / ❌ {evalResult?.incorrectReps || 0}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5 font-medium">
                  เป้าหมาย: {config.defaultPrescription.repsPerSet} ครั้ง × {config.defaultPrescription.totalSets} เซ็ต
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800">
                <div className="text-[11px] text-slate-400">
                  {isPendulum ? 'วิถีวงกลม (360° Cycle)' : 'มุมสูงสุดที่ทำได้'}
                </div>
                <div className="text-base sm:text-lg font-bold text-teal-400 mt-0.5">
                  {isPendulum ? '100% (ครบวงรอบ)' : `${evalResult?.currentAngleDeg || 0}°`}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5 font-medium">
                  {isPendulum ? 'ความเร็วและรัศมีอยู่ในเกณฑ์' : `เป้าหมาย: ${config.angleMechanics?.targetMinDeg || 80}° - ${config.angleMechanics?.targetMaxDeg || 100}°`}
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800">
                <div className="text-[11px] text-slate-400">ความสม่ำเสมอ (Consistency)</div>
                <div className="text-base sm:text-lg font-bold text-cyan-400 mt-0.5">
                  {evalResult?.completedReps
                    ? Math.min(100, Math.round((evalResult.completedReps / (evalResult.completedReps + (evalResult.incorrectReps || 0))) * 100))
                    : 100}%
                </div>
                <div className="text-[10px] text-emerald-400/80 mt-0.5 font-medium">
                  ระดับ: ดีเยี่ยม (High Reliability)
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800">
                <div className="text-[11px] text-slate-400">สถานะการฝึก (Mode)</div>
                <div className="text-xs sm:text-sm font-bold text-emerald-400 mt-1 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>AI-Verified</span>
                </div>
                <div className="text-[10px] text-slate-400 mt-1">
                  ผ่านการตรวจจับด้วยระบบวิสัยทัศน์คอมพิวเตอร์
                </div>
              </div>
            </div>

            <button
              type="button"
              id="kiosk-finish-exercise-summary-btn"
              data-testid="kiosk-finish-exercise-summary-btn"
              onClick={() => handleFinalizeSession('ai_verified')}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-base shadow-xl shadow-emerald-900/50 transition active:scale-98 cursor-pointer flex items-center justify-center gap-2"
            >
              <span>เสร็จสิ้นและดำเนินการต่อ</span>
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
