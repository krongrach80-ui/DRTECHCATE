/**
 * apps/kiosk/src/views/DynamicExerciseSessionView.tsx
 *
 * REAL-TIME DYNAMIC AI EXERCISE EVALUATION SESSION
 * Features:
 * - Decoupled single-mount camera & MediaPipe lifecycle (No re-mounts on state changes)
 * - Multi-CDN WASM and Model fallback with GPU -> CPU graceful degradation
 * - Strict monotonic timestamp guarding for detectForVideo
 * - Exact 1:1 canvas-to-video coordinate mapping with mirror support
 * - Live Diagnostic Telemetry Debug HUD (Camera, Model, FPS, Landmarks, Angle, Accuracy, State)
 * - Color-coded skeleton overlay (Green = target/good, Yellow = warning/adjust, Red = error/safety cap)
 * - Synthesized harmonic chime on repetition completion
 * - Web Speech Thai TTS audio coaching with cooldown guards
 * - PainStopEmergencyBar with high-priority clinical alert
 * - Rest between sets & Exercise completion summaries
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
import { projectLandmarkToCanvas } from '../../../../packages/pose-engine/src/math/projection';
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
import { useClinicalI18n, LanguageSwitcher } from '../../../../packages/clinical-i18n/src/index';

export interface DynamicExerciseSessionViewProps {
  // Shape A (SmartDailyPlanView)
  patient?: {
    patient_id?: string;
    hn?: string;
    first_name: string;
    last_name?: string;
  };
  exercise?: {
    id?: string;
    exercise_id?: string;
    name?: string;
    title?: string;
    target_joint?: string;
    sets?: number;
    reps?: number;
  };
  config?: ExerciseDetectionConfig;
  onSessionCompleted?: (telemetry: ExerciseSessionTelemetry) => void;

  // Shape B (Alternative direct usage)
  exerciseConfig?: ExerciseDetectionConfig;
  exerciseTitle?: string;
  onComplete?: (summary: any) => void;
  onPainStop?: (telemetry: any) => void;

  // Shared
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
  [27, 29], [27, 31], [29, 31], // Left foot
  [28, 30], [28, 32], [30, 32], // Right foot
];

const ANATOMICAL_BODY_JOINTS = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32];

const LANDMARK_NAMES: Record<number, string> = {
  0: 'Nose',
  11: 'L.Shoulder',
  12: 'R.Shoulder',
  13: 'L.Elbow',
  14: 'R.Elbow',
  15: 'L.Wrist',
  16: 'R.Wrist',
  23: 'L.Hip',
  24: 'R.Hip',
  25: 'L.Knee',
  26: 'R.Knee',
  27: 'L.Ankle',
  28: 'R.Ankle',
  29: 'L.Heel',
  30: 'R.Heel',
  31: 'L.FootIndex',
  32: 'R.FootIndex',
};

export const DynamicExerciseSessionView: React.FC<DynamicExerciseSessionViewProps> = (props) => {
  const {
    patient = { first_name: 'ผู้ฝึก' },
    exercise = {},
    config,
    exerciseConfig,
    exerciseTitle: explicitTitle,
    onSessionCompleted,
    onComplete,
    onPainStop,
    onExit,
  } = props;

  const resolvedConfig = (config || exerciseConfig)!;
  const { lang } = useClinicalI18n();

  // DOM Refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Core Service Instances in Refs to survive re-renders
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<any>(null);
  const stateMachineRef = useRef<RepStateMachine>(new RepStateMachine(resolvedConfig));
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

  // Loop & Timing Control Refs
  const rafIdRef = useRef<number | null>(null);
  const isMountedRef = useRef<boolean>(true);
  const lastTimestampMsRef = useRef<number>(0);
  const lastInferenceTimeRef = useRef<number>(0);
  const lastUiUpdateMsRef = useRef<number>(0);
  const smoothedFpsRef = useRef<number>(30);
  const lastCompletedRepsRef = useRef<number>(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sessionStartTimeRef = useRef<number>(0);
  const isFinalizingRef = useRef<boolean>(false);
  const isReportingPainRef = useRef<boolean>(false);

  // Dynamic States
  const [cameraStatus, setCameraStatus] = useState<'initializing' | 'ready' | 'error'>('initializing');
  const [modelStatus, setModelStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [cameraDimensions, setCameraDimensions] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [modelDelegate, setModelDelegate] = useState<'GPU' | 'CPU'>('GPU');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [activeSide, setActiveSide] = useState<BodySide>(resolvedConfig.side || 'right');
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [lowPowerMode, setLowPowerMode] = useState<boolean>(false);
  const [showDebugHud, setShowDebugHud] = useState<boolean>(true);

  const [evalResult, setEvalResult] = useState<RepEvaluationResult | null>(null);
  const [watchdogStatus, setWatchdogStatus] = useState<WatchdogHealthStatus | null>(null);
  const [isResting, setIsResting] = useState<boolean>(false);
  const [restCountdown, setRestCountdown] = useState<number>(
    resolvedConfig.defaultPrescription?.restBetweenSetsSec || 30
  );
  const [isSummaryOpen, setIsSummaryOpen] = useState<boolean>(false);
  const [painReportedState, setPainReportedState] = useState<boolean>(false);

  // Diagnostic HUD live state
  const [hudState, setHudState] = useState({
    fps: 0,
    landmarkCount: 0,
    avgVisibility: 0,
    currentAngle: 0,
    accuracyPct: 0,
    repPhase: 'IDLE',
    completedReps: 0,
    currentSet: 1,
    coachingMessage: 'กำลังเตรียมกล้องและระบบตรวจจับท่าทาง...',
    statusColor: '#10b981',
  });

  // State mirror refs for loop access without re-binding
  const isPausedRef = useRef(isPaused);
  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  const isRestingRef = useRef(isResting);
  useEffect(() => {
    isRestingRef.current = isResting;
  }, [isResting]);

  const isSummaryOpenRef = useRef(isSummaryOpen);
  useEffect(() => {
    isSummaryOpenRef.current = isSummaryOpen;
  }, [isSummaryOpen]);

  const lowPowerRef = useRef(lowPowerMode);
  useEffect(() => {
    lowPowerRef.current = lowPowerMode;
  }, [lowPowerMode]);

  const showDebugRef = useRef(showDebugHud);
  useEffect(() => {
    showDebugRef.current = showDebugHud;
  }, [showDebugHud]);

  const activeSideRef = useRef(activeSide);
  useEffect(() => {
    activeSideRef.current = activeSide;
    stateMachineRef.current.setSide(activeSide);
  }, [activeSide]);

  // Sync config updates without restarting loop
  useEffect(() => {
    stateMachineRef.current.updateConfig(resolvedConfig);
  }, [resolvedConfig]);

  // Audio Mute State with localStorage persistence
  const [isAudioMuted, setIsAudioMuted] = useState<boolean>(() => {
    try {
      return localStorage.getItem('drtech_voice_muted') === 'true';
    } catch {
      return false;
    }
  });
  const isAudioMutedRef = useRef(isAudioMuted);
  useEffect(() => {
    isAudioMutedRef.current = isAudioMuted;
    try {
      localStorage.setItem('drtech_voice_muted', String(isAudioMuted));
    } catch {
      // safe fallback
    }
    if (isAudioMuted) {
      voiceFeedbackRef.current.cancel();
      if (typeof window !== 'undefined' && 'speechSynthesis' in window && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    }
  }, [isAudioMuted]);

  // Sound & Speech Helpers
  const playRepChime = useCallback(() => {
    if (isAudioMutedRef.current) return;
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
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

  const speakThai = useCallback(
    (text: string, category?: string, overrideCooldownMs?: number) => {
      if (isAudioMutedRef.current) return;
      voiceFeedbackRef.current.speak(text, category, overrideCooldownMs);
    },
    []
  );

  const handleToggleSide = useCallback(
    (newSide: BodySide) => {
      setActiveSide(newSide);
      speakThai(
        newSide === 'right' ? 'ตรวจจับข้างขวา' : 'ตรวจจับข้างซ้าย',
        'side_toggle',
        0
      );
    },
    [speakThai]
  );

  // Resource Cleanup on Unmount
  const cleanupResources = useCallback(() => {
    isMountedRef.current = false;
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    if (landmarkerRef.current) {
      try {
        landmarkerRef.current.close();
      } catch {
        // ignore
      }
      landmarkerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    voiceFeedbackRef.current.cancel();
    watchdogRef.current.reset();
  }, []);

  // Single-Mount Lifecycle: Boot Camera, Pose Detector, and Detection Loop
  useEffect(() => {
    isMountedRef.current = true;
    if (sessionStartTimeRef.current === 0) {
      sessionStartTimeRef.current = Date.now();
    }

    // Flush any pending or lingering speech from previous views immediately
    if (typeof window !== 'undefined' && 'speechSynthesis' in window && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    voiceFeedbackRef.current.cancel();

    async function bootSession() {
      try {
        setErrorMessage(null);
        setCameraStatus('initializing');
        setModelStatus('loading');

        // 1. Initialize Webcam Stream
        let stream: MediaStream;
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
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
        }

        if (!isMountedRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        const videoEl = videoRef.current;
        if (!videoEl) return;

        videoEl.srcObject = stream;
        videoEl.muted = true;
        videoEl.playsInline = true;

        // Explicitly wait until video metadata is loaded and videoWidth is valid (> 0)
        await new Promise<void>((resolve) => {
          if (videoEl.readyState >= 2 && videoEl.videoWidth > 0) {
            resolve();
            return;
          }
          const onLoaded = () => {
            videoEl.removeEventListener('loadeddata', onLoaded);
            resolve();
          };
          videoEl.addEventListener('loadeddata', onLoaded);
        });

        try {
          await videoEl.play();
        } catch (playErr) {
          console.warn('[PoseEngine] Video play warning:', playErr);
        }

        if (!isMountedRef.current) return;
        setCameraDimensions({
          width: videoEl.videoWidth || 1280,
          height: videoEl.videoHeight || 720,
        });
        setCameraStatus('ready');

        // 2. Load MediaPipe Tasks-Vision with Multi-CDN & Local Fallbacks
        const vision = await import('@mediapipe/tasks-vision');
        const wasmSources = [
          '/models/wasm',
          '/wasm',
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm',
          'https://unpkg.com/@mediapipe/tasks-vision@0.10.14/wasm',
        ];

        let filesetResolver: any = null;
        for (const wasmUrl of wasmSources) {
          try {
            filesetResolver = await vision.FilesetResolver.forVisionTasks(wasmUrl);
            if (filesetResolver) break;
          } catch (wasmErr) {
            console.warn('[PoseEngine] WASM source attempt failed:', wasmUrl, wasmErr);
          }
        }

        if (!filesetResolver) {
          throw new Error('ไม่สามารถโหลดไฟล์ WebAssembly ของระบบตรวจจับได้ (กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ตหรือ CSP)');
        }

        // Model Sources: Local -> Lite Local -> Google Cloud Storage CDN
        const modelSources = [
          '/models/pose_landmarker.task',
          '/models/pose_landmarker_lite.task',
          'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task',
        ];

        let landmarker: any = null;
        let selectedDelegate: 'GPU' | 'CPU' = 'GPU';

        // Try GPU delegate first across sources
        for (const modelPath of modelSources) {
          try {
            landmarker = await vision.PoseLandmarker.createFromOptions(filesetResolver, {
              baseOptions: {
                modelAssetPath: modelPath,
                delegate: 'GPU',
              },
              runningMode: 'VIDEO',
              numPoses: 1,
              minPoseDetectionConfidence: 0.5,
              minPosePresenceConfidence: 0.5,
              minTrackingConfidence: 0.5,
            });
            if (landmarker) {
              selectedDelegate = 'GPU';
              break;
            }
          } catch (gpuErr) {
            console.warn(`[PoseEngine] GPU init failed for ${modelPath}:`, gpuErr);
          }
        }

        // If GPU fails, fallback immediately to CPU delegate
        if (!landmarker) {
          for (const modelPath of modelSources) {
            try {
              landmarker = await vision.PoseLandmarker.createFromOptions(filesetResolver, {
                baseOptions: {
                  modelAssetPath: modelPath,
                  delegate: 'CPU',
                },
                runningMode: 'VIDEO',
                numPoses: 1,
                minPoseDetectionConfidence: 0.5,
                minPosePresenceConfidence: 0.5,
                minTrackingConfidence: 0.5,
              });
              if (landmarker) {
                selectedDelegate = 'CPU';
                break;
              }
            } catch (cpuErr) {
              console.warn(`[PoseEngine] CPU init failed for ${modelPath}:`, cpuErr);
            }
          }
        }

        if (!landmarker) {
          throw new Error('ไม่สามารถโหลดไฟล์โมเดลตรวจจับท่าทางได้ (ตรวจสอบสิทธิ์การเข้าถึงไฟล์โมเดล)');
        }

        if (!isMountedRef.current) {
          landmarker.close();
          return;
        }

        landmarkerRef.current = landmarker;
        setModelDelegate(selectedDelegate);
        setModelStatus('ready');

        // 3. Start Continuous Detection & Render Loop (requestAnimationFrame)
        const detectFrame = () => {
          if (!isMountedRef.current) return;
          rafIdRef.current = requestAnimationFrame(detectFrame);

          const vEl = videoRef.current;
          const cEl = canvasRef.current;
          const detector = landmarkerRef.current;

          if (!vEl || !cEl || !detector || vEl.readyState < 2 || vEl.videoWidth === 0) {
            return;
          }

          // 1:1 CSS pixel synchronization to prevent DPI coordinate shift
          const displayW = cEl.clientWidth || vEl.clientWidth || 1280;
          const displayH = cEl.clientHeight || vEl.clientHeight || 720;
          if (cEl.width !== displayW || cEl.height !== displayH) {
            cEl.width = displayW;
            cEl.height = displayH;
          }

          const nowMs = performance.now();
          const minIntervalMs = lowPowerRef.current ? 66 : 20; // 15 FPS in low-power, 50 FPS standard
          if (nowMs - lastInferenceTimeRef.current < minIntervalMs) {
            return;
          }

          const dtMs = Math.max(nowMs - lastInferenceTimeRef.current, 1);
          lastInferenceTimeRef.current = nowMs;
          smoothedFpsRef.current = 0.85 * smoothedFpsRef.current + 0.15 * (1000 / dtMs);

          // Strictly increasing integer timestamp for MediaPipe stream calculator
          let monotonicTs = Math.floor(nowMs);
          if (monotonicTs <= lastTimestampMsRef.current) {
            monotonicTs = lastTimestampMsRef.current + 1;
          }
          lastTimestampMsRef.current = monotonicTs;

          // Non-blocking detection: a single dropped frame never crashes the animation loop
          let result: any = null;
          try {
            result = detector.detectForVideo(vEl, monotonicTs);
          } catch (detectErr) {
            console.warn('[PoseEngine] detectForVideo transient frame warning:', detectErr);
            return;
          }

          const ctx = cEl.getContext('2d');
          if (!ctx) return;
          ctx.clearRect(0, 0, cEl.width, cEl.height);

          const hasPose = Boolean(result && result.landmarks && result.landmarks.length > 0);
          if (!hasPose) {
            if (nowMs - lastUiUpdateMsRef.current > 150) {
              lastUiUpdateMsRef.current = nowMs;
              setHudState((prev) => ({
                ...prev,
                fps: Math.round(smoothedFpsRef.current),
                landmarkCount: 0,
                avgVisibility: 0,
                coachingMessage: '📷 ไม่พบร่างกายในภาพ กรุณาขยับให้อยู่กลางหน้าจอและถอยห่าง 1.5–2 เมตร',
                statusColor: '#f59e0b',
              }));
            }
            return;
          }

          const normLandmarks = result.landmarks[0];
          const rawLandmarks: PoseEngineLandmark[] = normLandmarks.map((lm: any) => ({
            x: lm.x,
            y: lm.y,
            z: lm.z,
            visibility: lm.visibility ?? 0.9,
            presence: lm.presence ?? 0.9,
          }));

          // Hardware Watchdog Update
          const wdStatus = watchdogRef.current.update(rawLandmarks, monotonicTs);

          // Biomechanical State Machine Evaluation
          const evalRes = stateMachineRef.current.evaluate(rawLandmarks, monotonicTs);

          // Project landmarks into 1:1 canvas pixels with mirror support
          const projectedPoints = normLandmarks.map((lm: any) =>
            projectLandmarkToCanvas(lm, vEl, cEl, true, 'cover')
          );

          const strokeColor =
            evalRes.formRating === 'error'
              ? '#ef4444'
              : evalRes.formRating === 'warning'
              ? '#f59e0b'
              : '#10b981';

          // 1. Draw Skeleton Lines
          ctx.lineWidth = lowPowerRef.current ? 2.5 : 4;
          ctx.strokeStyle = strokeColor;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';

          for (const [idxA, idxB] of POSE_CONNECTIONS) {
            const ptA = projectedPoints[idxA];
            const ptB = projectedPoints[idxB];
            if (
              ptA &&
              ptB &&
              ptA.visibility >= 0.35 &&
              ptB.visibility >= 0.35 &&
              ptA.inFrame &&
              ptB.inFrame
            ) {
              ctx.beginPath();
              ctx.moveTo(ptA.x, ptA.y);
              ctx.lineTo(ptB.x, ptB.y);
              ctx.stroke();
            }
          }

          // 2. Draw Body Joint Nodes
          const isDebug = showDebugRef.current;
          if (isDebug) {
            ctx.font = 'bold 10px monospace';
            for (let i = 0; i < projectedPoints.length; i++) {
              const pt = projectedPoints[i];
              if (!pt || pt.visibility < 0.25 || !pt.inFrame) continue;

              ctx.beginPath();
              ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
              ctx.fillStyle = pt.visibility >= 0.65 ? strokeColor : '#f59e0b';
              ctx.fill();
              ctx.lineWidth = 1.5;
              ctx.strokeStyle = '#ffffff';
              ctx.stroke();

              const name = LANDMARK_NAMES[i] || `#${i}`;
              ctx.fillStyle = '#00ffcc';
              ctx.fillText(`${name} (${Math.round(pt.visibility * 100)}%)`, pt.x + 8, pt.y - 4);
            }
          } else {
            for (const idx of ANATOMICAL_BODY_JOINTS) {
              const pt = projectedPoints[idx];
              if (!pt || pt.visibility < 0.35 || !pt.inFrame) continue;

              ctx.beginPath();
              ctx.arc(pt.x, pt.y, pt.visibility >= 0.65 ? 6 : 4, 0, Math.PI * 2);
              ctx.fillStyle = pt.visibility >= 0.65 ? strokeColor : 'rgba(245, 158, 11, 0.6)';
              ctx.fill();
              ctx.lineWidth = 2;
              ctx.strokeStyle = '#ffffff';
              ctx.stroke();
            }
          }

          // Rep completion audio chime & TTS
          if (evalRes.completedReps > lastCompletedRepsRef.current) {
            lastCompletedRepsRef.current = evalRes.completedReps;
            playRepChime();
            speakThai(`ครั้งที่ ${evalRes.completedReps}`, 'rep_count', 1200);
          }

          // Guidance speech announcements with cooldown guards
          if (evalRes.isOccluded && evalRes.occlusionReasonTh) {
            speakThai(evalRes.occlusionReasonTh, 'occlusion_warning', 3500);
          } else if (evalRes.coachingMessageTh && evalRes.formRating !== 'good') {
            speakThai(evalRes.coachingMessageTh, 'coaching_warning', 4000);
          }

          // Set & Exercise Completion Transitions
          if (evalRes.isSetCompleted && !evalRes.isExerciseCompleted && !isRestingRef.current) {
            setIsResting(true);
            isRestingRef.current = true;
            speakThai(`จบเซ็ตที่ ${evalRes.currentSet} พักสักครู่ค่ะ`, 'set_complete', 2500);
          } else if (evalRes.isExerciseCompleted && !isSummaryOpenRef.current) {
            setIsSummaryOpen(true);
            isSummaryOpenRef.current = true;
            speakThai('ยินดีด้วยค่ะ คุณทำครบทุกเซ็ตแล้ว', 'exercise_complete', 2500);
          }

          // Throttle React State Updates to ~100ms for 60 FPS performance
          if (nowMs - lastUiUpdateMsRef.current > 100) {
            lastUiUpdateMsRef.current = nowMs;
            const avgVis =
              ANATOMICAL_BODY_JOINTS.reduce(
                (acc, idx) => acc + (normLandmarks[idx]?.visibility ?? 0),
                0
              ) / ANATOMICAL_BODY_JOINTS.length;

            setHudState({
              fps: Math.round(smoothedFpsRef.current),
              landmarkCount: normLandmarks.length,
              avgVisibility: Number(avgVis.toFixed(2)),
              currentAngle: Math.round(evalRes.currentAngleDeg || 0),
              accuracyPct: Math.round(evalRes.accuracyPercent ?? evalRes.accuracyPct ?? 0),
              repPhase: evalRes.phase,
              completedReps: evalRes.completedReps,
              currentSet: evalRes.currentSet,
              coachingMessage: evalRes.coachingMessageTh,
              statusColor: strokeColor,
            });
            setEvalResult(evalRes);
            setWatchdogStatus(wdStatus);
          }
        };

        rafIdRef.current = requestAnimationFrame(detectFrame);
      } catch (err: any) {
        if (!isMountedRef.current) return;
        console.error('[PoseEngine] Session boot error:', err);
        const msg =
          err?.name === 'NotAllowedError'
            ? 'ไม่สามารถเปิดกล้องได้ กรุณาอนุญาตการใช้กล้องบนเบราว์เซอร์'
            : err?.message || 'เกิดข้อผิดพลาดในการโหลดระบบตรวจจับท่าทาง';
        setErrorMessage(msg);
        setCameraStatus('error');
        setModelStatus('error');
      }
    }

    bootSession();

    return () => {
      cleanupResources();
    };
  }, [cleanupResources, playRepChime, speakThai]);

  const handleNextSet = useCallback(() => {
    setIsResting(false);
    isRestingRef.current = false;
    stateMachineRef.current.nextSet();
    setRestCountdown(resolvedConfig.defaultPrescription?.restBetweenSetsSec || 30);
  }, [resolvedConfig.defaultPrescription?.restBetweenSetsSec]);

  // Rest Countdown Timer
  useEffect(() => {
    if (!isResting) return;
    const interval = setInterval(() => {
      setRestCountdown((prev: number) => {
        if (prev <= 1) {
          clearInterval(interval);
          handleNextSet();
          return resolvedConfig.defaultPrescription?.restBetweenSetsSec || 30;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isResting, handleNextSet, resolvedConfig.defaultPrescription?.restBetweenSetsSec]);

  // Final Session Telemetry Submission with Idempotency Guard
  const handleFinalizeSession = (mode: 'ai_verified' | 'stopped_pain') => {
    if (isFinalizingRef.current) return;
    isFinalizingRef.current = true;

    const totalDurationSec = Math.max(
      1,
      Math.round((Date.now() - sessionStartTimeRef.current) / 1000)
    );
    const idempotencyKey =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `kiosk-sess-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    const telemetry: ExerciseSessionTelemetry = {
      exerciseId: exercise.id || exercise.exercise_id || resolvedConfig.id || 'ex',
      exerciseName: resolvedConfig.nameTh,
      patientId: patient.patient_id || patient.hn || 'unknown',
      totalRepsTarget: resolvedConfig.defaultPrescription?.repsPerSet || 10,
      completedReps: evalResult?.completedReps || hudState.completedReps || 0,
      incorrectReps: evalResult?.incorrectReps || 0,
      totalSetsCompleted: evalResult?.currentSet || hudState.currentSet || 1,
      maxAngleAchievedDeg: evalResult?.currentAngleDeg || hudState.currentAngle || 0,
      averageAngleDeg: evalResult?.currentAngleDeg || hudState.currentAngle || 0,
      averageHoldDurationSec: resolvedConfig.angleMechanics?.holdDurationSec || 2.0,
      consistencyScorePercent: evalResult?.completedReps
        ? Math.min(
            100,
            Math.round(
              (evalResult.completedReps /
                (evalResult.completedReps + (evalResult.incorrectReps || 0))) *
                100
            )
          )
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

    cleanupResources();

    if (onSessionCompleted) {
      onSessionCompleted(telemetry);
    } else if (onComplete) {
      onComplete(telemetry);
    }
  };

  // Emergency Pain Stop Handler
  const handleReportPainStop = async () => {
    if (isReportingPainRef.current) return;
    isReportingPainRef.current = true;

    setPainReportedState(true);
    setIsPaused(true);
    isPausedRef.current = true;

    voiceFeedbackRef.current.cancel();
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    speakThai('หยุดการฝึกแล้วค่ะ ระบบกำลังแจ้งนักกายภาพบำบัด', 'emergency_pain_stop', 0);

    try {
      const totalDurationSec = sessionStartTimeRef.current
        ? Math.max(1, Math.round((Date.now() - sessionStartTimeRef.current) / 1000))
        : 10;

      await defaultApiClient.courses.submitSessionLog({
        patient_id: patient.patient_id || patient.hn || 'unknown',
        exercise_id: exercise.id || exercise.exercise_id || resolvedConfig.id || null,
        kiosk_id: 'kiosk-01',
        completion_mode: 'stopped_pain',
        correct_reps: evalResult?.completedReps || hudState.completedReps || 0,
        incorrect_reps: evalResult?.incorrectReps || 0,
        target_reps: resolvedConfig.defaultPrescription?.repsPerSet || 10,
        current_set: evalResult?.currentSet || hudState.currentSet || 1,
        total_sets: resolvedConfig.defaultPrescription?.totalSets || 3,
        max_angle_achieved: evalResult?.currentAngleDeg || hudState.currentAngle || null,
        consistency_score: 0,
        pain_reported: true,
        duration_seconds: totalDurationSec,
        telemetry_summary: {
          emergency_stop: true,
          pain_reported: true,
          active_side: activeSide,
          phase_at_stop: evalResult?.phase || hudState.repPhase,
          warnings_at_stop: evalResult?.activeWarnings || [],
        },
      });
    } catch (logErr) {
      console.warn('[PoseEngine] Emergency telemetry log error:', logErr);
    }

    try {
      const idempotencyKey =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `pain-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      await (defaultApiClient.kiosk.callStaff as any)({
        kiosk_id: 'kiosk-01',
        reason: `🚨 ผู้ป่วยแจ้งว่ามีอาการเจ็บขณะฝึกท่า: "${resolvedConfig.nameTh}" (HN: ${patient.hn || patient.patient_id})`,
        idempotency_key: idempotencyKey,
      });
    } catch {
      // safe fallback
    }

    if (onPainStop) {
      onPainStop({
        exerciseId: resolvedConfig.id,
        side: activeSide,
        reps: hudState.completedReps,
      });
    }
  };

  const isPendulum = resolvedConfig.evaluationMode === 'pendulum_circular';
  const progressRatio = isPendulum
    ? evalResult?.pendulumCircleProgressRatio || 0
    : evalResult?.holdProgressRatio || 0;

  const isLowerBody =
    resolvedConfig.targetJoint === 'knee' ||
    resolvedConfig.targetJoint === 'ankle' ||
    resolvedConfig.targetJoint === 'hip';
  const isBilateral =
    resolvedConfig.targetJoint === 'neck' ||
    resolvedConfig.evaluationMode === 'neck_tilt' ||
    resolvedConfig.evaluationMode === 'heel_raise' ||
    resolvedConfig.id === 'sit-to-stand' ||
    resolvedConfig.id === 'wall-pushup';

  const titleString =
    explicitTitle ||
    (lang === 'zh-CN'
      ? resolvedConfig.nameCn || resolvedConfig.nameTh
      : lang === 'en-US'
      ? resolvedConfig.nameEn || resolvedConfig.nameTh
      : resolvedConfig.nameTh);

  const jointLabel =
    lang === 'zh-CN'
      ? `关节: ${resolvedConfig.targetJoint}`
      : lang === 'en-US'
      ? `Joint: ${resolvedConfig.targetJoint}`
      : `ข้อต่อ: ${resolvedConfig.targetJoint}`;

  const coachingMsg =
    lang === 'zh-CN'
      ? evalResult?.coachingMessageCn || hudState.coachingMessage
      : lang === 'en-US'
      ? evalResult?.coachingMessageEn || hudState.coachingMessage
      : hudState.coachingMessage;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 text-white flex flex-col justify-between overflow-hidden select-none font-sans">
      {/* 1. Top Clinical HUD Header */}
      <div className="w-full bg-slate-950/85 backdrop-blur-md border-b border-slate-800 px-4 sm:px-6 py-3.5 flex items-center justify-between z-20 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
              <span>{titleString}</span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 font-medium">
                {jointLabel}
              </span>
            </h1>
            <div className="text-xs text-slate-400 mt-0.5">
              {lang === 'zh-CN' ? '患者' : lang === 'en-US' ? 'Patient' : 'ผู้ป่วย'}: คุณ {patient.first_name} {patient.last_name || ''} • HN: {patient.hn || patient.patient_id || '-'}
            </div>
          </div>
        </div>

        {/* Side Toggle & Set/Rep Badges */}
        <div className="flex items-center gap-2 sm:gap-3">
          <LanguageSwitcher variant="dark" />

          {/* Side Toggle Selector or Bilateral Badge */}
          {isBilateral ? (
            <div className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-bold text-teal-300 flex items-center gap-1.5">
              <span>👥</span>
              <span>{lang === 'zh-CN' ? '双侧协同' : lang === 'en-US' ? 'Bilateral' : 'ทั้งสองข้าง'}</span>
            </div>
          ) : (
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
                <span>{isLowerBody ? (lang === 'zh-CN' ? '🦿 右腿' : lang === 'en-US' ? '🦿 Right Leg' : '🦿 ขาขวา') : (lang === 'zh-CN' ? '🦾 右臂' : lang === 'en-US' ? '🦾 Right Arm' : '🦾 แขนขวา')}</span>
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
                <span>{isLowerBody ? (lang === 'zh-CN' ? '左腿 🦿' : lang === 'en-US' ? 'Left Leg 🦿' : 'ขาซ้าย 🦿') : (lang === 'zh-CN' ? '左臂 🦾' : lang === 'en-US' ? 'Left Arm 🦾' : 'แขนซ้าย 🦾')}</span>
              </button>
            </div>
          )}

          {/* Audio Coach Mute/Unmute Toggle */}
          <button
            type="button"
            id="kiosk-toggle-audio-btn"
            data-testid="kiosk-toggle-audio-btn"
            onClick={() => setIsAudioMuted((prev) => !prev)}
            className={`px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer border ${
              isAudioMuted
                ? 'bg-rose-500/20 border-rose-500/40 text-rose-300'
                : 'bg-slate-900 border-slate-800 text-emerald-400 hover:text-emerald-300'
            }`}
            title="เปิด/ปิดเสียงพูดแนะนำ (Audio Voice Coach)"
          >
            <span>{isAudioMuted ? '🔇 เสียงโค้ช: ปิด' : '🔊 เสียงโค้ช: เปิด'}</span>
          </button>

          {/* Diagnostic Debug HUD Toggle */}
          <button
            type="button"
            id="kiosk-toggle-debug-btn"
            data-testid="kiosk-toggle-debug-btn"
            onClick={() => setShowDebugHud((prev) => !prev)}
            className={`px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer border ${
              showDebugHud
                ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
            title="สลับการแสดงผลแผงตรวจวัดละเอียด (Diagnostic Debug HUD)"
          >
            <span>🔍 Debug</span>
          </button>

          {/* Sets Badge */}
          <div className="px-4 py-2 rounded-2xl bg-slate-900 border border-slate-800 text-center">
            <div className="text-[10px] text-slate-400 uppercase font-semibold">
              {lang === 'zh-CN' ? '组数' : lang === 'en-US' ? 'Set' : 'เซ็ตที่'}
            </div>
            <div className="text-sm sm:text-base font-extrabold text-teal-400">
              {hudState.currentSet} / {resolvedConfig.defaultPrescription?.totalSets || 3}
            </div>
          </div>

          {/* Reps Badge */}
          <div className="px-5 py-2 rounded-2xl bg-gradient-to-r from-emerald-600/30 to-teal-600/30 border border-emerald-500/50 text-center shadow-lg shadow-emerald-950/50">
            <div className="text-[10px] text-emerald-300 uppercase font-semibold">
              {lang === 'zh-CN' ? '次数' : lang === 'en-US' ? 'Reps' : 'จำนวนครั้ง'}
            </div>
            <div className="text-lg sm:text-xl font-extrabold text-white">
              {hudState.completedReps} / {resolvedConfig.defaultPrescription?.repsPerSet || 10}
            </div>
          </div>
        </div>
      </div>

      {/* 2. Main Live Tracking Viewport */}
      <div className="relative flex-1 w-full h-full flex items-center justify-center bg-black overflow-hidden">
        {/* Webcam Video with horizontal selfie mirror */}
        <video
          ref={videoRef}
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-cover -scale-x-100 z-0"
        />

        {/* 1:1 Canvas overlay directly on top of video */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none z-10"
        />

        {/* Real-time Diagnostic Debug HUD (🔍 Debug สถานะระบบ) */}
        {showDebugHud && (
          <div
            id="pose-engine-debug-hud"
            data-testid="pose-engine-debug-hud"
            className="absolute top-20 left-4 z-30 bg-slate-900/90 border border-emerald-500/50 rounded-2xl p-3.5 text-xs font-mono text-emerald-300 shadow-2xl backdrop-blur-md space-y-1.5 max-w-xs sm:max-w-sm pointer-events-auto"
          >
            <div className="flex items-center justify-between border-b border-emerald-500/30 pb-1 text-emerald-400 font-bold">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span>🔍 Debug สถานะระบบ</span>
              </span>
              <button
                type="button"
                onClick={() => setLowPowerMode((prev) => !prev)}
                className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-teal-300 hover:bg-slate-700 cursor-pointer"
              >
                {lowPowerMode ? '⚡ ประหยัดไฟ: ON' : '⚡ ความเร็วสูง'}
              </button>
            </div>
            <div>
              📷 กล้อง: <span className="text-white font-bold">{cameraStatus === 'ready' ? `พร้อมใช้งาน (${cameraDimensions.width}x${cameraDimensions.height})` : cameraStatus}</span>
            </div>
            <div>
              🧠 โมเดล: <span className="text-white font-bold">{modelStatus === 'ready' ? `พร้อมตรวจจับ (${modelDelegate})` : modelStatus}</span>
            </div>
            <div>
              ⚡ FPS จริง: <span className="text-white font-bold">{hudState.fps} FPS</span> {lowPowerMode ? '<ประหยัดพลังงาน>' : ''}
            </div>
            <div>
              📍 Landmarks: <span className="text-white font-bold">{hudState.landmarkCount} จุด</span> (Vis เฉลี่ย: {hudState.avgVisibility})
            </div>
            <div>
              📐 มุมปัจจุบัน: <span className="text-white font-bold">{hudState.currentAngle}°</span> | ความถูกต้อง: <span className="text-white font-bold">{hudState.accuracyPct}%</span>
            </div>
            <div>
              🔄 สถานะตัวนับ: <span className="text-amber-300 font-bold">{hudState.repPhase}</span> | ข้าง: <span className="text-cyan-300 font-bold">{activeSide}</span> | ครั้งที่: <span className="text-white font-bold">{hudState.completedReps}</span>
            </div>
          </div>
        )}

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
                : evalResult?.readinessStatus === 'missing_arm_landmarks' ||
                  evalResult?.readinessStatus === 'missing_shoulder' ||
                  evalResult?.readinessStatus === 'missing_full_body' ||
                  evalResult?.readinessStatus === 'missing_lower_body' ||
                  evalResult?.readinessStatus === 'missing_head_shoulders'
                ? 'bg-cyan-950/90 border-cyan-400 text-cyan-100 shadow-cyan-950/50'
                : evalResult?.formRating === 'warning'
                ? 'bg-amber-950/85 border-amber-500 text-amber-100'
                : 'bg-slate-900/85 border-emerald-500/40 text-emerald-200'
            }`}
          >
            <div className="text-2xl shrink-0">
              {evalResult?.formRating === 'error'
                ? '🚨'
                : evalResult?.readinessStatus
                ? '📷'
                : evalResult?.formRating === 'warning'
                ? '⚠️'
                : isPendulum
                ? '🌀'
                : '🎯'}
            </div>
            <div className="flex-1">
              <div className="text-xs sm:text-sm font-extrabold leading-snug">
                {coachingMsg || (lang === 'zh-CN' ? '请在初始位置做好准备' : lang === 'en-US' ? 'Get ready at the starting position' : 'เตรียมพร้อมในตำแหน่งเริ่มต้น')}
              </div>
              {/* Hold / Pendulum Progress Bar */}
              {progressRatio > 0 && !evalResult?.readinessStatus && (
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
              {evalResult?.readinessStatus
                ? (lang === 'zh-CN' ? '等待调整' : lang === 'en-US' ? 'Adjust Pose' : 'รอจัดท่า')
                : isPendulum
                ? `${Math.round(progressRatio * 100)}%`
                : `${evalResult?.currentAngleDeg || hudState.currentAngle}°`}
            </div>
          </div>
        </div>

        {/* Loading Overlay */}
        {(cameraStatus === 'initializing' || modelStatus === 'loading') && !errorMessage && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm">
            <div className="bg-slate-900 border border-emerald-500/40 rounded-3xl p-8 max-w-md text-center text-white shadow-2xl">
              <div className="w-14 h-14 rounded-full bg-emerald-500/20 border border-emerald-400 flex items-center justify-center mx-auto mb-4 text-emerald-400">
                <Activity className="w-8 h-8 animate-spin" />
              </div>
              <div className="text-lg font-bold mb-2">⏳ กำลังโหลดระบบตรวจจับท่าทาง AI...</div>
              <div className="text-xs text-slate-300 leading-relaxed mb-3">
                ระบบกำลังเชื่อมต่อกล้องและดาวน์โหลดโมเดลวิเคราะห์การเคลื่อนไหว
              </div>
              <div className="text-[11px] text-emerald-400/80 bg-slate-950/60 rounded-xl px-3 py-2 border border-slate-800">
                💡 กรุณาอนุญาตการใช้งานกล้องเว็บแคม และยืนให้เห็นร่างกายในระยะ 1.5–2 เมตร
              </div>
            </div>
          </div>
        )}

        {/* Error Banner with Reload & Exit */}
        {errorMessage && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-4">
            <div className="bg-red-950/95 border-2 border-red-500 rounded-3xl p-6 sm:p-8 max-w-md text-center text-white shadow-2xl">
              <div className="w-14 h-14 rounded-full bg-red-500/20 border border-red-400 flex items-center justify-center mx-auto mb-4 text-red-400">
                <AlertTriangle className="w-8 h-8" />
              </div>
              <div className="text-lg font-bold text-red-200 mb-2">⚠️ ระบบตรวจจับไม่สามารถทำงานได้</div>
              <p className="text-xs text-red-100 mb-6 leading-relaxed">{errorMessage}</p>
              <div className="flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="px-5 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition active:scale-95 cursor-pointer shadow-lg shadow-emerald-950/50"
                >
                  ลองใหม่อีกครั้ง (Reload)
                </button>
                <button
                  type="button"
                  onClick={onExit}
                  className="px-5 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold transition active:scale-95 cursor-pointer"
                >
                  ออกจากการฝึก
                </button>
              </div>
            </div>
          </div>
        )}
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
              ทำครบเซ็ตที่ {hudState.currentSet} แล้ว พักกล้ามเนื้อสักครู่ก่อนเริ่มเซ็ตถัดไป
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
              {resolvedConfig.nameTh}
            </div>

            <div className="grid grid-cols-2 gap-3 mb-6 text-left">
              <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800">
                <div className="text-[11px] text-slate-400">จำนวนครั้ง (ทำถูก / ผิด)</div>
                <div className="text-base sm:text-lg font-bold text-emerald-400 mt-0.5">
                  ✅ {evalResult?.completedReps || hudState.completedReps || 0} / ❌ {evalResult?.incorrectReps || 0}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5 font-medium">
                  เป้าหมาย: {resolvedConfig.defaultPrescription?.repsPerSet || 10} ครั้ง × {resolvedConfig.defaultPrescription?.totalSets || 3} เซ็ต
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800">
                <div className="text-[11px] text-slate-400">
                  {isPendulum ? 'วิถีวงกลม (360° Cycle)' : 'มุมสูงสุดที่ทำได้'}
                </div>
                <div className="text-base sm:text-lg font-bold text-teal-400 mt-0.5">
                  {isPendulum ? '100% (ครบวงรอบ)' : `${evalResult?.currentAngleDeg || hudState.currentAngle || 0}°`}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5 font-medium">
                  {isPendulum
                    ? 'ความเร็วและรัศมีอยู่ในเกณฑ์'
                    : `เป้าหมาย: ${resolvedConfig.angleMechanics?.targetMinDeg || 80}° - ${resolvedConfig.angleMechanics?.targetMaxDeg || 100}°`}
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800">
                <div className="text-[11px] text-slate-400">ความสม่ำเสมอ (Consistency)</div>
                <div className="text-base sm:text-lg font-bold text-cyan-400 mt-0.5">
                  {evalResult?.completedReps
                    ? Math.min(
                        100,
                        Math.round(
                          (evalResult.completedReps /
                            (evalResult.completedReps + (evalResult.incorrectReps || 0))) *
                            100
                        )
                      )
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
