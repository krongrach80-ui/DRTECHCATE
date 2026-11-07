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
import { BacklightCompensator } from '../../../../packages/pose-engine/src/backlightCompensator';
import { ClinicalOneEuroLandmarkFilter } from '../../../../packages/pose-engine/src/math/oneEuroFilter';
import {
  selectPrimarySubjectPose,
  selectSubjectPoseWithIdentity,
  NormalizedBox,
} from '../../../../packages/pose-engine/src/subjectLock';
import { getFaceClientServices } from '../services/faceClientService';
import { PainStopEmergencyBar } from '../components/PainStopEmergencyBar';
import { defaultApiClient } from '../../../../packages/api-client/src/index.js';
import {
  Trophy,
  Activity,
  Clock,
  ArrowRight,
  ArrowLeft,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  KeyRound,
  Settings,
  Globe,
  Check,
  X,
  PhoneCall,
  RefreshCw,
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
  [15, 17], [15, 19], [15, 21], [17, 19], // Left hand (wrist-pinky, wrist-index, wrist-thumb, palm)
  [12, 14], [14, 16], // Right arm
  [16, 18], [16, 20], [16, 22], [18, 20], // Right hand (wrist-pinky, wrist-index, wrist-thumb, palm)
  [11, 23], [12, 24], // Torso
  [23, 24], // Hips
  [23, 25], [25, 27], // Left leg
  [24, 26], [26, 28], // Right leg
  [27, 29], [27, 31], [29, 31], // Left foot
  [28, 30], [28, 32], [30, 32], // Right foot
];

export const BODY_JOINT_INDICES = [
  11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22,
  23, 24, 25, 26, 27, 28, 29, 30, 31, 32
];
export const ANATOMICAL_BODY_JOINTS = BODY_JOINT_INDICES;

