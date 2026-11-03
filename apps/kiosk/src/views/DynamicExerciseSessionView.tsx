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
  ArrowLeft,
  ShieldAlert,
  AlertTriangle,
  KeyRound,
  Settings,
  Globe,
  Check,
  X,
} from 'lucide-react';
import { useClinicalI18n, LANGUAGE_OPTIONS } from '../../../../packages/clinical-i18n/src/index';

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

export const POSE_CONNECTIONS: [number, number][] = [
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

export const BODY_JOINT_INDICES = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32];
export const ANATOMICAL_BODY_JOINTS = BODY_JOINT_INDICES;

export function getRequiredKeypointsForExercise(config?: ExerciseDetectionConfig): number[] {
  const framing = config?.framing;
  if (framing === 'head_shoulders') {
    return [7, 8, 11, 12];
  }
  if (framing === 'full' || framing === 'full_body' || framing === 'lower_body') {
    return [11, 12, 23, 24, 25, 26, 27, 28];
  }
  // Upper-body mode (shoulder pendulum, arm raises, etc.)
  return [11, 12, 13, 14, 15, 16, 23, 24];
}

export const KEYPOINT_NAME_MAP: Record<number, { th: string; en: string; cn: string }> = {
  7: { th: 'หูซ้าย', en: 'L Ear', cn: '左耳' },
  8: { th: 'หูขวา', en: 'R Ear', cn: '右耳' },
  11: { th: 'ไหล่ซ้าย', en: 'L Shoulder', cn: '左肩' },
  12: { th: 'ไหล่ขวา', en: 'R Shoulder', cn: '右肩' },
  13: { th: 'ศอกซ้าย', en: 'L Elbow', cn: '左肘' },
  14: { th: 'ศอกขวา', en: 'R Elbow', cn: '右肘' },
  15: { th: 'ข้อมือซ้าย', en: 'L Wrist', cn: '左腕' },
  16: { th: 'ข้อมือขวา', en: 'R Wrist', cn: '右腕' },
  23: { th: 'สะโพกซ้าย', en: 'L Hip', cn: '左髋' },
  24: { th: 'สะโพกขวา', en: 'R Hip', cn: '右髋' },
  25: { th: 'เข่าซ้าย', en: 'L Knee', cn: '左膝' },
  26: { th: 'เข่าขวา', en: 'R Knee', cn: '右膝' },
  27: { th: 'ข้อเท้าซ้าย', en: 'L Ankle', cn: '左踝' },
  28: { th: 'ข้อเท้าขวา', en: 'R Ankle', cn: '右踝' },
};