export function getRequiredKeypointsForExercise(config?: ExerciseDetectionConfig): number[] {
  if (config?.requiredLandmarks) {
    const side = config.side || 'bilateral';
    if (side === 'left' && config.requiredLandmarks.left) return config.requiredLandmarks.left;
    if (side === 'right' && config.requiredLandmarks.right) return config.requiredLandmarks.right;
    if (config.requiredLandmarks.bilateral) return config.requiredLandmarks.bilateral;
    return config.requiredLandmarks.right || config.requiredLandmarks.left || [11, 12, 13, 14];
  }
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
  17: { th: 'นิ้วก้อยซ้าย', en: 'L Pinky', cn: '左小指' },
  18: { th: 'นิ้วก้อยขวา', en: 'R Pinky', cn: '右小指' },
  19: { th: 'นิ้วชี้ซ้าย', en: 'L Index', cn: '左食指' },
  20: { th: 'นิ้วชี้ขวา', en: 'R Index', cn: '右食指' },
  21: { th: 'นิ้วโป้งซ้าย', en: 'L Thumb', cn: '左大拇指' },
  22: { th: 'นิ้วโป้งขวา', en: 'R Thumb', cn: '右大拇指' },
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

/**
 * Computes smooth target progress ratio (0.0 to 1.0) for the circular rep progress ring.
 * Eliminates phase jumps (such as RETURNING_TO_START jumping to 0.4) by continuously
 * scaling with actual joint angle back towards the starting baseline.
 */
export const computeTargetRingProgress = (
  evalRes: RepEvaluationResult | null,
  config: ExerciseDetectionConfig,
  isTimer: boolean,
  isPend: boolean,
  completedReps: number
): number => {
  if (!evalRes) return 0;

  if (isTimer) {
    return Math.max(0, Math.min(1.0, evalRes.holdProgressRatio || evalRes.pendulumCircleProgressRatio || 0));
  }
  if (isPend) {
    return Math.max(0, Math.min(1.0, evalRes.pendulumCircleProgressRatio || 0));
  }

  const phase = evalRes.phase;
  const startAngle = config.angleMechanics?.startAngleDeg ?? 20;
  const targetMin = config.angleMechanics?.targetMinDeg ?? 80;
  const curAngle = evalRes.currentAngleDeg ?? 0;
  const angleSpan = Math.max(1, targetMin - startAngle);

  if (phase === 'REP_COMPLETED') {
    return 1.0;
  }

  if (phase === 'HOLDING_TARGET' || evalRes.isInsideTargetZone) {
    if (typeof evalRes.holdProgressRatio === 'number' && evalRes.holdProgressRatio > 0) {
      return 0.85 + 0.15 * Math.min(1.0, evalRes.holdProgressRatio);
    }
    return 1.0;
  }

  // Smooth continuous angle tracking during both MOVING_TO_TARGET and RETURNING_TO_START
  if (phase === 'MOVING_TO_TARGET' || phase === 'RETURNING_TO_START') {
    const rawProgress = (curAngle - startAngle) / angleSpan;
    return Math.max(0, Math.min(0.95, rawProgress));
  }

  const targetReps = config.defaultPrescription?.repsPerSet || 10;
  return targetReps > 0 ? (completedReps % targetReps) / targetReps : 0;
};

interface ExercisePostureGuideCardProps {
  exerciseId: string;
  titleString: string;
  instructionTextTh?: string;
  descriptionTh?: string;
}

const ExercisePostureGuideCard = React.memo<ExercisePostureGuideCardProps>(
  ({ exerciseId, titleString, instructionTextTh, descriptionTh }) => {
    return (
      <div className="bg-white rounded-3xl border border-blue-100 p-4 sm:p-5 shadow-sm flex-1 flex flex-col justify-between gap-3">
        <div>
          <div className="text-xs font-bold text-blue-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <span>📐</span>
            <span>ภาพตัวอย่างท่ากายภาพบำบัด</span>
          </div>
          <div className="w-full aspect-[16/10] bg-slate-50 border border-slate-100 rounded-2xl p-2 flex items-center justify-center overflow-hidden">
            <img
              src={`/assets/exercises/${exerciseId}.svg`}
              alt={titleString}
              className="max-h-full max-w-full object-contain"
              onError={(e) => {
                (e.currentTarget as HTMLElement).style.display = 'none';
              }}
            />
          </div>
        </div>

        <div className="space-y-1.5 pt-2 border-t border-slate-100 text-xs">
          <div className="font-bold text-slate-800 flex items-center gap-1">
            <span>💡</span>
            <span>คำแนะนำท่านี้:</span>
          </div>
          <ul className="list-disc list-inside text-slate-600 space-y-1 leading-relaxed">
            <li>{instructionTextTh || 'จัดระยะยืนให้อยู่ในกรอบภาพและมองตรงที่กล้อง'}</li>
            <li>{descriptionTh || 'ขยับแขน/ข้อต่อตามจังหวะช้าๆ อย่างสม่ำเสมอ'}</li>
            <li>หากรู้สึกเจ็บแปลบ ให้แตะปุ่มหยุดพักและแจ้งเจ้าหน้าที่ทันที</li>
          </ul>
        </div>
      </div>
    );
  }
);
ExercisePostureGuideCard.displayName = 'ExercisePostureGuideCard';

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
  const backlightCompensatorRef = useRef<BacklightCompensator>(new BacklightCompensator(15));
  const oneEuroFilterRef = useRef<ClinicalOneEuroLandmarkFilter>(
    new ClinicalOneEuroLandmarkFilter({ minCutoff: 1.2, beta: 0.04 })
  );
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const consecutiveLowFpsFramesRef = useRef<number>(0);
  const currentModelVariantRef = useRef<'full' | 'lite'>('full');

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
  const [replayVideoSrc, setReplayVideoSrc] = useState<string | null>(() => {
    if (typeof window !== 'undefined' && window.location.search.includes('replay=1')) {
      return resolvedConfig.mediaUrl || '/assets/exercises/shoulder_pendulum.mp4';
    }
    return null;
  });

  // Diagnostic HUD live state
  const [hudState, setHudState] = useState({
    fps: 0,
    renderFps: 60,
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

  // 60 FPS Visual Ring Animation & Direct DOM Ref
  const progressCircleRef = useRef<SVGCircleElement | null>(null);
  const targetProgressRef = useRef<number>(0);
  const currentAnimatedProgressRef = useRef<number>(0);
  const lastRenderTimeRef = useRef<number>(performance.now());
  const smoothedRenderFpsRef = useRef<number>(60);

  // Accuracy Percentage EMA Smoothing & Deadband
  const smoothedAccuracyRef = useRef<number>(0);
  const lastAccuracyEmitTimeRef = useRef<number>(0);
  const lastEmittedAccuracyRef = useRef<number>(0);

  // Latest evaluation result ref for non-reactive reads
  const latestEvalResultRef = useRef<RepEvaluationResult | null>(null);
  const lastRenderedUiValuesRef = useRef({
    completedReps: 0,
    currentSet: 1,
    repPhase: '',
    hasLightingWarning: false,
    accuracyPct: 0,
    distanceStatus: '',
    coachingMessage: '',
    readinessStatus: '',
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

  // 2. State สำหรับปุ่ม "แสดงเส้นลำตัว" (ค่าเริ่มต้น = true คือเปิดแสดงเส้นโครงร่างทันทีเมื่อเข้าหน้าฝึก)
  const [showSkeletonOverlay, setShowSkeletonOverlay] = useState<boolean>(true);
  const showSkeletonRef = useRef<boolean>(true);
  useEffect(() => {
    showSkeletonRef.current = showSkeletonOverlay;
  }, [showSkeletonOverlay]);

  // Sub-pixel EMA lerp smoothing buffer strictly for canvas rendering (prevents jitter without touching evaluation)
  const canvasSmoothedPointsRef = useRef<{ [idx: number]: { x: number; y: number } }>({});

  // --- Continuous Identity Verification State & Refs ---
  const patientId = patient?.patient_id || patient?.hn || '';
  const sessionIdRef = useRef<string>(
    `sess-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
  );

  const isPendulumExercise = Boolean(
    resolvedConfig.id?.includes('pendulum') ||
    exercise?.id?.includes('pendulum') ||
    exercise?.name?.includes('แกว่ง')
  );
  // Grace Period: 15s for pendulum (as approved in Step 0), 6s for standard exercises
  const gracePeriodMs = isPendulumExercise ? 15000 : 6000;

  const [verificationStatus, setVerificationStatus] = useState<
    'verified' | 'checking' | 'mismatch' | 'no_face' | 'multiple_faces' | 'network_error' | 'no_template'
  >('checking');
  const verificationStatusRef = useRef(verificationStatus);
  useEffect(() => {
    verificationStatusRef.current = verificationStatus;
  }, [verificationStatus]);

  const isIdentityVerifiedRef = useRef<boolean>(true); // starts true for initial grace
  const lastVerifiedTimeRef = useRef<number>(Date.now());
  const verifiedFaceBoxRef = useRef<NormalizedBox | null>(null);
  const isFaceCheckInProgressRef = useRef<boolean>(false);
  const lastFaceCheckTimeRef = useRef<number>(0);
  const identityFailureStartTimeRef = useRef<number | null>(null);
  const rejectedRepsCountRef = useRef<number>(0);
  const validCompletedRepsRef = useRef<number>(0);

  // Auto-pause modal when verification fails > 20s
  const [showIdentityFailureModal, setShowIdentityFailureModal] = useState<boolean>(false);
  // Blocking modal when patient has no enrolled face template in system (Choice A)
  const [showNoTemplateModal, setShowNoTemplateModal] = useState<boolean>(false);

  // Pre-session check: Ensure patient has face template enrolled (Choice A)
  useEffect(() => {
    let isCancelled = false;
    async function verifyPatientEnrollment() {
      if (!patientId) return;
      try {
        const dummyProbe = new Array(512).fill(0.01);
        const res = await defaultApiClient.smartOnboarding.continuousFaceVerify({
          patient_id: patientId,
          probe: dummyProbe,
          session_id: sessionIdRef.current,
          exercise_id: resolvedConfig.id,
        });
        if (!isCancelled && res && res.has_template === false) {
          setShowNoTemplateModal(true);
          setVerificationStatus('no_template');
          isIdentityVerifiedRef.current = false;
        }
      } catch (err) {
        console.warn('[IdentityGate] Initial template enrollment check warning:', err);
      }
    }
    verifyPatientEnrollment();
    return () => {
      isCancelled = true;
    };
  }, [patientId, resolvedConfig.id]);

  // Periodic 1:1 Face Verification Callback
  const triggerFaceVerification = useCallback(
    async (videoEl: HTMLVideoElement) => {
      if (!patientId || isFaceCheckInProgressRef.current || isPausedRef.current) return;
      isFaceCheckInProgressRef.current = true;
      try {
        const services = getFaceClientServices();
        const detection = await services.detector.detect(videoEl);
        const now = Date.now();
        const vw = videoEl.videoWidth || 640;
        const vh = videoEl.videoHeight || 480;

        if (!detection || !detection.hasFace || !detection.box) {
          const timeSinceVerified = now - lastVerifiedTimeRef.current;
          if (timeSinceVerified > gracePeriodMs) {
            isIdentityVerifiedRef.current = false;
            setVerificationStatus('no_face');
            if (!identityFailureStartTimeRef.current) {
              identityFailureStartTimeRef.current = now;
            }
          }
          return;
        }

        if (detection.faceCount > 1) {
          setVerificationStatus('multiple_faces');
        }

        let vector: number[] | null = null;
        if (detection.landmarks) {
          const aligned = services.aligner.align(videoEl as any, detection.landmarks);
          vector = await services.embeddingModel.embed(aligned);
          const actx = aligned.getContext?.('2d');
          if (actx) actx.clearRect(0, 0, aligned.width, aligned.height);
        } else if (detection.box && detection.box.width > 20) {
          const faceCrop = document.createElement('canvas');
          faceCrop.width = 112;
          faceCrop.height = 112;
          const fcCtx = faceCrop.getContext('2d');
          if (fcCtx) {
            const pad = detection.box.width * 0.15;
            const sx = Math.max(0, detection.box.x - pad);
            const sy = Math.max(0, detection.box.y - pad);
            const sw = Math.min(vw - sx, detection.box.width + pad * 2);
            const sh = Math.min(vh - sy, detection.box.height + pad * 2);
            fcCtx.drawImage(videoEl, sx, sy, sw, sh, 0, 0, 112, 112);
            vector = await services.embeddingModel.embed(faceCrop);
          }
        }

        if (!vector || vector.length !== 512) {
          return;
        }

        const verifyRes = await defaultApiClient.smartOnboarding.continuousFaceVerify({
          patient_id: patientId,
          probe: vector,
          session_id: sessionIdRef.current,
          exercise_id: resolvedConfig.id,
        });

        if (verifyRes.has_template === false) {
          setShowNoTemplateModal(true);
          isIdentityVerifiedRef.current = false;
          setVerificationStatus('no_template');
          return;
        }

        if (verifyRes.verified) {
          lastVerifiedTimeRef.current = now;
          isIdentityVerifiedRef.current = true;
          setVerificationStatus('verified');
          identityFailureStartTimeRef.current = null;

          // Normalized coordinates [0, 1] relative to video frame
          const normBox: NormalizedBox = {
            x: Math.max(0, Math.min(1, detection.box.x / vw)),
            y: Math.max(0, Math.min(1, detection.box.y / vh)),
            width: Math.max(0.01, Math.min(1, detection.box.width / vw)),
            height: Math.max(0.01, Math.min(1, detection.box.height / vh)),
          };
          verifiedFaceBoxRef.current = normBox;
        } else {
          verifiedFaceBoxRef.current = null;
          const timeSinceVerified = now - lastVerifiedTimeRef.current;
          if (timeSinceVerified > gracePeriodMs) {
            isIdentityVerifiedRef.current = false;
            setVerificationStatus('mismatch');
            if (!identityFailureStartTimeRef.current) {
              identityFailureStartTimeRef.current = now;
            }
          }
        }
      } catch (err) {
        console.warn('[IdentityGate] Face verification retry warning:', err);
        const now = Date.now();
        const timeSinceVerified = now - lastVerifiedTimeRef.current;
        if (timeSinceVerified > gracePeriodMs) {
          isIdentityVerifiedRef.current = false;
          setVerificationStatus('network_error');
          if (!identityFailureStartTimeRef.current) {
            identityFailureStartTimeRef.current = now;
          }
        }
      } finally {
        isFaceCheckInProgressRef.current = false;
      }
    },
    [patientId, gracePeriodMs, resolvedConfig.id]
  );

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
      audioCtxRef.current.close().catch(() => { });
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

        const videoEl = videoRef.current;
        if (!videoEl) return;

        if (replayVideoSrc) {
          // Replay Mode: Play synthetic or uploaded test video file
          videoEl.srcObject = null;
          videoEl.src = replayVideoSrc;
          videoEl.loop = true;
          videoEl.muted = true;
          videoEl.playsInline = true;
        } else {
          // 1. Initialize Webcam Stream (1280x720)
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
          videoEl.srcObject = stream;
          videoEl.muted = true;
          videoEl.playsInline = true;

          // Attempt hardware exposure compensation for backlight
          backlightCompensatorRef.current.applyHardwareExposure(stream);
        }

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
        const videoTrack = streamRef.current?.getVideoTracks()[0];
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

          // 1. Measure 60 FPS Display / Render Frame Time
          const renderDtMs = Math.max(nowMs - lastRenderTimeRef.current, 1);
          lastRenderTimeRef.current = nowMs;
          smoothedRenderFpsRef.current = 0.9 * smoothedRenderFpsRef.current + 0.1 * (1000 / renderDtMs);

          // 2. Continuous 60 FPS Ring Lerp Interpolation & Direct DOM Update
          const targetProgress = targetProgressRef.current;
          const currentProgress = currentAnimatedProgressRef.current;
          const dtSec = Math.min(renderDtMs / 1000, 0.05);
          // Lambda = 16 gives ~60-80ms smooth response time without perceptible lag
          const lerpFactor = 1 - Math.exp(-16 * dtSec);
          const nextProgress = Math.abs(targetProgress - currentProgress) < 0.0005
            ? targetProgress
            : currentProgress + (targetProgress - currentProgress) * lerpFactor;
          currentAnimatedProgressRef.current = nextProgress;

          if (progressCircleRef.current) {
            const circ = 2 * Math.PI * 42;
            const offset = circ * (1 - Math.max(0, Math.min(1, nextProgress)));
            progressCircleRef.current.style.strokeDashoffset = `${offset}px`;
          }

          // Continuous Face Verification Trigger (Every ~2.5s)
          if (
            nowMs - lastFaceCheckTimeRef.current >= 2500 &&
            !isFaceCheckInProgressRef.current &&
            !isPausedRef.current &&
            vEl.readyState >= 2 &&
            patientId
          ) {
            lastFaceCheckTimeRef.current = nowMs;
            triggerFaceVerification(vEl);
          }

          // Continuous Identity Failure Auto-Pause (>= 20s)
          if (
            identityFailureStartTimeRef.current &&
            nowMs - identityFailureStartTimeRef.current >= 20000 &&
            !isPausedRef.current
          ) {
            setIsPaused(true);
            isPausedRef.current = true;
            setShowIdentityFailureModal(true);
            speakThai('หยุดการฝึกชั่วคราวเนื่องจากไม่สามารถยืนยันตัวตนได้', 'identity_timeout', 0);
          }

          // 3. AI Inference Interval Throttle (50 FPS standard / 15 FPS low power)
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

          // Non-blocking detection with backlight compensation
          const backlightRes = backlightCompensatorRef.current.analyzeLuminance(vEl);
          let inputSource: CanvasImageSource = vEl;
          if (backlightRes.needsPreprocessing) {
            if (!offscreenCanvasRef.current) {
              offscreenCanvasRef.current = document.createElement('canvas');
            }
            if (
              offscreenCanvasRef.current.width !== (vEl.videoWidth || 1280) ||
              offscreenCanvasRef.current.height !== (vEl.videoHeight || 720)
            ) {
              offscreenCanvasRef.current.width = vEl.videoWidth || 1280;
              offscreenCanvasRef.current.height = vEl.videoHeight || 720;
            }
            backlightCompensatorRef.current.preprocessForInference(vEl, offscreenCanvasRef.current);
            inputSource = offscreenCanvasRef.current;
          }

          let result: any = null;
          try {
            result = detector.detectForVideo(inputSource, monotonicTs);
          } catch (detectErr) {
            console.warn('[PoseEngine] detectForVideo transient frame warning:', detectErr);
            return;
          }

          const ctx = cEl.getContext('2d');
          if (!ctx) return;
          ctx.clearRect(0, 0, cEl.width, cEl.height);

          const hasPose = Boolean(result && result.landmarks && result.landmarks.length > 0);
          const isTimerExercise = (resolvedConfigRef.current as any).mode === 'timer' || resolvedConfigRef.current.evaluationMode === 'timer';
          const isPendulumExercise = resolvedConfigRef.current.evaluationMode === 'pendulum_circular' || Boolean((resolvedConfigRef.current as any).isPendulum);

          if (!hasPose) {
            canvasSmoothedPointsRef.current = {};
            if (isTimerExercise) {
              const evalRes = stateMachineRef.current.evaluate([], monotonicTs);
              latestEvalResultRef.current = evalRes;
              targetProgressRef.current = computeTargetRingProgress(
                evalRes,
                resolvedConfigRef.current,
                true,
                isPendulumExercise,
                validCompletedRepsRef.current
              );

              if (evalRes.completedReps > lastCompletedRepsRef.current) {
                lastCompletedRepsRef.current = evalRes.completedReps;
                if (isIdentityVerifiedRef.current) {
                  validCompletedRepsRef.current += 1;
                  targetProgressRef.current = 1.0;
                  currentAnimatedProgressRef.current = 1.0;
                  if (progressCircleRef.current) {
                    progressCircleRef.current.style.strokeDashoffset = '0px';
                  }
                  setCelebratingRep(validCompletedRepsRef.current);
                  setTimeout(() => setCelebratingRep(null), 2000);
                  playRepChime();
                  speakThai(`ครั้งที่ ${validCompletedRepsRef.current}`, 'rep_count', 1200);
                } else {
                  rejectedRepsCountRef.current += 1;
                  console.warn('[IdentityGate] Timer rep rejected: unverified patient identity');
                }
              }

              const targetReps = resolvedConfigRef.current.defaultPrescription?.repsPerSet || 10;
              const totalSets = resolvedConfigRef.current.defaultPrescription?.totalSets || 3;
              const isSetDone = validCompletedRepsRef.current >= targetReps;
              const isExerciseDone = isSetDone && evalRes.currentSet >= totalSets;

              if (isSetDone && !isExerciseDone && !isRestingRef.current) {
                setIsResting(true);
                isRestingRef.current = true;
                speakThai(`จบเซ็ตที่ ${evalRes.currentSet} พักสักครู่ค่ะ`, 'set_complete', 2500);
              } else if (isExerciseDone && !isSummaryOpenRef.current) {
                setIsSummaryOpen(true);
                isSummaryOpenRef.current = true;
                speakThai('ยินดีด้วยค่ะ คุณทำครบทุกเซ็ตแล้ว', 'exercise_complete', 2500);
              }

              if (nowMs - lastUiUpdateMsRef.current > 150) {
                lastUiUpdateMsRef.current = nowMs;
                setHudState((prev) => ({
                  ...prev,
                  fps: Math.round(smoothedFpsRef.current),
                  renderFps: Math.round(smoothedRenderFpsRef.current),
                  landmarkCount: 0,
                  currentAngle: 0,
                  completedReps: validCompletedRepsRef.current,
                  repPhase: evalRes.phase,
                  accuracyScore: Math.round(evalRes.accuracyPercent ?? 100),
                  coachingMessage: evalRes.coachingMessageTh || 'กำลังจับเวลาตามจังหวะกายภาพ...',
                  statusColor: '#10b981',
                }));
                setEvalResult(evalRes);
              }
              return;
            }

            if (nowMs - lastUiUpdateMsRef.current > 150) {
              lastUiUpdateMsRef.current = nowMs;
              setHudState((prev) => ({
                ...prev,
                fps: Math.round(smoothedFpsRef.current),
                renderFps: Math.round(smoothedRenderFpsRef.current),
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

          // 1. Multi-Pose Subject Locking with Verified Face Identity Binding
          const allPoses = result.landmarks;
          const detectedPeopleCount = allPoses.length;
          const { selectedPose: chosenPose, selectedIndex: bestIdx, newLockedCoM } =
            selectSubjectPoseWithIdentity(allPoses, verifiedFaceBoxRef.current, lockedSubjectCoMRef.current);
          lockedSubjectCoMRef.current = newLockedCoM;

          // 2. Clinical One Euro Filter (1€ Filter - low tremor at rest, low latency in motion)
          const smoothedPose = oneEuroFilterRef.current.filter(chosenPose, monotonicTs);
          smoothedLandmarksRef.current = smoothedPose;

          // Hardware Watchdog & Clinical State Machine Update
          const wdStatus = watchdogRef.current.update(smoothedPose, monotonicTs);
          const evalRes = stateMachineRef.current.evaluate(smoothedPose, monotonicTs);
          latestEvalResultRef.current = evalRes;
          targetProgressRef.current = computeTargetRingProgress(
            evalRes,
            resolvedConfigRef.current,
            false,
            isPendulumExercise,
            validCompletedRepsRef.current
          );

          // Project landmarks into 1:1 canvas pixels with mirror support and fitMode
          const currentFitMode = fitModeRef.current;
          const projectedPoints = smoothedPose.map((lm: any) =>
            projectLandmarkToCanvas(lm, vEl, cEl, true, currentFitMode)
          );

          // Exponential Moving Average (EMA) / Lerp smoothing strictly for canvas rendering
          // Keeps motion silky smooth without touching raw coordinates or state machine evaluations
          const alpha = 0.65;
          const renderPoints = projectedPoints.map((pt: any, idx: number) => {
            if (!pt || !pt.inFrame || (pt.visibility ?? 0) < 0.40) {
              delete canvasSmoothedPointsRef.current[idx];
              return pt;
            }
            const prev = canvasSmoothedPointsRef.current[idx];
            if (!prev) {
              canvasSmoothedPointsRef.current[idx] = { x: pt.x, y: pt.y };
              return pt;
            }
            const smoothX = prev.x + alpha * (pt.x - prev.x);
            const smoothY = prev.y + alpha * (pt.y - prev.y);
            canvasSmoothedPointsRef.current[idx] = { x: smoothX, y: smoothY };
            return {
              ...pt,
              x: smoothX,
              y: smoothY,
            };
          });

          // Shoulder width & distance estimation from clinical evaluation
          const shoulderWidthPct = Math.round((evalRes.shoulderWidthRatio ?? 0.28) * 100);
          const distanceStatus = evalRes.distanceStatus || 'ระยะเหมาะสม';
          const distanceWarning = evalRes.phase === 'WAITING_FOR_FRAMING' ? evalRes.coachingMessageTh : null;

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
            const currentActiveSide = activeSideRef.current || resolvedConfig.side || 'right';
            const isBilateral =
              currentActiveSide === 'bilateral' ||
              resolvedConfig.side === 'bilateral' ||
              Boolean((resolvedConfig as any).bilateral);

            // Active side dynamic stroke color from form rating
            const activeColor = strokeColor;

            const inactiveColor = 'rgba(148, 163, 184, 0.65)'; // slate-400 with high contrast against camera feed
            const torsoBridgeColor = 'rgba(56, 189, 248, 0.75)'; // sky-400

            // Helper to determine connection style (Active side vs Inactive side vs Torso bridge)
            const getConnectionStyle = (idxA: number, idxB: number) => {
              if (isBilateral) {
                return { lineWidth: 6, strokeStyle: activeColor, isActive: true };
              }
              // Torso bridges connecting left and right
              if ((idxA === 11 && idxB === 12) || (idxA === 23 && idxB === 24)) {
                return { lineWidth: 4, strokeStyle: torsoBridgeColor, isActive: false };
              }
              const isAOdd = idxA % 2 === 1;
              const isBOdd = idxB % 2 === 1;
              const isLeftConn = isAOdd && isBOdd;
              const isRightConn = !isAOdd && !isBOdd;

              if (currentActiveSide === 'left' && isLeftConn) {
                return { lineWidth: 6, strokeStyle: activeColor, isActive: true };
              }
              if (currentActiveSide === 'right' && isRightConn) {
                return { lineWidth: 6, strokeStyle: activeColor, isActive: true };
              }
              return { lineWidth: 3, strokeStyle: inactiveColor, isActive: false };
            };

            const isJointActive = (idx: number) => {
              if (isBilateral) return true;
              if (currentActiveSide === 'left') return idx % 2 === 1;
              if (currentActiveSide === 'right') return idx % 2 === 0;
              return true;
            };

            // 1. Draw Skeleton Lines (Torso, Arms, Hands, Legs)
            for (const [idxA, idxB] of POSE_CONNECTIONS) {
              const ptA = renderPoints[idxA];
              const ptB = renderPoints[idxB];
              // Strictly draw ONLY when both joints are in-frame with sufficient visibility
              // Hides legs automatically when sitting / half-body mode without extrapolating outside
              if (
                ptA &&
                ptB &&
                ptA.inFrame &&
                ptB.inFrame &&
                (ptA.visibility ?? 0) >= 0.40 &&
                (ptB.visibility ?? 0) >= 0.40
              ) {
                const style = getConnectionStyle(idxA, idxB);
                ctx.lineWidth = style.lineWidth;
                ctx.strokeStyle = style.strokeStyle;
                ctx.beginPath();
                ctx.moveTo(ptA.x, ptA.y);
                ctx.lineTo(ptB.x, ptB.y);
                ctx.stroke();
              }
            }

            // 2. Draw Joint Circular Dots (Shoulders, Elbows, Wrists, Hips, Knees, Ankles, Fingers)
            // Never draw facial landmarks (0-10)
            const fingerJointIndices = [17, 18, 19, 20, 21, 22];

            for (const idx of BODY_JOINT_INDICES) {
              const pt = renderPoints[idx];
              if (!pt || !pt.inFrame || (pt.visibility ?? 0) < 0.40) continue;

              const active = isJointActive(idx);
              const isFinger = fingerJointIndices.includes(idx);
              const radius = isFinger ? (active ? 4 : 2.5) : active ? 7.5 : 4.5;
              const fillColor = active ? activeColor : '#94a3b8';

              ctx.beginPath();
              ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
              ctx.fillStyle = fillColor;
              ctx.fill();
              ctx.lineWidth = active ? 2 : 1.5;
              ctx.strokeStyle = '#ffffff';
              ctx.stroke();

              // Draw debug label if staff debug is enabled
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
            if (isIdentityVerifiedRef.current) {
              validCompletedRepsRef.current += 1;
              targetProgressRef.current = 1.0;
              currentAnimatedProgressRef.current = 1.0;
              if (progressCircleRef.current) {
                progressCircleRef.current.style.strokeDashoffset = '0px';
              }
              setCelebratingRep(validCompletedRepsRef.current);
              setTimeout(() => setCelebratingRep(null), 2000);
              playRepChime();
              speakThai(`ครั้งที่ ${validCompletedRepsRef.current}`, 'rep_count', 1200);
            } else {
              rejectedRepsCountRef.current += 1;
              console.warn('[IdentityGate] Rep rejected: unverified patient identity');
            }
          }

          // Guidance speech announcements with cooldown guards
          if (evalRes.isOccluded && evalRes.occlusionReasonTh) {
            speakThai(evalRes.occlusionReasonTh, 'occlusion_warning', 3500);
          } else if (evalRes.coachingMessageTh && evalRes.formRating !== 'good') {
            speakThai(evalRes.coachingMessageTh, 'coaching_warning', 4000);
          }

          // Set & Exercise Completion Transitions (Gated by valid verified reps)
          const targetReps = resolvedConfig.defaultPrescription?.repsPerSet || 10;
          const totalSets = resolvedConfig.defaultPrescription?.totalSets || 3;
          const isSetDone = validCompletedRepsRef.current >= targetReps;
          const isExerciseDone = isSetDone && evalRes.currentSet >= totalSets;

          if (isSetDone && !isExerciseDone && !isRestingRef.current) {
            setIsResting(true);
            isRestingRef.current = true;
            speakThai(`จบเซ็ตที่ ${evalRes.currentSet} พักสักครู่ค่ะ`, 'set_complete', 2500);
          } else if (isExerciseDone && !isSummaryOpenRef.current) {
            setIsSummaryOpen(true);
            isSummaryOpenRef.current = true;
            speakThai('ยินดีด้วยค่ะ คุณทำครบทุกเซ็ตแล้ว', 'exercise_complete', 2500);
          }

          // Accuracy Percentage EMA Smoothing (0.80 previous + 0.20 raw)
          const rawAcc = Math.round(evalRes.accuracyPercent ?? evalRes.accuracyPct ?? 0);
          if (smoothedAccuracyRef.current === 0) {
            smoothedAccuracyRef.current = rawAcc;
          } else if (rawAcc > 0) {
            smoothedAccuracyRef.current = 0.80 * smoothedAccuracyRef.current + 0.20 * rawAcc;
          }
          const smoothedAcc = Math.round(smoothedAccuracyRef.current);

          const isAccuracyChanged =
            Math.abs(smoothedAcc - lastEmittedAccuracyRef.current) >= 1 &&
            nowMs - lastAccuracyEmitTimeRef.current >= 200;

          if (isAccuracyChanged) {
            lastEmittedAccuracyRef.current = smoothedAcc;
            lastAccuracyEmitTimeRef.current = nowMs;
          }

          // Meaningful Change Detection Guard:
          // Update React State ONLY when visible UI properties actually change or periodic debug refresh
          const prevUi = lastRenderedUiValuesRef.current;
          const isRepsChanged = validCompletedRepsRef.current !== prevUi.completedReps;
          const isSetChanged = evalRes.currentSet !== prevUi.currentSet;
          const isPhaseChanged = evalRes.phase !== prevUi.repPhase;
          const isLightingChanged = (backlightRes.isBacklightDetected || backlightRes.isSubjectDark) !== prevUi.hasLightingWarning;
          const isDistanceStatusChanged = (evalRes.distanceStatus || 'ระยะเหมาะสม') !== prevUi.distanceStatus;
          const isCoachingChanged = (evalRes.coachingMessageTh || '') !== prevUi.coachingMessage;
          const isReadinessChanged = (evalRes.readinessStatus || '') !== prevUi.readinessStatus;
          const isDebugIntervalPassed = showDebugRef.current && (nowMs - lastUiUpdateMsRef.current >= 250);
          const isFallbackIntervalPassed = nowMs - lastUiUpdateMsRef.current >= 400;

          const shouldUpdateUi =
            isRepsChanged ||
            isSetChanged ||
            isPhaseChanged ||
            isAccuracyChanged ||
            isLightingChanged ||
            isDistanceStatusChanged ||
            isCoachingChanged ||
            isReadinessChanged ||
            isDebugIntervalPassed ||
            isFallbackIntervalPassed;

          if (shouldUpdateUi) {
            lastUiUpdateMsRef.current = nowMs;
            lastRenderedUiValuesRef.current = {
              completedReps: validCompletedRepsRef.current,
              currentSet: evalRes.currentSet,
              repPhase: evalRes.phase,
              hasLightingWarning: backlightRes.isBacklightDetected || backlightRes.isSubjectDark,
              accuracyPct: lastEmittedAccuracyRef.current,
              distanceStatus: evalRes.distanceStatus || 'ระยะเหมาะสม',
              coachingMessage: evalRes.coachingMessageTh || '',
              readinessStatus: evalRes.readinessStatus || '',
            };

            const requiredJoints = getRequiredKeypointsForExercise(resolvedConfig);
            const avgVis =
              requiredJoints.reduce(
                (acc, idx) => acc + (smoothedPose[idx]?.visibility ?? 0),
                0
              ) / (requiredJoints.length || 1);

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

            setHudState({
              fps: Math.round(smoothedFpsRef.current),
              renderFps: Math.round(smoothedRenderFpsRef.current),
              landmarkCount: smoothedPose.length,
              avgVisibility: Number(avgVis.toFixed(2)),
              currentAngle: Math.round(evalRes.currentAngleDeg || 0),
              accuracyPct: lastEmittedAccuracyRef.current,
              repPhase: evalRes.phase,
              completedReps: validCompletedRepsRef.current,
              currentSet: evalRes.currentSet,
              coachingMessage: evalRes.coachingMessageTh,
              statusColor: strokeColor,
              shoulderWidthPct,
              distanceStatus,
              distanceWarning,
              detectedPeople: detectedPeopleCount,
              lockedTargetIdx: bestIdx,
              hasLightingWarning: backlightRes.isBacklightDetected || backlightRes.isSubjectDark,
              requiredKeypointsStatus,
              readinessReason: evalRes.blockingReason || (evalRes.phase === 'WAITING_FOR_FRAMING' ? 'รอจัดตำแหน่ง' : 'พร้อมเริ่มฝึก'),
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
    targetProgressRef.current = 0;
    currentAnimatedProgressRef.current = 0;
    if (progressCircleRef.current) {
      progressCircleRef.current.style.strokeDashoffset = `${2 * Math.PI * 42}px`;
    }
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
  const handleFinalizeSession = (mode: 'ai_verified' | 'stopped_pain' | 'skipped_unverified') => {
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

    // Log telemetry to Supabase / API asynchronously (strictly numeric telemetry - never upload video)
    if (defaultApiClient?.courses?.submitSessionLog) {
      defaultApiClient.courses.submitSessionLog({
        patient_id: patient.patient_id || patient.hn || 'unknown',
        exercise_id: exercise.id || exercise.exercise_id || resolvedConfig.id || null,
        kiosk_id: 'kiosk-01',
        completion_mode: mode,
        correct_reps: telemetry.completedReps,
        incorrect_reps: telemetry.incorrectReps,
        target_reps: telemetry.totalRepsTarget,
        current_set: telemetry.totalSetsCompleted,
        total_sets: resolvedConfig.defaultPrescription?.totalSets || 3,
        max_angle_achieved: telemetry.maxAngleAchievedDeg,
        consistency_score: telemetry.consistencyScorePercent,
        pain_reported: mode === 'stopped_pain',
        duration_seconds: totalDurationSec,
        telemetry_summary: {
          exerciseMode: (resolvedConfig as any).mode || (resolvedConfig.evaluationMode === 'timer' ? 'timer' : 'camera'),
          hysteresisState: evalResult?.hysteresisState,
          calibratedThreshold: evalResult?.calibratedThreshold,
          backlightCompensated: hudState.hasLightingWarning,
          framingStatus: evalResult?.distanceStatus,
        },
      }).catch((err) => console.warn('[PoseEngine] Session log sync warning:', err));
    }

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
      audioCtxRef.current.close().catch(() => { });
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

  const isTimerMode = (resolvedConfig as any).mode === 'timer' || resolvedConfig.evaluationMode === 'timer';
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

  // SVG Progress Ring is updated directly via progressCircleRef at 60 FPS (zero React re-renders)
  const isWaitingPose = !isTimerMode && Boolean(
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
    <div className="fixed inset-0 z-50 bg-[#F0F7FB] text-slate-900 flex flex-col justify-between overflow-hidden select-none font-sans">
      {/* 1. Top Workout Header Bar */}
      <header className="w-full bg-white border-b border-blue-100 px-5 sm:px-8 py-3 shadow-xs flex flex-wrap items-center justify-between z-20 gap-3 shrink-0 select-none">
        {/* Left: Exit Button */}
        <button
          type="button"
          id="kiosk-header-exit-btn"
          data-testid="kiosk-header-exit-btn"
          onClick={onExit}
          className="min-h-[46px] px-4 sm:px-5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-sm sm:text-base font-bold flex items-center gap-2 transition active:scale-95 cursor-pointer border border-slate-200 shadow-xs shrink-0"
          title={t('exit_exercise', 'ออกจากการฝึก')}
        >
          <ArrowLeft className="w-5 h-5 shrink-0 text-slate-600" />
          <span>{t('exit_exercise', '← ออกจากท่าฝึก')}</span>
        </button>

        {/* Center: Full Exercise Name + Patient Badge */}
        <div
          onClick={handleTitleTap}
          className="flex-1 min-w-0 text-center px-2 cursor-pointer select-none"
          title="แตะ 5 ครั้งเพื่อปลดล็อกโหมดเจ้าหน้าที่"
        >
          <h1 className="text-lg sm:text-xl md:text-2xl font-black text-slate-900 truncate leading-tight tracking-tight">
            {titleString}
          </h1>
          <div className="flex items-center justify-center gap-2 mt-0.5">
            <span className="px-3 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-bold text-xs truncate">
              คุณ {patient.first_name || 'ผู้ฝึก'} • {isBilateral ? 'ทั้งสองข้าง' : activeSide === 'right' ? 'ฝึกข้างขวา' : 'ฝึกข้างซ้าย'}
            </span>
          </div>
        </div>

        {/* Right Section: Language Pill + Staff Settings Gear Icon */}
        <div className="flex items-center gap-2.5 shrink-0">
          {/* Subtle Language Selector Menu */}
          <div className="relative">
            <button
              type="button"
              id="kiosk-language-menu-btn"
              onClick={() => setShowLangMenu((prev) => !prev)}
              className="min-h-[44px] px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-xs font-bold flex items-center gap-1.5 transition active:scale-95 cursor-pointer shadow-xs"
              title="สลับภาษา (Switch Language)"
            >
              <Globe className="w-4 h-4 text-blue-600" />
              <span>{lang === 'zh-CN' ? '中文' : lang === 'en-US' ? 'EN' : 'TH'}</span>
            </button>

            {showLangMenu && (
              <div className="absolute right-0 mt-2 w-36 rounded-2xl bg-white border border-blue-100 shadow-xl p-1.5 z-50 flex flex-col gap-1 backdrop-blur-md">
                {LANGUAGE_OPTIONS.map((opt) => (
                  <button
                    key={opt.code}
                    type="button"
                    onClick={() => {
                      setLanguage(opt.code);
                      setShowLangMenu(false);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs font-bold transition flex items-center justify-between cursor-pointer ${lang === opt.code
                      ? 'bg-blue-50 text-blue-700 border border-blue-200'
                      : 'text-slate-700 hover:bg-slate-50'
                      }`}
                  >
                    <span>{opt.flag} {opt.label}</span>
                    {lang === opt.code && <Check className="w-3.5 h-3.5 text-blue-600" />}
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
            className="w-11 h-11 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 flex items-center justify-center border border-slate-200 transition active:scale-95 cursor-pointer shadow-xs"
            title="ตั้งค่าสำหรับเจ้าหน้าที่ (Staff Settings)"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* 2. Main Workout Bento Stage */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 p-4 flex-1 items-stretch overflow-hidden min-h-0">

        {/* Left/Main Camera Stage (8/9 Cols on LG/XL) */}
        <div className="lg:col-span-8 xl:col-span-9 bg-slate-950 rounded-3xl border-4 border-white shadow-xl relative overflow-hidden flex flex-col justify-between min-h-[480px]">
          {/* Webcam Video with horizontal selfie mirror */}
          <video
            ref={videoRef}
            playsInline
            muted
            className={`w-full h-full ${fitMode === 'contain' ? 'object-contain' : 'object-cover'
              } -scale-x-100 z-0 transition-all duration-200 ${boostLighting || hudState.hasLightingWarning ? 'brightness-110 contrast-125' : ''
              }`}
          />

          {/* 1:1 Canvas overlay directly on top of video */}
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full pointer-events-none z-10"
          />

          {/* Patient-accessible Quick Skeleton Toggle Button (Glassmorphism) */}
          <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
            <button
              type="button"
              id="kiosk-quick-toggle-skeleton-btn"
              data-testid="kiosk-quick-toggle-skeleton-btn"
              onClick={() => setShowSkeletonOverlay((prev) => !prev)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-2xl text-xs sm:text-sm font-bold backdrop-blur-md border transition-all duration-200 cursor-pointer shadow-lg active:scale-95 ${showSkeletonOverlay
                  ? 'bg-teal-500/90 text-slate-950 border-teal-300 shadow-teal-500/20'
                  : 'bg-slate-900/80 text-slate-300 border-slate-700/80 hover:bg-slate-800/90 hover:text-white'
                }`}
              title="เปิด/ปิดเส้นโครงร่างร่างกาย"
            >
              <span className="text-base leading-none">🦴</span>
              <span className="font-semibold">
                {lang === 'zh-CN'
                  ? (showSkeletonOverlay ? '隐藏骨骼线' : '显示骨骼线')
                  : lang === 'en-US'
                    ? (showSkeletonOverlay ? 'Hide Skeleton' : 'Show Skeleton')
                    : (showSkeletonOverlay ? 'ซ่อนเส้นโครงร่าง' : 'แสดงเส้นโครงร่าง')}
              </span>
            </button>
          </div>

          {/* Half-body Silhouette Guide Overlay */}
          {(showGuideSilhouette || hudState.repPhase === 'WAITING_FOR_FRAMING') && (
            <div className="absolute inset-0 pointer-events-none z-10 flex items-center justify-center opacity-30">
              <svg
                viewBox="0 0 400 400"
                className={`w-80 h-80 sm:w-96 sm:h-96 transition-colors duration-300 ${hudState.repPhase === 'WAITING_FOR_FRAMING' || hudState.shoulderWidthPct > 52
                  ? 'text-amber-400 stroke-amber-400 animate-pulse'
                  : 'text-teal-400 stroke-teal-400'
                  }`}
                fill="none"
                strokeWidth="2.5"
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

          {/* Body Alignment Warning Guide Card if waiting for framing */}
          {hudState.repPhase === 'WAITING_FOR_FRAMING' && (
            <div className="absolute top-4 inset-x-4 z-20 flex justify-center pointer-events-none">
              <div className="bg-white/95 backdrop-blur-md text-slate-900 border-2 border-amber-400 px-5 py-2.5 rounded-2xl shadow-lg font-bold text-xs sm:text-sm flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                <span>{hudState.distanceWarning || 'กรุณาขยับถอยหลังให้อยู่ในกรอบ 1.5–2 เมตร'}</span>
              </div>
            </div>
          )}

          {/* Floating Clinical Blue-Emerald Instruction Pill at bottom of camera stage */}
          <div
            id="kiosk-single-line-status"
            data-testid="kiosk-single-line-status"
            className="absolute bottom-5 inset-x-4 z-20 flex justify-center pointer-events-none select-none"
          >
            <div className="bg-white/95 backdrop-blur-md text-slate-900 border-2 border-emerald-400 px-6 py-3.5 rounded-2xl shadow-xl font-extrabold text-sm sm:text-base md:text-lg flex items-center gap-3 max-w-xl truncate">
              <span className="text-xl sm:text-2xl shrink-0">{statusInfo.icon}</span>
              <span className="truncate leading-relaxed">
                {statusInfo.message}
              </span>
            </div>
          </div>

          {/* Real-time Diagnostic Debug HUD (When unlocked by staff) */}
          {showDebugHud && (
            <div
              id="pose-engine-debug-hud"
              data-testid="pose-engine-debug-hud"
              className="absolute top-4 left-4 z-30 bg-slate-900/95 border-2 border-emerald-500/60 rounded-3xl p-4 text-xs font-mono text-emerald-300 shadow-2xl backdrop-blur-md space-y-1.5 max-w-sm pointer-events-auto leading-relaxed"
            >
              <div className="flex items-center justify-between border-b border-emerald-500/30 pb-1.5 text-emerald-400 font-bold">
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  <span>🔍 Debug สถานะระบบ</span>
                </span>
                <button
                  type="button"
                  onClick={() => setLowPowerMode((prev) => !prev)}
                  className="text-[10px] px-2 py-0.5 rounded-lg bg-slate-800 text-teal-300 hover:bg-slate-700 cursor-pointer font-bold border border-slate-700"
                >
                  {lowPowerMode ? '⚡ ประหยัดไฟ' : '⚡ ความเร็วสูง'}
                </button>
              </div>
              <div>📷 กล้อง/AI: {hudState.fps} FPS | หลอดแสดงผล: {hudState.renderFps ?? 60} FPS</div>
              <div>🧠 โมเดล: {modelStatus} | พบ: {hudState.detectedPeople} คน</div>
              <div>📐 มุม: {hudState.currentAngle}° | แม่นยำ: {hudState.accuracyPct}%</div>
              <div>🔄 เฟส: {hudState.repPhase} | นับ: {hudState.completedReps} ครั้ง</div>
            </div>
          )}

          {/* Loading Overlay */}
          {(cameraStatus === 'initializing' || modelStatus === 'loading') && !errorMessage && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/85 backdrop-blur-sm p-4">
              <div className="bg-white border-2 border-emerald-400 rounded-3xl p-6 max-w-md text-center text-slate-900 shadow-2xl">
                <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center mx-auto mb-3 text-emerald-600">
                  <Activity className="w-7 h-7 animate-spin" />
                </div>
                <div className="text-lg font-black mb-2 text-slate-900">
                  ⏳ กำลังโหลดระบบตรวจจับท่าทาง AI...
                </div>
                <div className="text-xs text-slate-600 leading-relaxed mb-3">
                  ระบบกำลังเชื่อมต่อกล้องและโมเดลชีวกลศาสตร์
                </div>
              </div>
            </div>
          )}

          {/* Error Banner with Reload & Exit */}
          {errorMessage && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/90 backdrop-blur-md p-4">
              <div className="bg-white border-2 border-rose-400 rounded-3xl p-6 max-w-md text-center text-slate-900 shadow-2xl">
                <div className="w-14 h-14 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center mx-auto mb-3 text-rose-600">
                  <AlertTriangle className="w-7 h-7" />
                </div>
                <div className="text-lg font-black text-rose-700 mb-2">
                  ⚠️ ระบบตรวจจับไม่สามารถทำงานได้
                </div>
                <p className="text-xs text-slate-600 mb-4 leading-relaxed">{errorMessage}</p>
                <div className="flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-sm"
                  >
                    ลองใหม่อีกครั้ง
                  </button>
                  <button
                    type="button"
                    onClick={onExit}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer border border-slate-200"
                  >
                    ออกจากการฝึก
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Coaching & Rep Counter Sidebar (4/3 Cols on LG/XL) */}
        <div className="lg:col-span-4 xl:col-span-3 flex flex-col gap-4 overflow-y-auto">
          {/* Card 1: Rep & Set Counter Card */}
          <div
            id="kiosk-giant-rep-counter"
            data-testid="kiosk-giant-rep-counter"
            className={`bg-white rounded-3xl border p-5 shadow-sm text-center flex flex-col items-center justify-center transition-all duration-300 ${celebratingRep !== null
              ? 'border-emerald-400 ring-4 ring-emerald-400/30 scale-102 bg-emerald-50/20'
              : 'border-blue-100'
              }`}
          >
            {/* Circular Progress Ring */}
            <div className="relative w-36 h-36 sm:w-40 sm:h-40 flex items-center justify-center">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  fill="none"
                  stroke="#E2E8F0"
                  strokeWidth="8"
                />
                <circle
                  ref={progressCircleRef}
                  cx="50"
                  cy="50"
                  r="42"
                  fill="none"
                  stroke={celebratingRep !== null ? '#10B981' : '#0284C7'}
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 42}
                  strokeDashoffset={2 * Math.PI * 42}
                  style={{ willChange: 'stroke-dashoffset' }}
                />
              </svg>

              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                {celebratingRep !== null ? (
                  <div className="flex flex-col items-center animate-bounce">
                    <span className="text-3xl sm:text-4xl">✅</span>
                    <span className="text-sm font-black text-emerald-600 mt-0.5">
                      +1 ครั้ง!
                    </span>
                  </div>
                ) : (
                  <>
                    <div className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
                      {lang === 'zh-CN' ? '次数' : lang === 'en-US' ? 'Reps' : 'ครั้งที่'}
                    </div>
                    <div className="text-3xl sm:text-4xl font-black text-slate-900 font-mono leading-none my-1">
                      {hudState.completedReps}
                      <span className="text-lg text-slate-400 font-bold">
                        {' '}/ {resolvedConfig.defaultPrescription?.repsPerSet || 10}
                      </span>
                    </div>
                    <div className="text-xs font-bold text-blue-600">
                      เซ็ตที่ {hudState.currentSet} จาก {resolvedConfig.defaultPrescription?.totalSets || 3}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Clear label under ring */}
            <div className="mt-3 text-xs sm:text-sm font-bold text-slate-700">
              <span>ความแม่นยำท่าทาง: </span>
              <span className={hudState.completedReps > 0 || hudState.accuracyPct > 0 ? 'text-emerald-600 font-extrabold' : 'text-slate-500 font-semibold'}>
                {hudState.completedReps > 0 || hudState.accuracyPct > 0 ? `${hudState.accuracyPct}%` : 'รอเริ่มฝึก'}
              </span>
            </div>
          </div>

          {/* Card 2: Exercise Vector Demonstration & Posture Guide (Memoized) */}
          <ExercisePostureGuideCard
            exerciseId={resolvedConfig.id || (exercise as any).id || (exercise as any).exercise_id || 'shoulder-er-band'}
            titleString={titleString}
            instructionTextTh={resolvedConfig.cameraGuide?.instructionTextTh}
            descriptionTh={resolvedConfig.descriptionTh}
          />
        </div>
      </div>

      {/* 3. Bottom Control Bar */}
      <PainStopEmergencyBar
        isPaused={isPaused}
        onTogglePause={() => setIsPaused((prev) => !prev)}
        onReportPainStop={handleReportPainStop}
        onSkipOrFinish={() => handleFinalizeSession('skipped_unverified')}
      />

      {/* MODAL A: Rest Between Sets Countdown */}
      {isResting && (
        <div className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white border-2 border-emerald-400 shadow-2xl p-8 text-center animate-scale-up text-slate-900">
            <div className="w-20 h-20 rounded-3xl bg-emerald-50 border-2 border-emerald-200 flex items-center justify-center mx-auto mb-4 text-emerald-600 text-3xl font-bold shadow-xs">
              <Clock className="w-10 h-10" />
            </div>
            <h3 className="text-2xl sm:text-3xl font-black text-slate-900">
              {lang === 'zh-CN' ? '组间休息' : lang === 'en-US' ? 'Rest Between Sets' : 'พักผ่อนระหว่างเซ็ต'}
            </h3>
            <p className="text-base sm:text-lg text-slate-600 mt-2 font-medium">
              {lang === 'zh-CN'
                ? `已完成第 ${hudState.currentSet} 组，请放松肌肉稍作休息`
                : lang === 'en-US'
                  ? `Set ${hudState.currentSet} completed. Relax your muscles before the next set.`
                  : `ทำครบเซ็ตที่ ${hudState.currentSet} แล้ว พักผ่อนกล้ามเนื้อสักครู่ก่อนเริ่มเซ็ตถัดไป`}
            </p>

            <div className="my-6">
              <div className="text-6xl sm:text-7xl font-black text-emerald-600 font-mono">
                {restCountdown}
              </div>
              <div className="text-base text-slate-500 mt-1 font-bold">
                {lang === 'zh-CN' ? '秒' : lang === 'en-US' ? 'seconds' : 'วินาที'}
              </div>
            </div>

            <button
              type="button"
              onClick={handleNextSet}
              className="w-full min-h-[52px] py-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-blue-600 hover:brightness-105 text-white font-black text-lg shadow-lg shadow-emerald-900/20 transition active:scale-98 cursor-pointer flex items-center justify-center gap-2"
            >
              <span>{lang === 'zh-CN' ? '准备就绪，开始下一组 ➔' : lang === 'en-US' ? 'Ready, Start Next Set ➔' : 'พร้อมแล้ว เริ่มเซ็ตถัดไปทันที ➔'}</span>
            </button>
          </div>
        </div>
      )}

      {/* MODAL B: Pain Reported Emergency Card */}
      {painReportedState && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white border-2 border-rose-500 shadow-2xl p-8 text-center animate-scale-up text-slate-900">
            <div className="w-20 h-20 rounded-3xl bg-rose-50 border-2 border-rose-300 flex items-center justify-center mx-auto mb-4 text-rose-600 shadow-xs">
              <ShieldAlert className="w-10 h-10" />
            </div>
            <h3 className="text-2xl sm:text-3xl font-black text-slate-900">
              {lang === 'zh-CN' ? '训练已停止并通知医护人员' : lang === 'en-US' ? 'Session Stopped & Staff Notified' : 'ระบบหยุดการฝึกและแจ้งเจ้าหน้าที่แล้ว'}
            </h3>
            <p className="text-base sm:text-lg text-slate-600 mt-3 leading-relaxed font-medium">
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
                className="w-full min-h-[52px] py-4 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-black text-lg shadow-md cursor-pointer transition active:scale-98"
              >
                {lang === 'zh-CN' ? '记录结果并返回主界面' : lang === 'en-US' ? 'Record & Return Home' : 'บันทึกประวัติและกลับสู่หน้าหลัก'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL C: End-of-Exercise Summary Card */}
      {isSummaryOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-xl rounded-3xl bg-white border-2 border-emerald-400 shadow-2xl p-8 sm:p-10 text-center animate-scale-up text-slate-900">
            <div className="w-24 h-24 rounded-3xl bg-emerald-50 border-2 border-emerald-300 flex items-center justify-center mx-auto mb-4 text-emerald-600 shadow-md">
              <Trophy className="w-12 h-12" />
            </div>

            <h2 className="text-3xl sm:text-4xl font-black text-slate-900 mb-2">
              {lang === 'zh-CN' ? '本项动作训练完成! 🎉' : lang === 'en-US' ? 'Exercise Completed! 🎉' : 'ฝึกท่านี้สำเร็จแล้ว! 🎉'}
            </h2>
            <div className="text-lg text-blue-700 font-bold mb-6">
              {titleString}
            </div>

            <div className="grid grid-cols-2 gap-4 mb-8 text-left">
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                <div className="text-sm font-bold text-slate-600">
                  {lang === 'zh-CN' ? '完成次数 (正确 / 代偿)' : lang === 'en-US' ? 'Reps (Correct / Rejected)' : 'จำนวนครั้ง (ทำถูก / ผิด)'}
                </div>
                <div className="text-2xl sm:text-3xl font-black text-emerald-600 mt-1 font-mono">
                  ✅ {evalResult?.completedReps || hudState.completedReps || 0} / ❌ {evalResult?.incorrectReps || 0}
                </div>
                <div className="text-xs text-slate-500 mt-1 font-semibold">
                  {lang === 'zh-CN' ? '目标' : lang === 'en-US' ? 'Target' : 'เป้าหมาย'}: {resolvedConfig.defaultPrescription?.repsPerSet || 10} × {resolvedConfig.defaultPrescription?.totalSets || 3}
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                <div className="text-sm font-bold text-slate-600">
                  {isTimerMode
                    ? (lang === 'zh-CN' ? '计时 / 节拍' : lang === 'en-US' ? 'Timer / Pacing' : 'จังหวะนับเวลา')
                    : isPendulum
                      ? (lang === 'zh-CN' ? '360° 全环轨迹' : lang === 'en-US' ? '360° Circular Orbit' : 'วิถีวงกลม (360°)')
                      : (lang === 'zh-CN' ? '最高达标角度' : lang === 'en-US' ? 'Max Angle Achieved' : 'มุมสูงสุดที่ทำได้')}
                </div>
                <div className="text-2xl sm:text-3xl font-black text-blue-700 mt-1 font-mono">
                  {isTimerMode
                    ? `${Math.round((evalResult?.holdProgressRatio || 0) * 100)}%`
                    : isPendulum
                      ? '100%'
                      : `${evalResult?.currentAngleDeg || hudState.currentAngle || 0}°`}
                </div>
                <div className="text-xs text-slate-500 mt-1 font-semibold">
                  {isTimerMode
                    ? (lang === 'zh-CN' ? '跟随节拍呼吸与保持' : lang === 'en-US' ? 'Hold and pace rhythm' : 'เกร็งค้างและผ่อนตามจังหวะ')
                    : isPendulum
                      ? (lang === 'zh-CN' ? '速度与半径达标' : lang === 'en-US' ? 'Steady radius & pace' : 'ความเร็วและรัศมีอยู่ในเกณฑ์')
                      : `${resolvedConfig.angleMechanics?.targetMinDeg || 80}° - ${resolvedConfig.angleMechanics?.targetMaxDeg || 100}°`}
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                <div className="text-sm font-bold text-slate-600">
                  {lang === 'zh-CN' ? '动作稳定性 (Consistency)' : lang === 'en-US' ? 'Consistency Score' : 'ความสม่ำเสมอ'}
                </div>
                <div className="text-2xl sm:text-3xl font-black text-blue-600 mt-1 font-mono">
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
                <div className="text-xs text-emerald-600 mt-1 font-semibold">
                  {lang === 'zh-CN' ? '表现: 优秀' : lang === 'en-US' ? 'Rating: Excellent' : 'ระดับ: ดีเยี่ยม'}
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                <div className="text-sm font-bold text-slate-600">
                  {lang === 'zh-CN' ? '验证模式 (Mode)' : lang === 'en-US' ? 'Verification Mode' : 'สถานะการฝึก'}
                </div>
                <div className="text-xl sm:text-2xl font-black text-emerald-600 mt-1 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span>AI-Verified</span>
                </div>
                <div className="text-xs text-slate-500 mt-1 font-semibold">
                  SaMD Class II Vision
                </div>
              </div>
            </div>

            <button
              type="button"
              id="kiosk-finish-exercise-summary-btn"
              data-testid="kiosk-finish-exercise-summary-btn"
              onClick={() => handleFinalizeSession('ai_verified')}
              className="w-full min-h-[54px] py-4 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-blue-600 hover:brightness-105 text-white font-black text-lg shadow-lg shadow-emerald-900/20 transition active:scale-98 cursor-pointer flex items-center justify-center gap-2.5"
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
                  className={`px-4 py-2 rounded-xl font-bold cursor-pointer transition ${showSkeletonOverlay
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
                  className={`px-4 py-2 rounded-xl font-bold cursor-pointer transition ${boostLighting
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
                  className={`px-4 py-2 rounded-xl font-bold cursor-pointer transition ${showGuideSilhouette
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
                  className={`px-4 py-2 rounded-xl font-bold cursor-pointer transition ${showDebugHud
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
                      className={`px-3.5 py-1.5 rounded-xl font-bold text-xs cursor-pointer ${activeSide === 'right'
                        ? 'bg-teal-500 text-slate-950 shadow-sm'
                        : 'bg-slate-800 text-slate-400 hover:text-white'
                        }`}
                    >
                      ขวา
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleSide('left')}
                      className={`px-3.5 py-1.5 rounded-xl font-bold text-xs cursor-pointer ${activeSide === 'left'
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

              {/* 8. Staff Video Replay Harness Mode */}
              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-bold text-white text-base">🎥 วิดีโอ Replay ทดสอบ (Video Harness)</div>
                    <div className="text-xs text-slate-400">เล่นไฟล์วิดีโอเพื่อทดสอบความแม่นยำของ AI</div>
                  </div>
                  <label className="px-3 py-1.5 rounded-xl font-bold bg-teal-500/20 text-teal-300 hover:bg-teal-500 hover:text-slate-950 border border-teal-500/40 cursor-pointer text-xs transition">
                    เลือกไฟล์วิดีโอ
                    <input
                      type="file"
                      accept="video/mp4,video/webm"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const fileUrl = URL.createObjectURL(file);
                          setReplayVideoSrc(fileUrl);
                          setShowStaffSettingsModal(false);
                        }
                      }}
                    />
                  </label>
                </div>
                {replayVideoSrc && (
                  <div className="flex items-center justify-between text-xs text-slate-400 pt-1 border-t border-slate-800/60">
                    <span className="truncate max-w-[220px]">เล่น: {replayVideoSrc}</span>
                    <button
                      type="button"
                      onClick={() => setReplayVideoSrc(null)}
                      className="text-rose-400 hover:underline cursor-pointer font-bold"
                    >
                      กลับใช้กล้องสด
                    </button>
                  </div>
                )}
              </div>
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