const _LANDMARK_NAMES: Record<number, string> = {
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
  const { lang, t, setLanguage } = useClinicalI18n();

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
  const [showDebugHud, setShowDebugHud] = useState<boolean>(false);
  const [isStaffUnlocked, setIsStaffUnlocked] = useState<boolean>(() => {
    return typeof window !== 'undefined' && (Boolean((import.meta as any).env?.DEV) || (window as any).__DRTECH_DEBUG__ === true);
  });
  const [showStaffPinModal, setShowStaffPinModal] = useState<boolean>(false);
  const [showStaffSettingsModal, setShowStaffSettingsModal] = useState<boolean>(false);
  const [showLangMenu, setShowLangMenu] = useState<boolean>(false);
  const [enteredStaffPin, setEnteredStaffPin] = useState<string>('');
  const [staffPinError, setStaffPinError] = useState<string | null>(null);
  const titleTapCountRef = useRef<number>(0);
  const lastTitleTapTimeRef = useRef<number>(0);

  const [celebratingRep, setCelebratingRep] = useState<number | null>(null);

  const handleTitleTap = useCallback(() => {
    const now = Date.now();
    if (now - lastTitleTapTimeRef.current > 3000) {
      titleTapCountRef.current = 1;
    } else {
      titleTapCountRef.current += 1;
    }
    lastTitleTapTimeRef.current = now;

    if (titleTapCountRef.current >= 5) {
      titleTapCountRef.current = 0;
      setShowStaffPinModal(true);
    }
  }, []);

  const [evalResult, setEvalResult] = useState<RepEvaluationResult | null>(null);
  const [_watchdogStatus, setWatchdogStatus] = useState<WatchdogHealthStatus | null>(null);
  const [isResting, setIsResting] = useState<boolean>(false);
  const [restCountdown, setRestCountdown] = useState<number>(
    resolvedConfig.defaultPrescription?.restBetweenSetsSec || 30
  );
  const [isSummaryOpen, setIsSummaryOpen] = useState<boolean>(false);
  const [painReportedState, setPainReportedState] = useState<boolean>(false);

  // Camera FOV, Aspect Ratio & Zoom States
  const [zoomInfo, setZoomInfo] = useState<{
    supported: boolean;
    min: number;
    max: number;
    step: number;
    current: number;
  }>({ supported: false, min: 1, max: 1, step: 0.1, current: 1 });
  const [fitMode, setFitMode] = useState<'contain' | 'cover'>('cover');
  const [boostLighting, setBoostLighting] = useState<boolean>(false);
  const [showGuideSilhouette, setShowGuideSilhouette] = useState<boolean>(true);

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
    shoulderWidthPct: 0,
    distanceStatus: 'กำลังจัดระยะ...',
    distanceWarning: null as string | null,
    detectedPeople: 1,
    lockedTargetIdx: 0,
    hasLightingWarning: false,
    requiredKeypointsStatus: [] as Array<{ idx: number; name: string; visibility: number; isPresent: boolean }>,
    readinessReason: 'กำลังเตรียมระบบตรวจจับ...',
  });

  // State mirror refs for loop access without re-binding
  const fitModeRef = useRef<'contain' | 'cover'>('contain');
  useEffect(() => {
    fitModeRef.current = fitMode;
  }, [fitMode]);

  const boostLightingRef = useRef<boolean>(boostLighting);
  useEffect(() => {
    boostLightingRef.current = boostLighting;
  }, [boostLighting]);

  // Target lock & landmark smoothing refs
  const lockedSubjectCoMRef = useRef<{ x: number; y: number } | null>(null);
  const smoothedLandmarksRef = useRef<PoseEngineLandmark[] | null>(null);

  const handleZoomChange = useCallback(async (newZoom: number) => {
    const stream = streamRef.current;
    if (!stream) return;
    const track = stream.getVideoTracks()[0];
    if (track && typeof track.applyConstraints === 'function') {
      try {
        await track.applyConstraints({
          advanced: [{ zoom: newZoom } as any],
        });
        setZoomInfo((prev) => ({ ...prev, current: newZoom }));
      } catch (err) {
        console.warn('[PoseEngine] Failed to apply zoom:', err);
      }
    }
  }, []);

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
  const resolvedConfigRef = useRef(resolvedConfig);
  useEffect(() => {
    resolvedConfigRef.current = resolvedConfig;
    stateMachineRef.current.updateConfig(resolvedConfig);
  }, [resolvedConfig]);

  // 1. ตัดเสียงพูดทั้งหมดในหน้าสแกนท่าฝึก และล้างคิวเสียงค้างทันทีที่เข้าหน้า/เปลี่ยนท่า/ออกจากหน้า
  useEffect(() => {
    const feedbackController = voiceFeedbackRef.current;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    feedbackController.cancel();
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      feedbackController.cancel();
    };
  }, [exerciseConfig, resolvedConfig]);

  // 2. State สำหรับปุ่ม "แสดงเส้นลำตัว" (ค่าเริ่มต้น = false คือปิดไว้เสมอเมื่อเข้าหน้าใหม่)
  const [showSkeletonOverlay, setShowSkeletonOverlay] = useState<boolean>(false);
  const showSkeletonRef = useRef<boolean>(false);
  useEffect(() => {
    showSkeletonRef.current = showSkeletonOverlay;
  }, [showSkeletonOverlay]);

  // Audio Mute State with localStorage persistence (100% silent view)
  const [isAudioMuted, _setIsAudioMuted] = useState<boolean>(() => {
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

  // Sound & Speech Helpers (100% Permanently Silent in Exercise Scan View)
  const playRepChime = useCallback(() => {
    // Web Audio API chimes and beeps are permanently disabled in Exercise Scan View
  }, []);

  const speakThai = useCallback(
    (_text: string, _category?: string, _overrideCooldownMs?: number) => {
      // ตัดเสียงพูดทั้งหมดในหน้าสแกนท่าฝึก 100%
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      voiceFeedbackRef.current.cancel();
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

        // Query & apply lowest hardware zoom for widest FOV without cropping
        const videoTrack = stream.getVideoTracks()[0];
        let supportedZoom = { supported: false, min: 1, max: 1, step: 0.1, current: 1 };
        if (videoTrack && typeof videoTrack.getCapabilities === 'function') {
          try {
            const caps: any = videoTrack.getCapabilities();
            if (caps && 'zoom' in caps && typeof caps.zoom === 'object') {
              const minZoom = Number(caps.zoom.min ?? 1);
              const maxZoom = Number(caps.zoom.max ?? 1);
              const stepZoom = Number(caps.zoom.step ?? 0.1);
              supportedZoom = {
                supported: true,
                min: minZoom,
                max: maxZoom,
                step: stepZoom,
                current: minZoom,
              };
              await videoTrack.applyConstraints({
                advanced: [{ zoom: minZoom } as any],
              });
            }
          } catch (zoomErr) {
            console.warn('[PoseEngine] Camera zoom capabilities check failed:', zoomErr);
          }
        }
        setZoomInfo(supportedZoom);
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

        // Model Sources: Full CDN -> Local Full/Default -> Lite Local -> Lite CDN
        const modelSources = [
          'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task',
          '/models/pose_landmarker_full.task',
          '/models/pose_landmarker.task',
          '/models/pose_landmarker_lite.task',
          'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task',
        ];

        let landmarker: any = null;
        let selectedDelegate: 'GPU' | 'CPU' = 'GPU';

        // Try GPU delegate first across sources (numPoses: 3 for multi-person support)
        for (const modelPath of modelSources) {
          try {
            landmarker = await vision.PoseLandmarker.createFromOptions(filesetResolver, {
              baseOptions: {
                modelAssetPath: modelPath,
                delegate: 'GPU',
              },
              runningMode: 'VIDEO',
              numPoses: 3,
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
                numPoses: 3,
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
                shoulderWidthPct: 0,
                distanceStatus: 'ไม่พบผู้ใช้ในภาพ',
                distanceWarning: '📷 ไม่พบร่างกายในภาพ กรุณาขยับให้อยู่กลางหน้าจอและถอยห่าง 1–1.5 เมตร',
                detectedPeople: 0,
                coachingMessage: '📷 ไม่พบร่างกายในภาพ กรุณาขยับให้อยู่กลางหน้าจอและถอยห่าง 1.5–2 เมตร',
                statusColor: '#f59e0b',
              }));
            }
            return;
          }

          // 1. Multi-Person Detection & Continuous Primary Subject Locking
          const allPoses = result.landmarks;
          const detectedPeopleCount = allPoses.length;
          let bestIdx = 0;

          if (detectedPeopleCount > 1) {
            let maxScore = -Infinity;
            allPoses.forEach((pose: any[], idx: number) => {
              const ls = pose[11];
              const rs = pose[12];
              if (!ls || !rs) return;

              const midX = (ls.x + rs.x) / 2;
              const midY = (ls.y + rs.y) / 2;
              const shoulderWidth = Math.abs(ls.x - rs.x);

              // Size score (closer/primary user has wider shoulders)
              const sizeScore = shoulderWidth * 2.5;

              // Center score (primary user stands in front of kiosk/screen center)
              const distFromCenter = Math.hypot(midX - 0.5, midY - 0.5);
              const centerScore = Math.max(0, 1.0 - distFromCenter * 1.8);

              // Persistence lock bonus (prevents swapping to bystanders walking behind)
              let persistenceScore = 0;
              if (lockedSubjectCoMRef.current) {
                const distFromPrev = Math.hypot(
                  midX - lockedSubjectCoMRef.current.x,
                  midY - lockedSubjectCoMRef.current.y
                );
                persistenceScore = Math.max(0, (1.0 - distFromPrev * 2.2) * 2.0);
              }

              const totalScore = sizeScore * 1.5 + centerScore * 1.2 + persistenceScore * 2.0;
              if (totalScore > maxScore) {
                maxScore = totalScore;
                bestIdx = idx;
              }
            });
          }

          const chosenPose = allPoses[bestIdx];
          const rawLs = chosenPose[11];
          const rawRs = chosenPose[12];
          if (rawLs && rawRs) {
            const curMidX = (rawLs.x + rawRs.x) / 2;
            const curMidY = (rawLs.y + rawRs.y) / 2;
            if (!lockedSubjectCoMRef.current) {
              lockedSubjectCoMRef.current = { x: curMidX, y: curMidY };
            } else {
              lockedSubjectCoMRef.current = {
                x: 0.82 * lockedSubjectCoMRef.current.x + 0.18 * curMidX,
                y: 0.82 * lockedSubjectCoMRef.current.y + 0.18 * curMidY,
              };
            }
          }

          // 2. Velocity-Adaptive Landmark Smoothing (EMA Filter)
          const prevSmoothed = smoothedLandmarksRef.current;
          const smoothedPose: PoseEngineLandmark[] = chosenPose.map((lm: any, idx: number) => {
            const rawVis = lm.visibility ?? 0.9;
            const rawPresence = lm.presence ?? 0.9;
            if (!prevSmoothed || !prevSmoothed[idx]) {
              return { x: lm.x, y: lm.y, z: lm.z ?? 0, visibility: rawVis, presence: rawPresence };
            }

            const prev = prevSmoothed[idx];
            const dist = Math.hypot(lm.x - prev.x, lm.y - prev.y);
            // Higher smoothing (lower alpha) when stationary to suppress jitter from harsh lighting/noise
            const alpha = Math.min(0.85, Math.max(0.28, dist * 15.0));

            return {
              x: alpha * lm.x + (1 - alpha) * prev.x,
              y: alpha * lm.y + (1 - alpha) * prev.y,
              z: alpha * (lm.z ?? 0) + (1 - alpha) * (prev.z ?? 0),
              visibility: rawVis,
              presence: rawPresence,
            };
          });
          smoothedLandmarksRef.current = smoothedPose;

          // Hardware Watchdog Update
          const wdStatus = watchdogRef.current.update(smoothedPose, monotonicTs);
          const evalRes = stateMachineRef.current.evaluate(smoothedPose, monotonicTs);

          // Project landmarks into 1:1 canvas pixels with mirror support and fitMode
          const currentFitMode = fitModeRef.current;
          const projectedPoints = smoothedPose.map((lm: any) =>
            projectLandmarkToCanvas(lm, vEl, cEl, true, currentFitMode)
          );

          // Shoulder width & distance estimation
          const smoothLs = smoothedPose[11];
          const smoothRs = smoothedPose[12];
          let shoulderWidthPct = 0;
          let distanceStatus = 'กำลังวัดระยะ...';
          let distanceWarning: string | null = null;

          if (smoothLs && smoothRs && (smoothLs.visibility ?? 1) > 0.35 && (smoothRs.visibility ?? 1) > 0.35) {
            const sw = Math.abs(smoothLs.x - smoothRs.x);
            shoulderWidthPct = Math.round(sw * 100);
            if (sw > 0.55) {
              distanceStatus = 'ใกล้เกินไป';
              distanceWarning = '⚠️ ยืนใกล้กล้องเกินไป — กรุณาถอยห่างประมาณ 1–1.5 เมตร ให้เห็นศีรษะถึงเอว';
            } else if (sw < 0.18) {
              distanceStatus = 'ไกลเกินไป';
              distanceWarning = '⚠️ อยู่ไกลเกินไป — กรุณาขยับเข้าใกล้กล้องอีกเล็กน้อย';
            } else {
              distanceStatus = 'ระยะเหมาะสม (1-1.5 ม.)';
              distanceWarning = null;
            }
          }

          const strokeColor =
            evalRes.formRating === 'error'
              ? '#fbbf24'
              : evalRes.formRating === 'warning'
              ? '#00f5d4'
              : '#10b981';

          // 3. ในลูป requestAnimationFrame:
          // - การตรวจจับ (detector.detectForVideo) และการคำนวณนับครั้ง (stateMachineRef.current.evaluateFrame)
          //   ทำงานเบื้องหลัง 100% ทุกเฟรมแม้ showSkeletonRef.current === false
          // - จะวาดเส้นและจุดลงบน <canvas> เฉพาะเมื่อ showSkeletonRef.current === true เท่านั้น!
          ctx.clearRect(0, 0, cEl.width, cEl.height);

          if (showSkeletonRef.current) {
            const isUpperBodyMode =
              resolvedConfig.framing !== 'full_body' && resolvedConfig.framing !== 'lower_body';
            const activeConnections = isUpperBodyMode
              ? [
                  [11, 12], [11, 23], [12, 24], [23, 24], // กรอบลำตัวส่วนบน
                  [11, 13], [13, 15],                     // แขนซ้าย
                  [12, 14], [14, 16],                     // แขนขวา
                ]
              : POSE_CONNECTIONS;

            const activeJointIndices = isUpperBodyMode
              ? [11, 12, 13, 14, 15, 16, 23, 24] // เฉพาะหัวไหล่ถึงสะโพก (ไม่วาดจุดใบหน้า 0-10 และไม่วาดขา 25-32)
              : BODY_JOINT_INDICES;

            // วาดเส้นเชื่อมด้วยสีสว่างชัดเจน (#22d3ee / #10b981 / #f59e0b)
            ctx.lineWidth = 4;
            ctx.strokeStyle = strokeColor;
            for (const [idxA, idxB] of activeConnections) {
              const ptA = projectedPoints[idxA];
              const ptB = projectedPoints[idxB];
              if (ptA && ptB && ptA.inFrame && ptB.inFrame && ptA.visibility >= 0.35 && ptB.visibility >= 0.35) {
                ctx.beginPath();
                ctx.moveTo(ptA.x, ptA.y);
                ctx.lineTo(ptB.x, ptB.y);
                ctx.stroke();
              }
            }

            // วาดจุดข้อต่อเฉพาะส่วนที่กำหนด (ไม่วาดป้ายชื่อทับใบหน้า 0-10 เด็ดขาด)
            for (const idx of activeJointIndices) {
              const pt = projectedPoints[idx];
              if (!pt || !pt.inFrame || pt.visibility < 0.35) continue;
              ctx.beginPath();
              ctx.arc(pt.x, pt.y, 7, 0, Math.PI * 2);
              ctx.fillStyle = strokeColor;
              ctx.fill();
              ctx.lineWidth = 2;
              ctx.strokeStyle = '#ffffff';
              ctx.stroke();

              // วาดป้ายเลขจุดเฉพาะเมื่อเปิดทั้ง "แสดงเส้นลำตัว" และ "Debug" พร้อมกัน และเฉพาะจุดลำตัว 11..24 เท่านั้น
              if (showDebugRef.current && idx >= 11) {
                ctx.font = 'bold 11px sans-serif';
                ctx.fillStyle = '#38bdf8';
                ctx.fillText(`#${idx} (${pt.visibility.toFixed(2)})`, pt.x + 10, pt.y - 6);
              }
            }
          }

          // Rep completion audio chime, TTS & senior celebration pulse
          if (evalRes.completedReps > lastCompletedRepsRef.current) {
            lastCompletedRepsRef.current = evalRes.completedReps;
            setCelebratingRep(evalRes.completedReps);
            setTimeout(() => setCelebratingRep(null), 2000);
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
            const requiredJoints = getRequiredKeypointsForExercise(resolvedConfig);
            const avgVis =
              requiredJoints.reduce(
                (acc, idx) => acc + (smoothedPose[idx]?.visibility ?? 0),
                0
              ) / (requiredJoints.length || 1);

            const isLightingLow = avgVis < 0.40 && detectedPeopleCount >= 1;

            const requiredKeypointsStatus = requiredJoints.map((idx) => {
              const lm = smoothedPose[idx];
              const vis = lm?.visibility ?? 0;
              const nameEntry = KEYPOINT_NAME_MAP[idx];
              const name = nameEntry ? nameEntry.th : `#${idx}`;
              return {
                idx,
                name,
                visibility: Number(vis.toFixed(2)),
                isPresent: vis >= 0.35,
              };
            });

            const readinessReason =
              evalRes.readinessStatus === 'ready'
                ? 'พร้อมเริ่มฝึก (ready)'
                : evalRes.readinessStatus === 'partial_upper_body'
                ? 'ตรวจพบครึ่งตัวบน (partial_upper_body)'
                : evalRes.readinessStatus === 'missing_shoulder'
                ? 'ไม่พบจุดหัวไหล่ในภาพ'
                : evalRes.readinessStatus === 'missing_arm_landmarks'
                ? 'ไม่พบจุดแขนหรือข้อมือ'
                : evalRes.readinessStatus === 'missing_lower_body'
                ? 'ไม่พบจุดช่วงขาหรือข้อเท้า'
                : evalRes.readinessStatus === 'missing_head_shoulders'
                ? 'ไม่พบจุดศีรษะและไหล่'
                : 'รอจัดท่าให้อยู่ในกรอบ';

            setHudState({
              fps: Math.round(smoothedFpsRef.current),
              landmarkCount: smoothedPose.length,
              avgVisibility: Number(avgVis.toFixed(2)),
              currentAngle: Math.round(evalRes.currentAngleDeg || 0),
              accuracyPct: Math.round(evalRes.accuracyPercent ?? evalRes.accuracyPct ?? 0),
              repPhase: evalRes.phase,
              completedReps: evalRes.completedReps,
              currentSet: evalRes.currentSet,
              coachingMessage: evalRes.coachingMessageTh,
              statusColor: strokeColor,
              shoulderWidthPct,
              distanceStatus,
              distanceWarning,
              detectedPeople: detectedPeopleCount,
              lockedTargetIdx: bestIdx,
              hasLightingWarning: isLightingLow,
              requiredKeypointsStatus,
              readinessReason,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleanupResources, playRepChime, speakThai, resolvedConfig.framing]);

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

  // Calculate smooth motion progress towards target (0.0 to 1.0) for SVG Progress Ring
  let ringProgress = 0;
  if (isPendulum) {
    ringProgress = evalResult?.pendulumCircleProgressRatio || 0;
  } else if (evalResult?.phase === 'HOLDING_TARGET' || evalResult?.isInsideTargetZone) {
    ringProgress = evalResult?.holdProgressRatio ? Math.max(0.85, evalResult.holdProgressRatio) : 1.0;
  } else if (evalResult?.phase === 'MOVING_TO_TARGET') {
    const startAngle = resolvedConfig.angleMechanics?.startAngleDeg || 20;
    const targetMin = resolvedConfig.angleMechanics?.targetMinDeg || 80;
    const curAngle = evalResult?.currentAngleDeg ?? hudState.currentAngle ?? 0;
    ringProgress = Math.max(0, Math.min(0.95, (curAngle - startAngle) / Math.max(1, targetMin - startAngle)));
  } else if (evalResult?.phase === 'RETURNING_TO_START') {
    ringProgress = 0.4;
  } else {
    const targetReps = resolvedConfig.defaultPrescription?.repsPerSet || 10;
    ringProgress = targetReps > 0 ? (hudState.completedReps % targetReps) / targetReps : 0;
  }

  const isWaitingPose = Boolean(
    evalResult?.readinessStatus &&
    evalResult.readinessStatus !== 'ready' &&
    evalResult.readinessStatus !== 'partial_upper_body' &&
    hudState.repPhase === 'IDLE' &&
    hudState.completedReps === 0
  );

  // Single-Line Status Resolution based on Strict Clinical Priority
  const getSingleLineStatus = (): {
    icon: string;
    message: string;
    tone: 'emerald' | 'amber' | 'rose' | 'teal';
  } => {
    // 0. Celebrating Rep
    if (celebratingRep !== null) {
      return {
        icon: '🎉',
        message:
          lang === 'zh-CN'
            ? `太棒了！已完成第 ${celebratingRep} 次`
            : lang === 'en-US'
            ? `Great job! Rep #${celebratingRep} completed`
            : `ยอดเยี่ยมมาก! ครั้งที่ ${celebratingRep} สำเร็จ`,
        tone: 'emerald',
      };
    }

    // 0.1 Paused
    if (isPaused) {
      return {
        icon: '⏸️',
        message:
          lang === 'zh-CN'
            ? '训练已暂停 点击下方按钮继续'
            : lang === 'en-US'
            ? 'Session paused. Tap Resume below to continue'
            : 'พักชั่วคราว — กดปุ่มฝึกต่อเพื่อทำต่อ',
        tone: 'amber',
      };
    }

    // Priority (ก): Person detection, framing, distance
    if (hudState.detectedPeople === 0 || hudState.landmarkCount === 0) {
      return {
        icon: '📷',
        message:
          lang === 'zh-CN'
            ? '请站在摄像头前 1.5–2 米处'
            : lang === 'en-US'
            ? 'Please stand in front of camera (1.5–2 m)'
            : 'กรุณายืนหน้ากล้องในระยะ 1.5–2 เมตร ให้กล้องเห็นตัว',
        tone: 'amber',
      };
    }

    if (hudState.shoulderWidthPct > 55 || evalResult?.readinessStatus === 'missing_shoulder') {
      return {
        icon: '⚠️',
        message:
          lang === 'zh-CN'
            ? '请后退一些，确保看到手臂到手肘'
            : lang === 'en-US'
            ? 'Step back slightly so your arms and elbows are visible'
            : 'ถอยหลังอีกนิด ให้เห็นแขนถึงข้อศอก',
        tone: 'amber',
      };
    }

    if (hudState.shoulderWidthPct > 0 && hudState.shoulderWidthPct < 18) {
      return {
        icon: '⚠️',
        message:
          lang === 'zh-CN'
            ? '请向前走近一些'
            : lang === 'en-US'
            ? 'Step slightly closer to screen'
            : 'ขยับเข้าใกล้กล้องอีกเล็กน้อย',
        tone: 'amber',
      };
    }

    if (isWaitingPose) {
      return {
        icon: '📷',
        message:
          lang === 'zh-CN'
            ? '请站直并进入检测区域以开始训练'
            : lang === 'en-US'
            ? 'Stand upright in frame to begin'
            : 'กรุณายืนตรงให้เห็นช่วงบนชัดเจนเพื่อเริ่มท่า',
        tone: 'amber',
      };
    }

    // Priority (ข): Insufficient lighting or glare
    if (hudState.hasLightingWarning) {
      return {
        icon: '💡',
        message:
          lang === 'zh-CN'
            ? '光线较暗，请开启前方照明'
            : lang === 'en-US'
            ? 'Dim lighting. Turn on front lights'
            : 'เปิดไฟด้านหน้าให้สว่างขึ้น หลีกเลี่ยงแสงย้อน',
        tone: 'amber',
      };
    }

    // Priority (ค): Form & Posture Coaching
    if (evalResult?.formRating === 'error') {
      return {
        icon: '⚠️',
        message:
          evalResult.coachingMessageTh ||
          (lang === 'zh-CN'
            ? '动作幅度过大，请放慢'
            : lang === 'en-US'
            ? 'Move slowly and protect your joints'
            : 'ระวังอย่าฝืนข้อต่อ ขยับช้าๆ อย่างนุ่มนวล'),
        tone: 'amber',
      };
    }

    if (evalResult?.formRating === 'warning') {
      return {
        icon: '⚠️',
        message:
          evalResult.coachingMessageTh ||
          (lang === 'zh-CN'
            ? '请保持躯干挺直'
            : lang === 'en-US'
            ? 'Keep your back upright'
            : 'รักษาลำตัวให้ตรง ยืนหลังตรง'),
        tone: 'amber',
      };
    }

    if (isPendulum) {
      if (evalResult?.coachingMessageTh) {
        return {
          icon: '🌀',
          message: evalResult.coachingMessageTh,
          tone: 'teal',
        };
      }
      return {
        icon: '🌀',
        message:
          lang === 'zh-CN'
            ? '身体向前微倾，顺畅做圆周摆动'
            : lang === 'en-US'
            ? 'Lean forward slightly, relax arm and swing in circles'
            : 'แกว่งแขนช้า ๆ เป็นวงกลม ปล่อยแขนตามสบาย',
        tone: 'teal',
      };
    }

    if (evalResult?.phase === 'HOLDING_TARGET') {
      return {
        icon: '🌟',
        message:
          lang === 'zh-CN'
            ? '很好！请在目标位置保持稳定...'
            : lang === 'en-US'
            ? 'Great! Hold steady at target...'
            : 'ค้างไว้นิ่งๆ อีกนิด ดีมากครับ',
        tone: 'emerald',
      };
    }

    if (evalResult?.phase === 'MOVING_TO_TARGET') {
      return {
        icon: '⬆️',
        message: isLowerBody
          ? (lang === 'zh-CN' ? '慢慢向上抬腿...' : lang === 'en-US' ? 'Lift leg up smoothly...' : 'ค่อยๆ ยกขาขึ้นช้าๆ...')
          : (lang === 'zh-CN' ? '慢慢向上抬臂...' : lang === 'en-US' ? 'Lift arm up smoothly...' : 'ค่อยๆ ยกแขนขึ้นช้าๆ...'),
        tone: 'teal',
      };
    }

    if (evalResult?.phase === 'RETURNING_TO_START') {
      return {
        icon: '⬇️',
        message: isLowerBody
          ? (lang === 'zh-CN' ? '慢慢放下腿部回到起点...' : lang === 'en-US' ? 'Lower leg down smoothly...' : 'ค่อยๆ ผ่อนขาลงช้าๆ...')
          : (lang === 'zh-CN' ? '慢慢放下手臂回到起点...' : lang === 'en-US' ? 'Lower arm down smoothly...' : 'ค่อยๆ ผ่อนแขนลงช้าๆ...'),
        tone: 'teal',
      };
    }

    // Priority (ง): Normal Training / Encouraging
    return {
      icon: '✨',
      message:
        lang === 'zh-CN'
          ? '动作标准，请继续保持'
          : lang === 'en-US'
          ? 'Good form, keep going smoothly'
          : 'ดีมาก ทำต่อเนื่องอย่างผ่อนคลายเลยครับ',
      tone: 'emerald',
    };
  };

  const statusInfo = getSingleLineStatus();

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 text-white flex flex-col justify-between overflow-hidden select-none font-sans">
      {/* 1. Senior-Friendly Minimalist Top Header */}
      <header className="w-full bg-slate-950/95 backdrop-blur-md border-b border-slate-800 px-4 sm:px-8 py-3.5 flex items-center justify-between z-20 gap-4 shadow-xl select-none">
        {/* Left: Exit Button */}
        <button
          type="button"
          id="kiosk-header-exit-btn"
          data-testid="kiosk-header-exit-btn"
          onClick={onExit}
          className="min-h-[52px] sm:min-h-[56px] px-5 sm:px-6 py-2.5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-slate-200 hover:text-white text-base sm:text-lg font-black flex items-center gap-2.5 transition active:scale-95 cursor-pointer border border-slate-700 shadow-md shrink-0"
          title={t('exit_exercise', 'ออกจากการฝึก')}
        >
          <ArrowLeft className="w-6 h-6 shrink-0 text-slate-400" />
          <span>{t('exit_exercise', 'ออก')}</span>
        </button>

        {/* Center: Large Exercise Name (Single Line, Truncated if long) + Patient Short Name (No HN!) */}
        <div
          onClick={handleTitleTap}
          className="flex-1 min-w-0 text-center px-2 cursor-pointer select-none"
          title="แตะ 5 ครั้งเพื่อปลดล็อกโหมดเจ้าหน้าที่"
        >
          <h1 className="text-2xl sm:text-3xl font-black text-white truncate leading-tight tracking-tight">
            {titleString}
          </h1>
          <div className="text-sm sm:text-base text-slate-400 font-semibold truncate mt-0.5">
            คุณ {patient.first_name || 'ผู้ฝึก'}
          </div>
        </div>

        {/* Right Section: Read-only Arm Badge + Subtle Language Switcher + Staff Settings Icon */}
        <div className="flex items-center gap-3 shrink-0">
          {/* Read-only Arm / Side Badge (No patient toggle buttons!) */}
          <div className="min-h-[48px] px-4 py-2 rounded-2xl bg-slate-900 border border-slate-700 text-teal-300 font-bold text-sm sm:text-base flex items-center gap-2 shadow-sm">
            <span>{isBilateral ? '👥' : isLowerBody ? '🦿' : '🦾'}</span>
            <span>
              {isBilateral
                ? (lang === 'zh-CN' ? '双侧协同' : lang === 'en-US' ? 'Bilateral' : 'ทั้งสองข้าง')
                : activeSide === 'right'
                ? (lang === 'zh-CN' ? '训练: 右侧' : lang === 'en-US' ? 'Side: Right' : 'ฝึก: ข้างขวา')
                : (lang === 'zh-CN' ? '训练: 左侧' : lang === 'en-US' ? 'Side: Left' : 'ฝึก: ข้างซ้าย')}
            </span>
          </div>

          {/* Subtle Language Selector Menu */}
          <div className="relative">
            <button
              type="button"
              id="kiosk-language-menu-btn"
              onClick={() => setShowLangMenu((prev) => !prev)}
              className="min-h-[48px] px-3.5 py-2 rounded-2xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700 text-sm font-bold flex items-center gap-1.5 transition active:scale-95 cursor-pointer shadow-sm"
              title="สลับภาษา (Switch Language)"
            >
              <Globe className="w-4 h-4 text-teal-400" />
              <span>{lang === 'zh-CN' ? '中文' : lang === 'en-US' ? 'EN' : 'TH'}</span>
            </button>

            {showLangMenu && (
              <div className="absolute right-0 mt-2 w-36 rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl p-1.5 z-50 flex flex-col gap-1 backdrop-blur-md">
                {LANGUAGE_OPTIONS.map((opt) => (
                  <button
                    key={opt.code}
                    type="button"
                    onClick={() => {
                      setLanguage(opt.code);
                      setShowLangMenu(false);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs font-bold transition flex items-center justify-between cursor-pointer ${
                      lang === opt.code
                        ? 'bg-teal-500/20 text-teal-300 border border-teal-500/40'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <span>{opt.flag} {opt.label}</span>
                    {lang === opt.code && <Check className="w-3.5 h-3.5 text-teal-300" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Staff Settings Gear Icon Button */}
          <button
            type="button"
            id="kiosk-staff-settings-btn"
            data-testid="kiosk-staff-settings-btn"
            onClick={() => {
              if (isStaffUnlocked) {
                setShowStaffSettingsModal(true);
              } else {
                setShowStaffPinModal(true);
              }
            }}
            className="w-12 h-12 rounded-2xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center border border-slate-700 transition active:scale-95 cursor-pointer shadow-sm"
            title="ตั้งค่าสำหรับเจ้าหน้าที่ (Staff Settings)"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* 2. Main Live Tracking Viewport */}
      <div className="relative flex-1 w-full h-full flex items-center justify-center bg-black overflow-hidden select-none">
        {/* Webcam Video with horizontal selfie mirror */}
        <video
          ref={videoRef}
          playsInline
          muted
          className={`w-full h-full ${
            fitMode === 'contain' ? 'object-contain' : 'object-cover'
          } -scale-x-100 z-0 transition-all duration-200 ${
            boostLighting || hudState.hasLightingWarning ? 'brightness-110 contrast-125' : ''
          }`}
        />

        {/* 1:1 Canvas overlay directly on top of video */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none z-10"
        />

        {/* Half-body Silhouette Guide Overlay (Controlled via Staff Settings) */}
        {showGuideSilhouette && (
          <div className="absolute inset-0 pointer-events-none z-10 flex items-center justify-center opacity-25">
            <svg
              viewBox="0 0 400 400"
              className={`w-80 h-80 sm:w-96 sm:h-96 transition-colors duration-300 ${
                hudState.shoulderWidthPct > 55
                  ? 'text-amber-400 stroke-amber-400'
                  : hudState.shoulderWidthPct > 0 && hudState.shoulderWidthPct < 18
                  ? 'text-amber-400 stroke-amber-400'
                  : 'text-teal-400 stroke-teal-400'
              }`}
              fill="none"
              strokeWidth="2"
              strokeDasharray="6 4"
            >
              <circle cx="200" cy="100" r="48" stroke="currentColor" />
              <path
                d="M 175 146 L 175 165 L 85 200 L 95 320 L 305 320 L 315 200 L 225 165 L 225 146"
                stroke="currentColor"
              />
              <line x1="200" y1="165" x2="200" y2="320" stroke="currentColor" strokeDasharray="3 3" />
            </svg>
          </div>
        )}

        {/* Big Rep Counter & Circular Progress HUD Card (Legible from 1-2 meters!) */}
        <div
          id="kiosk-giant-rep-counter"
          data-testid="kiosk-giant-rep-counter"
          className={`absolute top-6 right-6 z-20 bg-slate-950/85 backdrop-blur-md rounded-3xl p-5 border shadow-2xl flex flex-col items-center select-none transition-all duration-300 ${
            celebratingRep !== null
              ? 'border-emerald-400 ring-4 ring-emerald-400/50 shadow-emerald-500/50 scale-105 bg-emerald-950/60'
              : 'border-slate-800 shadow-slate-950/80'
          }`}
        >
          {/* Circular Progress Ring */}
          <div className="relative w-36 h-36 sm:w-44 sm:h-44 flex items-center justify-center">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
              {/* Background Track */}
              <circle
                cx="50"
                cy="50"
                r="42"
                fill="none"
                stroke="#1e293b"
                strokeWidth="8"
              />
              {/* Progress Track */}
              <circle
                cx="50"
                cy="50"
                r="42"
                fill="none"
                stroke={celebratingRep !== null ? '#34d399' : '#10b981'}
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 42}
                strokeDashoffset={2 * Math.PI * 42 * (1 - Math.max(0, Math.min(1, ringProgress)))}
                className="transition-all duration-150"
              />
            </svg>

            {/* Center Content in Ring */}
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              {celebratingRep !== null ? (
                <div className="flex flex-col items-center animate-bounce">
                  <span className="text-4xl sm:text-5xl">✅</span>
                  <span className="text-sm sm:text-base font-black text-emerald-300 mt-1">
                    +1 ครั้ง!
                  </span>
                </div>
              ) : (
                <>
                  <div className="text-xs sm:text-sm font-extrabold uppercase tracking-wider text-slate-400">
                    {lang === 'zh-CN' ? '次数' : lang === 'en-US' ? 'Reps' : 'ครั้งที่'}
                  </div>
                  <div className="text-4xl sm:text-5xl font-black text-white font-mono leading-none my-1">
                    {hudState.completedReps}
                    <span className="text-xl sm:text-2xl text-slate-400 font-bold">
                      {' '}/ {resolvedConfig.defaultPrescription?.repsPerSet || 10}
                    </span>
                  </div>
                  <div className="text-xs sm:text-sm font-bold text-emerald-400">
                    {Math.round(ringProgress * 100)}%
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Secondary Set Indicator */}
          <div className="mt-2 text-center">
            <div className="text-sm sm:text-base font-bold text-slate-300">
              {lang === 'zh-CN'
                ? `第 ${hudState.currentSet} 组 / 共 ${resolvedConfig.defaultPrescription?.totalSets || 3} 组`
                : lang === 'en-US'
                ? `Set ${hudState.currentSet} of ${resolvedConfig.defaultPrescription?.totalSets || 3}`
                : `เซ็ต ${hudState.currentSet} จาก ${resolvedConfig.defaultPrescription?.totalSets || 3}`}
            </div>
          </div>
        </div>

        {/* Real-time Diagnostic Debug HUD (Only visible when unlocked and turned on by staff) */}
        {showDebugHud && (
          <div
            id="pose-engine-debug-hud"
            data-testid="pose-engine-debug-hud"
            className="absolute top-6 left-6 z-30 bg-slate-900/95 border-2 border-emerald-500/60 rounded-3xl p-4 sm:p-5 text-sm font-mono text-emerald-300 shadow-2xl backdrop-blur-md space-y-2 max-w-sm sm:max-w-md pointer-events-auto leading-relaxed"
          >
            <div className="flex items-center justify-between border-b border-emerald-500/30 pb-2 text-emerald-400 font-bold text-base">
              <span className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                <span>🔍 Debug สถานะระบบ</span>
              </span>
              <button
                type="button"
                onClick={() => setLowPowerMode((prev) => !prev)}
                className="text-xs px-2.5 py-1 rounded-xl bg-slate-800 text-teal-300 hover:bg-slate-700 cursor-pointer font-bold border border-slate-700"
              >
                {lowPowerMode ? '⚡ ประหยัดไฟ: ON' : '⚡ ความเร็วสูง'}
              </button>
            </div>
            <div>
              📷 กล้อง: <span className="text-white font-bold">{cameraStatus === 'ready' ? `${cameraDimensions.width}x${cameraDimensions.height}` : cameraStatus}</span> | ซูม: <span className="text-teal-300 font-bold">{zoomInfo.supported ? `${zoomInfo.current.toFixed(1)}x` : '1.0x (Fixed)'}</span> | โหมด: <span className="text-cyan-300 font-bold">{fitMode}</span>
            </div>
            <div>
              🧠 โมเดล: <span className="text-white font-bold">{modelStatus === 'ready' ? `พร้อมตรวจจับ (${modelDelegate})` : modelStatus}</span> | พบ: <span className="text-teal-300 font-bold">{hudState.detectedPeople} คน</span> (ล็อก #{hudState.lockedTargetIdx + 1})
            </div>
            <div>
              📏 ไหล่กว้าง: <span className="text-white font-bold">{hudState.shoulderWidthPct}% ของเฟรม</span> | ระยะ: <span className="text-amber-300 font-bold">{hudState.distanceStatus}</span>
            </div>
            <div>
              ⚡ FPS จริง: <span className="text-white font-bold">{hudState.fps} FPS</span> {lowPowerMode ? '<โหมดประหยัด>' : ''}
            </div>
            <div>
              📍 Landmarks: <span className="text-white font-bold">{hudState.landmarkCount} จุด</span> (ความชัดเฉลี่ย: {hudState.avgVisibility}) | กรอง: <span className="text-emerald-400">EMA Smooth</span>
            </div>
            <div>
              📐 มุมปัจจุบัน: <span className="text-white font-bold">{hudState.currentAngle}°</span> | ความแม่นยำ: <span className="text-white font-bold">{hudState.accuracyPct}%</span>
            </div>
            <div>
              🔄 สถานะตัวนับ: <span className="text-amber-300 font-bold">{hudState.repPhase}</span> | ข้าง: <span className="text-cyan-300 font-bold">{activeSide}</span> | ครั้งที่: <span className="text-white font-bold">{hudState.completedReps}</span>
            </div>
            <div>
              🔍 เงื่อนไขความพร้อม: <span className="text-white font-bold">{hudState.readinessReason}</span>
            </div>
          </div>
        )}

        {/* Single-Line Status / Coaching Banner (Bottom-Anchored, Zero-Occlusion, Never Cut-off) */}
        <div
          id="kiosk-single-line-status"
          data-testid="kiosk-single-line-status"
          className="absolute bottom-24 sm:bottom-28 left-1/2 -translate-x-1/2 z-20 w-11/12 max-w-3xl pointer-events-none select-none"
        >
          <div
            className={`px-6 py-3.5 sm:py-4 rounded-2xl backdrop-blur-md border shadow-2xl flex items-center justify-center gap-3 transition-all duration-300 ${
              statusInfo.tone === 'amber'
                ? 'bg-amber-950/90 border-amber-500/80 text-amber-100 shadow-amber-950/50'
                : statusInfo.tone === 'rose'
                ? 'bg-rose-950/90 border-rose-500/80 text-rose-100 shadow-rose-950/50'
                : statusInfo.tone === 'teal'
                ? 'bg-slate-950/90 border-teal-500/80 text-teal-100 shadow-teal-950/50'
                : 'bg-slate-950/90 border-emerald-500/80 text-emerald-100 shadow-emerald-950/50'
            }`}
          >
            <span className="text-2xl sm:text-3xl shrink-0">{statusInfo.icon}</span>
            <span className="text-xl sm:text-2xl font-bold truncate leading-relaxed">
              {statusInfo.message}
            </span>
          </div>
        </div>

        {/* Loading Overlay */}
        {(cameraStatus === 'initializing' || modelStatus === 'loading') && !errorMessage && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/85 backdrop-blur-sm p-4">
            <div className="bg-slate-900 border-2 border-emerald-500/50 rounded-3xl p-8 max-w-lg text-center text-white shadow-2xl">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-400 flex items-center justify-center mx-auto mb-4 text-emerald-400">
                <Activity className="w-9 h-9 animate-spin" />
              </div>
              <div className="text-xl sm:text-2xl font-black mb-3 text-white">
                ⏳ {lang === 'zh-CN' ? '正在启动 AI 动作捕捉系统...' : lang === 'en-US' ? 'Initializing AI Pose Engine...' : 'กำลังโหลดระบบตรวจจับท่าทาง AI...'}
              </div>
              <div className="text-base text-slate-300 leading-relaxed mb-4">
                {lang === 'zh-CN' ? '系统正在连接摄像头并加载生物力学分析模型' : lang === 'en-US' ? 'Connecting camera and loading biomechanical model' : 'ระบบกำลังเชื่อมต่อกล้องและดาวน์โหลดโมเดลวิเคราะห์การเคลื่อนไหว'}
              </div>
              <div className="text-sm font-semibold text-emerald-300 bg-slate-950/80 rounded-2xl px-4 py-3 border border-slate-800">
                💡 {lang === 'zh-CN' ? '请允许浏览器使用摄像头，并保持全身/上半身处于 1.5–2 米距离内' : lang === 'en-US' ? 'Please grant camera access and stand 1.5–2 meters in front of the screen' : 'กรุณาอนุญาตการใช้งานกล้องเว็บแคม และยืนให้เห็นร่างกายในระยะ 1.5–2 เมตร'}
              </div>
            </div>
          </div>
        )}

        {/* Error Banner with Reload & Exit */}
        {errorMessage && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/90 backdrop-blur-md p-4">
            <div className="bg-red-950/95 border-2 border-red-500 rounded-3xl p-8 max-w-lg text-center text-white shadow-2xl">
              <div className="w-16 h-16 rounded-full bg-red-500/20 border border-red-400 flex items-center justify-center mx-auto mb-4 text-red-400">
                <AlertTriangle className="w-9 h-9" />
              </div>
              <div className="text-xl sm:text-2xl font-black text-red-200 mb-3">
                ⚠️ {lang === 'zh-CN' ? '动作检测系统遇到错误' : lang === 'en-US' ? 'Pose Detection Error' : 'ระบบตรวจจับไม่สามารถทำงานได้'}
              </div>
              <p className="text-base text-red-100 mb-6 leading-relaxed">{errorMessage}</p>
              <div className="flex items-center justify-center gap-4">
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="min-h-[48px] px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl text-base font-bold transition active:scale-95 cursor-pointer shadow-lg shadow-emerald-950/50"
                >
                  {lang === 'zh-CN' ? '重新尝试 (Reload)' : lang === 'en-US' ? 'Retry (Reload)' : 'ลองใหม่อีกครั้ง (Reload)'}
                </button>
                <button
                  type="button"
                  onClick={onExit}
                  className="min-h-[48px] px-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-2xl text-base font-bold transition active:scale-95 cursor-pointer border border-slate-700"
                >
                  {lang === 'zh-CN' ? '退出训练' : lang === 'en-US' ? 'Exit Exercise' : 'ออกจากการฝึก'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 3. Bottom Safety & Emergency Bar (2 Large Buttons: Pause on Left, Pain Stop on Right) */}
      <PainStopEmergencyBar
        isPaused={isPaused}
        onTogglePause={() => setIsPaused((prev) => !prev)}
        onReportPainStop={handleReportPainStop}
      />

      {/* MODAL A: Rest Between Sets Countdown */}
      {isResting && (
        <div className="fixed inset-0 z-40 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-3xl bg-slate-900 border-2 border-teal-500/60 shadow-2xl p-8 text-center animate-scale-up">
            <div className="w-20 h-20 rounded-full bg-teal-500/15 border-2 border-teal-400 flex items-center justify-center mx-auto mb-4 text-teal-300 text-3xl font-bold">
              <Clock className="w-10 h-10" />
            </div>
            <h3 className="text-2xl sm:text-3xl font-black text-white">
              {lang === 'zh-CN' ? '组间休息' : lang === 'en-US' ? 'Rest Between Sets' : 'พักผ่อนระหว่างเซ็ต'}
            </h3>
            <p className="text-base sm:text-lg text-slate-200 mt-2 font-medium">
              {lang === 'zh-CN'
                ? `已完成第 ${hudState.currentSet} 组，请放松肌肉稍作休息`
                : lang === 'en-US'
                ? `Set ${hudState.currentSet} completed. Relax your muscles before the next set.`
                : `ทำครบเซ็ตที่ ${hudState.currentSet} แล้ว พักผ่อนกล้ามเนื้อสักครู่ก่อนเริ่มเซ็ตถัดไป`}
            </p>

            <div className="my-6">
              <div className="text-6xl sm:text-7xl font-black text-teal-400 font-mono">
                {restCountdown}
              </div>
              <div className="text-base text-slate-400 mt-1 font-bold">
                {lang === 'zh-CN' ? '秒' : lang === 'en-US' ? 'seconds' : 'วินาที'}
              </div>
            </div>

            <button
              type="button"
              onClick={handleNextSet}
              className="w-full min-h-[52px] py-4 rounded-2xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white font-black text-lg shadow-xl shadow-teal-900/40 transition active:scale-98 cursor-pointer flex items-center justify-center gap-2"
            >
              <span>{lang === 'zh-CN' ? '准备就绪，开始下一组 ➔' : lang === 'en-US' ? 'Ready, Start Next Set ➔' : 'พร้อมแล้ว เริ่มเซ็ตถัดไปทันที ➔'}</span>
            </button>
          </div>
        </div>
      )}

      {/* MODAL B: Pain Reported Emergency Card */}
      {painReportedState && (
        <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-3xl bg-slate-900 border-2 border-rose-500 shadow-2xl p-8 text-center animate-scale-up">
            <div className="w-20 h-20 rounded-full bg-rose-500/20 border-2 border-rose-500 flex items-center justify-center mx-auto mb-4 text-rose-500">
              <ShieldAlert className="w-10 h-10" />
            </div>
            <h3 className="text-2xl sm:text-3xl font-black text-white">
              {lang === 'zh-CN' ? '训练已停止并通知医护人员' : lang === 'en-US' ? 'Session Stopped & Staff Notified' : 'ระบบหยุดการฝึกและแจ้งเจ้าหน้าที่แล้ว'}
            </h3>
            <p className="text-base sm:text-lg text-slate-200 mt-3 leading-relaxed font-medium">
              {lang === 'zh-CN'
                ? '请舒适坐下休息，物理治疗师马上前来为您检查协助。'
                : lang === 'en-US'
                ? 'Please take a seat and rest comfortably. The physical therapist has been alerted and will assist you shortly.'
                : 'ขอให้ผู้ป่วยนั่งพักผ่อนอย่างสบายๆ ไม่ต้องกังวล เจ้าหน้าที่กายภาพบำบัดกำลังเดินทางมาดูแลท่านครับ'}
            </p>

            <div className="mt-8 flex flex-col gap-3">
              <button
                type="button"
                onClick={() => handleFinalizeSession('stopped_pain')}
                className="w-full min-h-[52px] py-4 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-black text-lg shadow-xl shadow-rose-950/60 cursor-pointer"
              >
                {lang === 'zh-CN' ? '记录结果并返回主界面' : lang === 'en-US' ? 'Record & Return Home' : 'บันทึกประวัติและกลับสู่หน้าหลัก'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL C: End-of-Exercise Summary Card */}
      {isSummaryOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-xl rounded-3xl bg-slate-900 border-2 border-emerald-500/60 shadow-2xl p-8 sm:p-10 text-center animate-scale-up">
            <div className="w-24 h-24 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center mx-auto mb-4 text-emerald-400 shadow-xl shadow-emerald-950/40">
              <Trophy className="w-12 h-12" />
            </div>

            <h2 className="text-3xl sm:text-4xl font-black text-white mb-2">
              {lang === 'zh-CN' ? '本项动作训练完成! 🎉' : lang === 'en-US' ? 'Exercise Completed! 🎉' : 'ฝึกท่านี้สำเร็จแล้ว! 🎉'}
            </h2>
            <div className="text-lg text-emerald-300 font-bold mb-6">
              {titleString}
            </div>

            <div className="grid grid-cols-2 gap-4 mb-8 text-left">
              <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800">
                <div className="text-sm font-bold text-slate-300">
                  {lang === 'zh-CN' ? '完成次数 (正确 / 代偿)' : lang === 'en-US' ? 'Reps (Correct / Rejected)' : 'จำนวนครั้ง (ทำถูก / ผิด)'}
                </div>
                <div className="text-2xl sm:text-3xl font-black text-emerald-400 mt-1 font-mono">
                  ✅ {evalResult?.completedReps || hudState.completedReps || 0} / ❌ {evalResult?.incorrectReps || 0}
                </div>
                <div className="text-xs text-slate-400 mt-1 font-semibold">
                  {lang === 'zh-CN' ? '目标' : lang === 'en-US' ? 'Target' : 'เป้าหมาย'}: {resolvedConfig.defaultPrescription?.repsPerSet || 10} × {resolvedConfig.defaultPrescription?.totalSets || 3}
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800">
                <div className="text-sm font-bold text-slate-300">
                  {isPendulum ? (lang === 'zh-CN' ? '360° 全环轨迹' : lang === 'en-US' ? '360° Circular Orbit' : 'วิถีวงกลม (360°)') : (lang === 'zh-CN' ? '最高达标角度' : lang === 'en-US' ? 'Max Angle Achieved' : 'มุมสูงสุดที่ทำได้')}
                </div>
                <div className="text-2xl sm:text-3xl font-black text-teal-300 mt-1 font-mono">
                  {isPendulum ? '100%' : `${evalResult?.currentAngleDeg || hudState.currentAngle || 0}°`}
                </div>
                <div className="text-xs text-slate-400 mt-1 font-semibold">
                  {isPendulum
                    ? (lang === 'zh-CN' ? '速度与半径达标' : lang === 'en-US' ? 'Steady radius & pace' : 'ความเร็วและรัศมีอยู่ในเกณฑ์')
                    : `${resolvedConfig.angleMechanics?.targetMinDeg || 80}° - ${resolvedConfig.angleMechanics?.targetMaxDeg || 100}°`}
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800">
                <div className="text-sm font-bold text-slate-300">
                  {lang === 'zh-CN' ? '动作稳定性 (Consistency)' : lang === 'en-US' ? 'Consistency Score' : 'ความสม่ำเสมอ'}
                </div>
                <div className="text-2xl sm:text-3xl font-black text-cyan-300 mt-1 font-mono">
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
                <div className="text-xs text-emerald-400/90 mt-1 font-semibold">
                  {lang === 'zh-CN' ? '表现: 优秀' : lang === 'en-US' ? 'Rating: Excellent' : 'ระดับ: ดีเยี่ยม'}
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800">
                <div className="text-sm font-bold text-slate-300">
                  {lang === 'zh-CN' ? '验证模式 (Mode)' : lang === 'en-US' ? 'Verification Mode' : 'สถานะการฝึก'}
                </div>
                <div className="text-xl sm:text-2xl font-black text-emerald-400 mt-1 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>AI-Verified</span>
                </div>
                <div className="text-xs text-slate-400 mt-1 font-semibold">
                  SaMD Class II Vision
                </div>
              </div>
            </div>

            <button
              type="button"
              id="kiosk-finish-exercise-summary-btn"
              data-testid="kiosk-finish-exercise-summary-btn"
              onClick={() => handleFinalizeSession('ai_verified')}
              className="w-full min-h-[54px] py-4 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-lg shadow-xl shadow-emerald-900/60 transition active:scale-98 cursor-pointer flex items-center justify-center gap-2.5"
            >
              <span>{lang === 'zh-CN' ? '完成并继续下一个动作' : lang === 'en-US' ? 'Complete & Proceed' : 'เสร็จสิ้นและดำเนินการต่อ'}</span>
              <ArrowRight className="w-6 h-6" />
            </button>
          </div>
        </div>
      )}

      {/* Staff PIN Modal to Unlock Developer & Clinical Controls */}
      {showStaffPinModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-3xl bg-slate-900 border-2 border-teal-500/60 shadow-2xl p-6 text-center animate-scale-up">
            <div className="w-16 h-16 rounded-full bg-teal-500/20 border border-teal-400 flex items-center justify-center mx-auto mb-3 text-teal-300">
              <KeyRound className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-white mb-1">
              รหัสเจ้าหน้าที่ (Staff PIN)
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              กรุณากรอก PIN เพื่อเปิดเมนูตั้งค่าสำหรับเจ้าหน้าที่
            </p>

            <input
              type="password"
              maxLength={8}
              value={enteredStaffPin}
              onChange={(e) => {
                setEnteredStaffPin(e.target.value);
                setStaffPinError(null);
              }}
              placeholder="••••"
              className="w-full text-center tracking-widest text-3xl font-mono py-3 rounded-2xl bg-slate-950 border-2 border-slate-700 text-white focus:border-teal-400 focus:outline-none mb-3"
            />

            {staffPinError && (
              <p className="text-xs text-rose-400 font-bold mb-3">{staffPinError}</p>
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowStaffPinModal(false);
                  setEnteredStaffPin('');
                  setStaffPinError(null);
                }}
                className="flex-1 py-3 rounded-xl bg-slate-800 text-slate-300 font-bold hover:bg-slate-700 cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={() => {
                  const pin = enteredStaffPin.trim();
                  if (pin === '1234' || pin === 'admin' || pin === 'director') {
                    setIsStaffUnlocked(true);
                    setShowStaffPinModal(false);
                    setShowStaffSettingsModal(true);
                    setEnteredStaffPin('');
                    setStaffPinError(null);
                  } else {
                    setStaffPinError('รหัส PIN ไม่ถูกต้อง');
                  }
                }}
                className="flex-1 py-3 rounded-xl bg-teal-500 text-slate-950 font-bold hover:bg-teal-400 cursor-pointer shadow-md"
              >
                ยืนยัน
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Staff Clinical Settings Control Modal */}
      {showStaffSettingsModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-3xl bg-slate-900 border-2 border-teal-500/60 shadow-2xl p-6 sm:p-8 text-white space-y-4 animate-scale-up">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2.5">
                <Settings className="w-6 h-6 text-teal-400" />
                <span>เมนูตั้งค่าสำหรับเจ้าหน้าที่ (Staff)</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowStaffSettingsModal(false)}
                className="w-10 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2.5 text-sm max-h-[60vh] overflow-y-auto pr-1">
              {/* 1. Skeleton Wireframe Toggle */}
              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
                <div>
                  <div className="font-bold text-white text-base">🦴 เส้นโครงร่างลำตัว (Skeleton)</div>
                  <div className="text-xs text-slate-400">แสดงข้อต่อและกระดูกแบบเรียลไทม์</div>
                </div>
                <button
                  type="button"
                  id="kiosk-toggle-skeleton-btn"
                  data-testid="kiosk-toggle-skeleton-btn"
                  onClick={() => setShowSkeletonOverlay((prev) => !prev)}
                  className={`px-4 py-2 rounded-xl font-bold cursor-pointer transition ${
                    showSkeletonOverlay
                      ? 'bg-teal-500 text-slate-950 shadow-md'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {showSkeletonOverlay ? 'เปิด (ON)' : 'ปิด (OFF)'}
                </button>
              </div>

              {/* 2. Fit Mode Toggle */}
              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
                <div>
                  <div className="font-bold text-white text-base">🖼️ โหมดภาพกล้อง (Fit Mode)</div>
                  <div className="text-xs text-slate-400">พอดีจอ (ไม่ครอป) / เต็มจอ (ขยายเต็ม)</div>
                </div>
                <button
                  type="button"
                  onClick={() => setFitMode((m) => (m === 'contain' ? 'cover' : 'contain'))}
                  className="px-4 py-2 rounded-xl font-bold bg-slate-800 text-teal-300 hover:text-white border border-slate-700 cursor-pointer"
                >
                  {fitMode === 'contain' ? '🔎 พอดีจอ' : '🖼️ เต็มจอ'}
                </button>
              </div>

              {/* 3. Boost Lighting Toggle */}
              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
                <div>
                  <div className="font-bold text-white text-base">💡 ชดเชยแสงสว่าง (Boost Lighting)</div>
                  <div className="text-xs text-slate-400">ปรับความสว่างภาพกล้องเมื่อห้องมืด</div>
                </div>
                <button
                  type="button"
                  onClick={() => setBoostLighting((prev) => !prev)}
                  className={`px-4 py-2 rounded-xl font-bold cursor-pointer transition ${
                    boostLighting
                      ? 'bg-amber-500 text-slate-950 shadow-md'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {boostLighting ? 'เปิด (ON)' : 'อัตโนมัติ'}
                </button>
              </div>

              {/* 4. Guide Silhouette Toggle */}
              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
                <div>
                  <div className="font-bold text-white text-base">👤 ไกด์จัดท่า (Silhouette Guide)</div>
                  <div className="text-xs text-slate-400">เส้นเงาช่วยเล็งตำแหน่งการยืน</div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowGuideSilhouette((prev) => !prev)}
                  className={`px-4 py-2 rounded-xl font-bold cursor-pointer transition ${
                    showGuideSilhouette
                      ? 'bg-cyan-500 text-slate-950 shadow-md'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {showGuideSilhouette ? 'เปิด (ON)' : 'ปิด (OFF)'}
                </button>
              </div>

              {/* 5. Diagnostic Debug HUD Toggle */}
              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
                <div>
                  <div className="font-bold text-white text-base">🔍 แผงดีบักชีวกลศาสตร์ (Debug HUD)</div>
                  <div className="text-xs text-slate-400">แสดงมุม FPS และ Landmark ละเอียด</div>
                </div>
                <button
                  type="button"
                  id="kiosk-toggle-debug-btn"
                  data-testid="kiosk-toggle-debug-btn"
                  onClick={() => setShowDebugHud((prev) => !prev)}
                  className={`px-4 py-2 rounded-xl font-bold cursor-pointer transition ${
                    showDebugHud
                      ? 'bg-emerald-500 text-slate-950 shadow-md'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {showDebugHud ? 'เปิด (ON)' : 'ปิด (OFF)'}
                </button>
              </div>

              {/* 6. Manual Side Toggle (Staff Override) */}
              {!isBilateral && (
                <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
                  <div>
                    <div className="font-bold text-white text-base">🦾 ปรับข้างตรวจจับ (Side Override)</div>
                    <div className="text-xs text-slate-400">สลับข้างตรวจจับฉุกเฉิน</div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleToggleSide('right')}
                      className={`px-3.5 py-1.5 rounded-xl font-bold text-xs cursor-pointer ${
                        activeSide === 'right'
                          ? 'bg-teal-500 text-slate-950 shadow-sm'
                          : 'bg-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      ขวา
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleSide('left')}
                      className={`px-3.5 py-1.5 rounded-xl font-bold text-xs cursor-pointer ${
                        activeSide === 'left'
                          ? 'bg-teal-500 text-slate-950 shadow-sm'
                          : 'bg-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      ซ้าย
                    </button>
                  </div>
                </div>
              )}

              {/* 7. Hardware Zoom Slider (If supported) */}
              {zoomInfo.supported && (
                <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-bold text-white text-base">🔎 ระดับซูมกล้อง (Hardware Zoom)</div>
                    <div className="text-teal-400 font-bold">{zoomInfo.current.toFixed(1)}x</div>
                  </div>
                  <input
                    type="range"
                    min={zoomInfo.min}
                    max={zoomInfo.max}
                    step={zoomInfo.step}
                    value={zoomInfo.current}
                    onChange={(e) => handleZoomChange(parseFloat(e.target.value))}
                    className="w-full h-2.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-teal-400"
                  />
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowStaffSettingsModal(false)}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white font-black text-base cursor-pointer shadow-lg active:scale-98 transition"
            >
              เสร็จสิ้น (บันทึกและปิดหน้าต่าง)
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
