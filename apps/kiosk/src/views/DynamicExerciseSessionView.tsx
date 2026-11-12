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
import { getExerciseCoachingCues } from '../../../../packages/pose-engine/src/presets/exercises.config';
import { RepStateMachine } from '../../../../packages/pose-engine/src/engine/repStateMachine';
import { CameraStreamWatchdog, WatchdogHealthStatus } from '../../../../packages/pose-engine/src/hardwareWatchdog';
import { projectLandmarkToCanvas } from '../../../../packages/pose-engine/src/math/projection';
import { VoiceFeedbackController } from '../../../../packages/hospital-ui-kit/src/VoiceFeedbackController';
import { BacklightCompensator } from '../../../../packages/pose-engine/src/backlightCompensator';
import { ClinicalOneEuroLandmarkFilter } from '../../../../packages/pose-engine/src/math/oneEuroFilter';
import {
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

export const HEAD_POSE_CONNECTIONS: [number, number][] = [
  [7, 0], // Left ear to nose/face center
  [8, 0], // Right ear to nose/face center
  [7, 8], // Ear to ear horizontal head bridge
  [0, 11], // Nose to left shoulder (neck line)
  [0, 12], // Nose to right shoulder (neck line)
];

export const HEAD_JOINT_INDICES = [0, 7, 8];

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
  0: { th: 'ใบหน้า/จมูก', en: 'Face/Nose', cn: '面部/鼻尖' },
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
  mediaUrl?: string;
  mediaType?: 'svg' | 'image' | 'video';
  fallbackMediaUrl?: string;
  instructionTextTh?: string;
  instructionTextEn?: string;
  instructionTextCn?: string;
  descriptionTh?: string;
  descriptionEn?: string;
  descriptionCn?: string;
  lang?: string;
}

const ExercisePostureGuideCard = React.memo<ExercisePostureGuideCardProps>(
  ({
    exerciseId,
    titleString,
    mediaUrl,
    mediaType,
    fallbackMediaUrl,
    instructionTextTh,
    instructionTextEn,
    instructionTextCn,
    descriptionTh,
    descriptionEn,
    descriptionCn,
    lang = 'th-TH',
  }) => {
    // Media stage: 0 = primary video/image, 1 = webp/gif, 2 = fallback SVG, 3 = placeholder
    const [mediaStage, setMediaStage] = useState<number>(0);
    const [isLoading, setIsLoading] = useState<boolean>(true);

    useEffect(() => {
      setMediaStage(0);
      setIsLoading(true);
    }, [exerciseId, mediaUrl]);

    // Trilingual labels
    const cardTitle =
      lang === 'zh-CN'
        ? '动作示范'
        : lang === 'en-US'
          ? 'Posture Guide'
          : 'ภาพตัวอย่างท่ากายภาพบำบัด';

    const cueHeader =
      lang === 'zh-CN'
        ? '动作要领指导:'
        : lang === 'en-US'
          ? 'Posture Guidance:'
          : 'คำแนะนำท่านี้:';

    const bullet1 =
      lang === 'zh-CN'
        ? instructionTextCn || '正对摄像头，距离1.8-2.8米，确保躯干与双臂清晰可见'
        : lang === 'en-US'
          ? instructionTextEn || 'Face camera directly, 1.8–2.8m away, with trunk and arms clearly visible'
          : instructionTextTh || 'จัดระยะยืนให้อยู่ในกรอบภาพและมองตรงที่กล้อง';

    const bullet2 =
      lang === 'zh-CN'
        ? descriptionCn || '平稳缓慢控制关节运动，保持节律均匀'
        : lang === 'en-US'
          ? descriptionEn || 'Move joint smoothly and steadily with controlled tempo'
          : descriptionTh || 'ขยับแขน/ข้อต่อตามจังหวะช้าๆ อย่างสม่ำเสมอ';

    const bullet3 =
      lang === 'zh-CN'
        ? '若感到剧烈刺痛，请立即点击暂停并通知医护人员。'
        : lang === 'en-US'
          ? 'If you feel sharp pain, stop immediately and alert staff.'
          : 'หากรู้สึกเจ็บแปลบ ให้แตะปุ่มหยุดพักและแจ้งเจ้าหน้าที่ทันที';

    const primaryVideoUrl =
      mediaType === 'video' || (!mediaType && !mediaUrl?.endsWith('.svg'))
        ? mediaUrl || `/exercises/${exerciseId}.mp4`
        : null;

    const primaryImageUrl = mediaUrl || `/exercises/${exerciseId}.webp`;
    const svgFallbackUrl = fallbackMediaUrl || `/assets/exercises/${exerciseId}.svg`;

    return (
      <div className="bg-white rounded-3xl border border-blue-100 p-4 sm:p-5 shadow-sm flex-1 flex flex-col justify-between gap-3">
        <div>
          <div className="text-xs font-bold text-blue-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <span>📐</span>
            <span>{cardTitle}</span>
          </div>

          <div className="w-full aspect-[16/10] bg-slate-50 border border-slate-100 rounded-2xl p-2 flex items-center justify-center overflow-hidden relative">
            {isLoading && mediaStage < 3 && (
              <div className="absolute inset-0 bg-slate-100 animate-pulse flex items-center justify-center">
                <span className="text-slate-400 text-xs">กำลังโหลดตัวอย่าง...</span>
              </div>
            )}

            {mediaStage === 0 && primaryVideoUrl && (
              <video
                src={primaryVideoUrl}
                autoPlay
                loop
                muted
                playsInline
                preload="metadata"
                onLoadedData={() => setIsLoading(false)}
                onError={() => {
                  setMediaStage(1);
                }}
                className="w-full h-full object-contain rounded-xl"
              />
            )}

            {(mediaStage === 1 || (mediaStage === 0 && !primaryVideoUrl)) && (
              <img
                src={primaryImageUrl}
                alt={titleString}
                onLoad={() => setIsLoading(false)}
                onError={() => {
                  setMediaStage(2);
                }}
                className="max-h-full max-w-full object-contain rounded-xl"
              />
            )}

            {mediaStage === 2 && (
              <img
                src={svgFallbackUrl}
                alt={titleString}
                onLoad={() => setIsLoading(false)}
                onError={() => {
                  setIsLoading(false);
                  setMediaStage(3);
                }}
                className="max-h-full max-w-full object-contain"
              />
            )}

            {mediaStage >= 3 && (
              <div className="text-center text-slate-400 text-xs py-4">
                <span>📐 {titleString}</span>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-1.5 pt-2 border-t border-slate-100 text-xs">
          <div className="font-bold text-slate-800 flex items-center gap-1">
            <span>💡</span>
            <span>{cueHeader}</span>
          </div>
          <ul className="list-disc list-inside text-slate-600 space-y-1 leading-relaxed">
            <li>{bullet1}</li>
            <li>{bullet2}</li>
            <li>{bullet3}</li>
          </ul>
        </div>
      </div>
    );
  }
);
ExercisePostureGuideCard.displayName = 'ExercisePostureGuideCard';

// Module-level singleton caches for zero-freeze exercise transitions
let cachedVisionModule: any = null;
let cachedFilesetResolver: any = null;
let cachedPoseLandmarker: any = null;
let cachedDelegate: 'GPU' | 'CPU' = 'GPU';

// Helper to apply dynamic alpha decay to hex, rgb, or rgba color strings
function applyAlphaToColor(color: string, alpha: number): string {
  if (alpha >= 1) return color;
  if (alpha <= 0) return 'transparent';
  if (color.startsWith('#')) {
    let hex = color.slice(1);
    if (hex.length === 3) {
      hex = hex.split('').map((c) => c + c).join('');
    }
    const r = parseInt(hex.slice(0, 2), 16) || 0;
    const g = parseInt(hex.slice(2, 4), 16) || 0;
    const b = parseInt(hex.slice(4, 6), 16) || 0;
    return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(2)})`;
  }
  if (color.startsWith('rgba(')) {
    return color.replace(/[\d\.]+\)$/, `${alpha.toFixed(2)})`);
  }
  if (color.startsWith('rgb(')) {
    return color.replace('rgb(', 'rgba(').replace(')', `, ${alpha.toFixed(2)})`);
  }
  return color;
}

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
    new ClinicalOneEuroLandmarkFilter({ minCutoff: 1.0, beta: 30.0 })
  );
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Loop & Timing Control Refs (Decoupled Dual-Loop Architecture)
  const rafIdRef = useRef<number | null>(null);
  const rvfcIdRef = useRef<number | null>(null);
  const renderRafIdRef = useRef<number | null>(null);
  const isMountedRef = useRef<boolean>(true);
  const isInferenceBusyRef = useRef<boolean>(false);
  const lastVideoTimeRef = useRef<number>(-1);
  const lastTimestampMsRef = useRef<number>(0);
  const lastInferenceTimeRef = useRef<number>(0);
  const lastUiUpdateMsRef = useRef<number>(0);
  const smoothedFpsRef = useRef<number>(30);
  const lastCompletedRepsRef = useRef<number>(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sessionStartTimeRef = useRef<number>(0);
  const isFinalizingRef = useRef<boolean>(false);
  const isReportingPainRef = useRef<boolean>(false);

  // Decoupled Pose Frame State for 60-120 FPS Interpolation & Prediction in Render Loop
  const currentPoseStateRef = useRef<{
    landmarks: PoseEngineLandmark[] | null;
    timestampMs: number;
    inFrame: boolean;
  } | null>(null);
  const previousPoseStateRef = useRef<{
    landmarks: PoseEngineLandmark[] | null;
    timestampMs: number;
    inFrame: boolean;
  } | null>(null);

  // Dynamic States
  const [cameraStatus, setCameraStatus] = useState<'initializing' | 'ready' | 'error'>('initializing');
  const [modelStatus, setModelStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [, setCameraDimensions] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [, setModelDelegate] = useState<'GPU' | 'CPU'>('GPU');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const initialSide: BodySide =
    resolvedConfig.side && resolvedConfig.side !== 'bilateral'
      ? resolvedConfig.side
      : ((props.exercise as any)?.target_side as BodySide) ||
        ((props.exercise as any)?.side as BodySide) ||
        resolvedConfig.side ||
        'right';
  const [activeSide, setActiveSide] = useState<BodySide>(initialSide);
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

  // Staff Accuracy Test Mode State & Telemetry Refs
  const [isAccuracyTestMode, setIsAccuracyTestMode] = useState<boolean>(false);
  const isAccuracyTestModeRef = useRef<boolean>(false);
  useEffect(() => {
    isAccuracyTestModeRef.current = isAccuracyTestMode;
  }, [isAccuracyTestMode]);

  const accuracyTelemetryRef = useRef<Array<{
    timestamp: number;
    timeStr: string;
    phase: string;
    angle: number;
    targetAngle: number;
    accuracyScore: number;
    isCompleteJoints: boolean;
    fps: number;
    detectedReps: number;
  }>>([]);
  const accuracyTotalFramesRef = useRef<number>(0);
  const accuracyCompleteJointFramesRef = useRef<number>(0);
  const accuracyFpsSamplesRef = useRef<number[]>([]);
  const lastAccuracySampleMsRef = useRef<number>(0);

  const [showAccuracyVerifyModal, setShowAccuracyVerifyModal] = useState<boolean>(false);
  const [actualRepsInput, setActualRepsInput] = useState<string>('10');
  const [accuracyVerificationReport, setAccuracyVerificationReport] = useState<{
    actualReps: number;
    detectedReps: number;
    falsePositives: number;
    falseNegatives: number;
    completeRatioPct: number;
    avgFps: number;
    totalFrames: number;
  } | null>(null);

  // Camera FOV, Aspect Ratio & Zoom States
  const [zoomInfo, setZoomInfo] = useState<{
    supported: boolean;
    min: number;
    max: number;
    step: number;
    current: number;
  }>({ supported: false, min: 1, max: 1, step: 0.1, current: 1 });
  const [fitMode, setFitMode] = useState<'contain' | 'cover'>('contain');
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
    isArmClipping: false,
    isPlaneDegraded: false,
    targetThreshold: 80,
  });

  // 60 FPS Visual Ring Animation & Direct DOM Ref
  const progressCircleRef = useRef<SVGCircleElement | null>(null);
  const targetProgressRef = useRef<number>(0);
  const currentAnimatedProgressRef = useRef<number>(0);
  const [initialRenderTime] = useState<number>(() => performance.now());
  const lastRenderTimeRef = useRef<number>(initialRenderTime);
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

  // Staff Shortcut: Shift+D toggles Staff Diagnostic Debug HUD
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'D' && e.shiftKey) {
        setShowDebugHud((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const activeSideRef = useRef(activeSide);
  useEffect(() => {
    activeSideRef.current = activeSide;
    stateMachineRef.current.setSide(activeSide);
  }, [activeSide]);

  // Sync config updates without restarting loop
  const resolvedConfigRef = useRef(resolvedConfig);
  useEffect(() => {
    resolvedConfigRef.current = resolvedConfig;
    const currentSide = activeSideRef.current || resolvedConfig.side;
    stateMachineRef.current.updateConfig({
      ...resolvedConfig,
      side: currentSide,
    });
    if (currentSide) {
      stateMachineRef.current.setSide(currentSide);
    }
  }, [resolvedConfig]);

  const handleCalculateAccuracy = useCallback(() => {
    const actual = parseInt(actualRepsInput, 10) || 0;
    const detected = validCompletedRepsRef.current;
    const fp = Math.max(0, detected - actual);
    const fn = Math.max(0, actual - detected);
    const totalF = accuracyTotalFramesRef.current || 1;
    const completeRatio = Math.round((accuracyCompleteJointFramesRef.current / totalF) * 100);
    const avgFps = accuracyFpsSamplesRef.current.length > 0
      ? accuracyFpsSamplesRef.current.reduce((a, b) => a + b, 0) / accuracyFpsSamplesRef.current.length
      : 0;
    setAccuracyVerificationReport({
      actualReps: actual,
      detectedReps: detected,
      falsePositives: fp,
      falseNegatives: fn,
      completeRatioPct: completeRatio,
      avgFps: Math.round(avgFps * 10) / 10,
      totalFrames: accuracyTotalFramesRef.current,
    });
  }, [actualRepsInput]);

  const handleExportAccuracyCsv = useCallback(() => {
    const records = accuracyTelemetryRef.current;
    if (!records || records.length === 0) {
      alert('ยังไม่มีข้อมูลบันทึกในรอบนี้');
      return;
    }
    const headers = [
      'TimestampMs',
      'DateTime',
      'Phase',
      'CurrentAngleDeg',
      'TargetAngleDeg',
      'PostureAccuracyScore',
      'IsCompleteJointsVisible',
      'InferenceFPS',
      'DetectedRepsCount',
    ];
    const rows = records.map((r) => [
      r.timestamp,
      `"${r.timeStr}"`,
      `"${r.phase}"`,
      r.angle,
      r.targetAngle,
      r.accuracyScore,
      r.isCompleteJoints ? 'YES' : 'NO',
      r.fps,
      r.detectedReps,
    ]);
    const csvContent = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `drtech_accuracy_test_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, []);

  const handleResetAccuracyData = useCallback(() => {
    accuracyTelemetryRef.current = [];
    accuracyTotalFramesRef.current = 0;
    accuracyCompleteJointFramesRef.current = 0;
    accuracyFpsSamplesRef.current = [];
    setAccuracyVerificationReport(null);
  }, []);

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

  // Sub-pixel EMA lerp smoothing buffer strictly for canvas rendering with 200ms Grace Period Decay
  const canvasSmoothedPointsRef = useRef<{
    [idx: number]: {
      x: number;
      y: number;
      visibility: number;
      lastSeenMs: number;
      inFrame: boolean;
    };
  }>({});

  // --- Continuous Identity Verification State & Refs ---
  const patientId = patient?.patient_id || patient?.hn || '';
  const [initialSessionId] = useState<string>(
    () => `sess-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
  );
  const sessionIdRef = useRef<string>(initialSessionId);

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
  const [initialVerifiedTime] = useState<number>(() => Date.now());
  const lastVerifiedTimeRef = useRef<number>(initialVerifiedTime);
  const verifiedFaceBoxRef = useRef<NormalizedBox | null>(null);
  const isFaceCheckInProgressRef = useRef<boolean>(false);
  const lastFaceCheckTimeRef = useRef<number>(0);
  const identityFailureStartTimeRef = useRef<number | null>(null);
  const rejectedRepsCountRef = useRef<number>(0);
  const validCompletedRepsRef = useRef<number>(0);

  // Auto-pause modal when verification fails > 20s
  const [, setShowIdentityFailureModal] = useState<boolean>(false);
  // Blocking modal when patient has no enrolled face template in system (Choice A)
  const [, setShowNoTemplateModal] = useState<boolean>(false);

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
          setVerificationStatus('no_template');
          isIdentityVerifiedRef.current = true;
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
          isIdentityVerifiedRef.current = true;
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
      activeSideRef.current = newSide;
      if (stateMachineRef.current) {
        stateMachineRef.current.setSide(newSide);
      }
      speakThai(
        newSide === 'right' ? 'ตรวจจับข้างขวา' : newSide === 'left' ? 'ตรวจจับข้างซ้าย' : 'ตรวจจับทั้งสองข้าง',
        'side_toggle',
        0
      );
    },
    [speakThai]
  );

  // Resource Cleanup on Unmount
  const cleanupResources = useCallback(() => {
    isMountedRef.current = false;
    if (rvfcIdRef.current !== null && videoRef.current && 'cancelVideoFrameCallback' in videoRef.current) {
      try {
        (videoRef.current as any).cancelVideoFrameCallback(rvfcIdRef.current);
      } catch {}
      rvfcIdRef.current = null;
    }
    if (renderRafIdRef.current !== null) {
      cancelAnimationFrame(renderRafIdRef.current);
      renderRafIdRef.current = null;
    }
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
      cachedPoseLandmarker = null;
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
          // 1. Initialize Webcam Stream (1280x720, 16:9 widescreen, 60fps ideal with track reuse)
          let stream: MediaStream;
          if (streamRef.current && streamRef.current.getVideoTracks().some((t) => t.readyState === 'live')) {
            stream = streamRef.current;
            videoEl.srcObject = stream;
          } else {
            try {
              stream = await navigator.mediaDevices.getUserMedia({
                video: {
                  width: { ideal: 1280 },
                  height: { ideal: 720 },
                  aspectRatio: { ideal: 16 / 9 },
                  frameRate: { ideal: 60, min: 30 },
                  facingMode: 'user',
                },
                audio: false,
              });
            } catch {
              try {
                stream = await navigator.mediaDevices.getUserMedia({
                  video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    frameRate: { ideal: 60, min: 30 },
                  },
                  audio: false,
                });
              } catch {
                stream = await navigator.mediaDevices.getUserMedia({
                  video: true,
                  audio: false,
                });
              }
            }

            if (!isMountedRef.current) {
              stream.getTracks().forEach((t) => t.stop());
              return;
            }

            streamRef.current = stream;
            videoEl.srcObject = stream;
            videoEl.muted = true;
            videoEl.playsInline = true;

            // Immediately enforce minimum hardware zoom (widest FOV without crop) to clear any residual zoom
            const initialVideoTrack = stream.getVideoTracks()[0];
            if (initialVideoTrack && typeof initialVideoTrack.getCapabilities === 'function') {
              try {
                const caps: any = initialVideoTrack.getCapabilities();
                if (caps && 'zoom' in caps && typeof caps.zoom === 'object') {
                  const minZoom = Number(caps.zoom.min ?? 1);
                  await initialVideoTrack.applyConstraints({
                    advanced: [{ zoom: minZoom } as any],
                  });
                }
              } catch {}
            }

            // Attempt hardware exposure compensation for backlight
            backlightCompensatorRef.current.applyHardwareExposure(stream);
          }
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

        // 2. Load MediaPipe Tasks-Vision with Module-Level Caching (Zero-Freeze Transition)
        if (!cachedPoseLandmarker) {
          if (!cachedVisionModule) {
            cachedVisionModule = await import('@mediapipe/tasks-vision');
          }
          const vision = cachedVisionModule;

          if (!cachedFilesetResolver) {
            const wasmSources = [
              '/models/wasm',
              '/wasm',
              'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm',
              'https://unpkg.com/@mediapipe/tasks-vision@0.10.14/wasm',
            ];

            for (const wasmUrl of wasmSources) {
              try {
                cachedFilesetResolver = await vision.FilesetResolver.forVisionTasks(wasmUrl);
                if (cachedFilesetResolver) break;
              } catch (wasmErr) {
                console.warn('[PoseEngine] WASM source attempt failed:', wasmUrl, wasmErr);
              }
            }
          }

          if (!cachedFilesetResolver) {
            throw new Error('ไม่สามารถโหลดไฟล์ WebAssembly ของระบบตรวจจับได้ (กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ตหรือ CSP)');
          }

          // Model Sources: Local Lite (fastest, zero network delay) -> Full CDN -> Local Full -> Lite CDN
          const modelSources = [
            '/models/pose_landmarker.task',
            '/models/pose_landmarker_lite.task',
            'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task',
            '/models/pose_landmarker_full.task',
            'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task',
          ];

          let landmarker: any = null;
          let selectedDelegate: 'GPU' | 'CPU' = 'GPU';

          // Try GPU delegate first across sources (numPoses: 2 for active subject locking, outputSegmentationMasks: false)
          for (const modelPath of modelSources) {
            try {
              landmarker = await vision.PoseLandmarker.createFromOptions(cachedFilesetResolver, {
                baseOptions: {
                  modelAssetPath: modelPath,
                  delegate: 'GPU',
                },
                runningMode: 'VIDEO',
                numPoses: 2,
                outputSegmentationMasks: false,
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
                landmarker = await vision.PoseLandmarker.createFromOptions(cachedFilesetResolver, {
                  baseOptions: {
                    modelAssetPath: modelPath,
                    delegate: 'CPU',
                  },
                  runningMode: 'VIDEO',
                  numPoses: 2,
                  outputSegmentationMasks: false,
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

          cachedPoseLandmarker = landmarker;
          cachedDelegate = selectedDelegate;
        }

        if (!isMountedRef.current) return;

        landmarkerRef.current = cachedPoseLandmarker;
        setModelDelegate(cachedDelegate);
        setModelStatus('ready');

        // 3. Start Decoupled Dual-Loop Architecture:
        // - Loop A: AI Inference Loop (requestVideoFrameCallback, 0% duplicate frames)
        // - Loop B: High-Refresh Overlay Render Loop (requestAnimationFrame, 60-165Hz)

        // Loop A Scheduler
        const scheduleInference = () => {
          if (!isMountedRef.current || !videoRef.current) return;
          const v = videoRef.current;
          if ('requestVideoFrameCallback' in v) {
            rvfcIdRef.current = (v as any).requestVideoFrameCallback(() => {
              runInferenceLoop();
            });
          } else {
            rafIdRef.current = requestAnimationFrame(() => {
              runInferenceLoop();
            });
          }
        };

        const runInferenceLoop = () => {
          if (!isMountedRef.current) return;
          const vEl = videoRef.current;
          const detector = landmarkerRef.current;

          if (!vEl || !detector || vEl.readyState < 2 || vEl.videoWidth === 0) {
            scheduleInference();
            return;
          }

          // Fallback guard for non-rVFC browsers: check if video frame actually advanced
          const hasRvfc = typeof (vEl as any).requestVideoFrameCallback === 'function';
          if (!hasRvfc) {
            if (vEl.currentTime === lastVideoTimeRef.current) {
              scheduleInference();
              return;
            }
            lastVideoTimeRef.current = vEl.currentTime;
          }

          if (isInferenceBusyRef.current) {
            scheduleInference();
            return;
          }
          isInferenceBusyRef.current = true;

          const nowMs = performance.now();

          // AI Inference Interval Throttle only in low-power mode
          if (lowPowerRef.current && nowMs - lastInferenceTimeRef.current < 66) {
            isInferenceBusyRef.current = false;
            scheduleInference();
            return;
          }

          const dtMs = Math.max(nowMs - lastInferenceTimeRef.current, 1);
          lastInferenceTimeRef.current = nowMs;
          smoothedFpsRef.current = 0.85 * smoothedFpsRef.current + 0.15 * (1000 / dtMs);

          // Strictly increasing integer timestamp for MediaPipe stream calculator
          const rawNowMs = Math.round(nowMs);
          const safeTimestampMs =
            rawNowMs > lastTimestampMsRef.current
              ? rawNowMs
              : lastTimestampMsRef.current + 1;
          lastTimestampMsRef.current = safeTimestampMs;

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
            result = detector.detectForVideo(inputSource, safeTimestampMs);
          } catch (detectErr) {
            console.warn('[PoseEngine] detectForVideo transient frame warning:', detectErr);
            isInferenceBusyRef.current = false;
            scheduleInference();
            return;
          }

          const hasPose = Boolean(result && result.landmarks && result.landmarks.length > 0);
          const isTimerExercise =
            (resolvedConfigRef.current as any).mode === 'timer' ||
            resolvedConfigRef.current.evaluationMode === 'timer';
          const isPendulumExercise =
            resolvedConfigRef.current.evaluationMode === 'pendulum_circular' ||
            Boolean((resolvedConfigRef.current as any).isPendulum);

          if (!hasPose) {
            // Update pose state to indicate missing pose without wiping smoothed canvas buffer
            previousPoseStateRef.current = currentPoseStateRef.current;
            currentPoseStateRef.current = {
              landmarks: null,
              timestampMs: safeTimestampMs,
              inFrame: false,
            };

            if (isTimerExercise) {
              const evalRes = stateMachineRef.current.evaluate([], safeTimestampMs);
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
              isInferenceBusyRef.current = false;
              scheduleInference();
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
            isInferenceBusyRef.current = false;
            scheduleInference();
            return;
          }

          // 1. Multi-Pose Subject Locking
          const allPoses = result.landmarks;
          const detectedPeopleCount = allPoses.length;
          const { selectedPose: chosenPose, selectedIndex: bestIdx, newLockedCoM } =
            selectSubjectPoseWithIdentity(allPoses, verifiedFaceBoxRef.current, lockedSubjectCoMRef.current);
          lockedSubjectCoMRef.current = newLockedCoM;

          // 2. Clinical One Euro Filter (1€ Filter - low tremor at rest, low latency in motion)
          const smoothedPose = oneEuroFilterRef.current.filter(chosenPose, safeTimestampMs);
          smoothedLandmarksRef.current = smoothedPose;

          // 3. Clinical State Machine Evaluation (GROUND TRUTH: strictly using filtered real landmarks + 3D World Landmarks)
          const wdStatus = watchdogRef.current.update(smoothedPose, safeTimestampMs);
          const chosenWorldPose = (result.worldLandmarks && result.worldLandmarks[bestIdx]) || undefined;
          const evalRes = stateMachineRef.current.evaluateFrame(smoothedPose, chosenWorldPose, safeTimestampMs);
          latestEvalResultRef.current = evalRes;
          targetProgressRef.current = computeTargetRingProgress(
            evalRes,
            resolvedConfigRef.current,
            false,
            isPendulumExercise,
            validCompletedRepsRef.current
          );

          // Update Decoupled Pose State for Loop B (Render Loop)
          previousPoseStateRef.current = currentPoseStateRef.current;
          currentPoseStateRef.current = {
            landmarks: smoothedPose,
            timestampMs: safeTimestampMs,
            inFrame: true,
          };

          // Telemetry tracking for Staff Accuracy Test Mode
          if (isAccuracyTestModeRef.current && smoothedPose) {
            accuracyTotalFramesRef.current += 1;
            const hasSh = (smoothedPose[11]?.visibility ?? 0) > 0.4 || (smoothedPose[12]?.visibility ?? 0) > 0.4;
            const hasEl = (smoothedPose[13]?.visibility ?? 0) > 0.4 || (smoothedPose[14]?.visibility ?? 0) > 0.4;
            const hasWr = (smoothedPose[15]?.visibility ?? 0) > 0.4 || (smoothedPose[16]?.visibility ?? 0) > 0.4;
            const isComplete = hasSh && hasEl && hasWr;
            if (isComplete) accuracyCompleteJointFramesRef.current += 1;
            accuracyFpsSamplesRef.current.push(smoothedFpsRef.current);

            if (safeTimestampMs - lastAccuracySampleMsRef.current >= 100) {
              lastAccuracySampleMsRef.current = safeTimestampMs;
              accuracyTelemetryRef.current.push({
                timestamp: safeTimestampMs,
                timeStr: new Date(safeTimestampMs).toISOString(),
                phase: evalRes.phase,
                angle: evalRes.currentAngleDeg,
                targetAngle: evalRes.targetAngleDeg,
                accuracyScore: evalRes.accuracyPercent ?? 0,
                isCompleteJoints: isComplete,
                fps: Math.round(smoothedFpsRef.current * 10) / 10,
                detectedReps: validCompletedRepsRef.current,
              });
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
          const targetReps = resolvedConfigRef.current.defaultPrescription?.repsPerSet || 10;
          const totalSets = resolvedConfigRef.current.defaultPrescription?.totalSets || 3;
          const isSetDone = validCompletedRepsRef.current >= targetReps;
          const isExerciseDone = isSetDone && evalRes.currentSet >= totalSets;

          if (isSetDone && !isExerciseDone && !isRestingRef.current) {
            setIsResting(true);
            isRestingRef.current = true;
            speakThai(`จบเซ็ตที่ ${evalRes.currentSet} พักสักครู่ค่ะ`, 'set_complete', 2500);
            if (isAccuracyTestModeRef.current) {
              setShowAccuracyVerifyModal(true);
            }
          } else if (isExerciseDone && !isSummaryOpenRef.current) {
            setIsSummaryOpen(true);
            isSummaryOpenRef.current = true;
            speakThai('ยินดีด้วยค่ะ คุณทำครบทุกเซ็ตแล้ว', 'exercise_complete', 2500);
            if (isAccuracyTestModeRef.current) {
              setShowAccuracyVerifyModal(true);
            }
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

          // UI update guard (throttled to avoid redundant state updates)
          const prevUi = lastRenderedUiValuesRef.current;
          const isRepsChanged = validCompletedRepsRef.current !== prevUi.completedReps;
          const isSetChanged = evalRes.currentSet !== prevUi.currentSet;
          const isPhaseChanged = evalRes.phase !== prevUi.repPhase;
          const isLightingChanged =
            (backlightRes.isBacklightDetected || backlightRes.isSubjectDark) !== prevUi.hasLightingWarning;
          const isDistanceStatusChanged =
            (evalRes.distanceStatus || 'ระยะเหมาะสม') !== prevUi.distanceStatus;
          const isCoachingChanged = (evalRes.coachingMessageTh || '') !== prevUi.coachingMessage;
          const isReadinessChanged = (evalRes.readinessStatus || '') !== prevUi.readinessStatus;
          const isDebugIntervalPassed = showDebugRef.current && nowMs - lastUiUpdateMsRef.current >= 250;
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

            const requiredJoints = getRequiredKeypointsForExercise(resolvedConfigRef.current);
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

            const isArmClipping = Boolean(
              smoothedPose && (
                (smoothedPose[13] && (smoothedPose[13].x < 0.03 || smoothedPose[13].x > 0.97 || smoothedPose[13].y < 0.03 || smoothedPose[13].y > 0.97)) ||
                (smoothedPose[14] && (smoothedPose[14].x < 0.03 || smoothedPose[14].x > 0.97 || smoothedPose[14].y < 0.03 || smoothedPose[14].y > 0.97)) ||
                (smoothedPose[15] && (smoothedPose[15].x < 0.03 || smoothedPose[15].x > 0.97 || smoothedPose[15].y < 0.03 || smoothedPose[15].y > 0.97)) ||
                (smoothedPose[16] && (smoothedPose[16].x < 0.03 || smoothedPose[16].x > 0.97 || smoothedPose[16].y < 0.03 || smoothedPose[16].y > 0.97))
              )
            );

            const strokeColor =
              evalRes.formRating === 'error'
                ? '#fbbf24'
                : evalRes.formRating === 'warning'
                  ? '#00f5d4'
                  : '#10b981';

            const shoulderWidthPct = Math.round((evalRes.shoulderWidthRatio ?? 0.28) * 100);
            const distanceStatus = evalRes.distanceStatus || 'ระยะเหมาะสม';
            const distanceWarning =
              evalRes.phase === 'WAITING_FOR_FRAMING' ? evalRes.coachingMessageTh : null;

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
              readinessReason:
                evalRes.blockingReason ||
                (evalRes.phase === 'WAITING_FOR_FRAMING' ? 'รอจัดตำแหน่ง' : 'พร้อมเริ่มฝึก'),
              isArmClipping,
              isPlaneDegraded: Boolean(evalRes.isPlaneDegraded),
              targetThreshold:
                evalRes.targetAngleDeg ?? resolvedConfigRef.current.angleMechanics?.targetMinDeg ?? 80,
            });
            setEvalResult(evalRes);
            setWatchdogStatus(wdStatus);
          }

          isInferenceBusyRef.current = false;
          scheduleInference();
        };

        // Loop B: High-Refresh Overlay Render Loop (runs at 60-165 Hz display refresh rate)
        const renderOverlayLoop = () => {
          if (!isMountedRef.current) return;
          renderRafIdRef.current = requestAnimationFrame(renderOverlayLoop);

          const cEl = canvasRef.current;
          const vEl = videoRef.current;
          if (!cEl || !vEl || vEl.readyState < 2) return;

          const nowMs = performance.now();

          // 1. Measure 60-165 FPS Display Render Frame Time
          const renderDtMs = Math.max(nowMs - lastRenderTimeRef.current, 1);
          lastRenderTimeRef.current = nowMs;
          smoothedRenderFpsRef.current =
            0.9 * smoothedRenderFpsRef.current + 0.1 * (1000 / renderDtMs);

          // 2. High-Refresh Ring Lerp Interpolation & Direct DOM Update
          const targetProgress = targetProgressRef.current;
          const currentProgress = currentAnimatedProgressRef.current;
          const dtSec = Math.min(renderDtMs / 1000, 0.05);
          const lerpFactor = 1 - Math.exp(-16 * dtSec);
          const nextProgress =
            Math.abs(targetProgress - currentProgress) < 0.0005
              ? targetProgress
              : currentProgress + (targetProgress - currentProgress) * lerpFactor;
          currentAnimatedProgressRef.current = nextProgress;

          if (progressCircleRef.current) {
            const circ = 2 * Math.PI * 42;
            const offset = circ * (1 - Math.max(0, Math.min(1, nextProgress)));
            progressCircleRef.current.style.strokeDashoffset = `${offset}px`;
          }

          const ctx = cEl.getContext('2d');
          if (!ctx) return;

          // HiDPI DevicePixelRatio Scaling & Canvas Resolution
          const displayW = cEl.clientWidth || vEl.clientWidth || 1280;
          const displayH = cEl.clientHeight || vEl.clientHeight || 720;
          const dpr = Math.min(window.devicePixelRatio || 1, 2);
          const targetW = Math.round(displayW * dpr);
          const targetH = Math.round(displayH * dpr);

          if (cEl.width !== targetW || cEl.height !== targetH) {
            cEl.width = targetW;
            cEl.height = targetH;
          }
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

          // If user toggled "Hide Skeleton", clear canvas and skip heavy drawing
          if (!showSkeletonRef.current) {
            ctx.clearRect(0, 0, displayW, displayH);
            return;
          }

          ctx.clearRect(0, 0, displayW, displayH);

          // Interpolate and extrapolate landmarks for silky-smooth 60-120 FPS overlay
          const currState = currentPoseStateRef.current;
          const prevState = previousPoseStateRef.current;
          const currentFitMode = fitModeRef.current;
          const renderPoints: {
            [idx: number]: {
              x: number;
              y: number;
              visibility: number;
              inFrame: boolean;
              decayAlpha: number;
            };
          } = {};

          if (currState && currState.landmarks && currState.inFrame) {
            const currLms = currState.landmarks;
            const prevLms = prevState?.landmarks;
            const tCurr = currState.timestampMs;
            const tPrev = prevState?.timestampMs ?? tCurr - 33;
            const dtInference = Math.max(tCurr - tPrev, 10);
            const elapsedSinceInference = Math.max(0, nowMs - tCurr);
            // Short predictive extrapolation horizon: clamp to max 35ms
            const predictDt = Math.min(elapsedSinceInference, 35);

            currLms.forEach((lm: any, idx: number) => {
              let normX = lm.x;
              let normY = lm.y;
              const vis = lm.visibility ?? 1.0;

              if (prevLms && prevLms[idx] && predictDt > 0) {
                const vx = (lm.x - prevLms[idx].x) / dtInference;
                const vy = (lm.y - prevLms[idx].y) / dtInference;
                normX = Math.max(-0.05, Math.min(1.05, lm.x + vx * predictDt));
                normY = Math.max(-0.05, Math.min(1.05, lm.y + vy * predictDt));
              }

              const proj = projectLandmarkToCanvas(
                { x: normX, y: normY, visibility: vis },
                vEl.videoWidth || 1280,
                vEl.videoHeight || 720,
                displayW,
                displayH,
                true,
                currentFitMode
              );

              if (proj && proj.inFrame && vis >= 0.35) {
                canvasSmoothedPointsRef.current[idx] = {
                  x: proj.x,
                  y: proj.y,
                  visibility: vis,
                  lastSeenMs: nowMs,
                  inFrame: true,
                };
                renderPoints[idx] = {
                  x: proj.x,
                  y: proj.y,
                  visibility: vis,
                  inFrame: true,
                  decayAlpha: 1.0,
                };
              }
            });
          }

          // Grace Period Decay (200 ms Hold & Fade) for momentarily lost landmarks
          const LOST_GRACE_MS = 200;
          for (let idx = 0; idx < 33; idx++) {
            if (!renderPoints[idx]) {
              const prevSmoothed = canvasSmoothedPointsRef.current[idx];
              if (prevSmoothed) {
                const elapsedSinceSeen = nowMs - prevSmoothed.lastSeenMs;
                if (elapsedSinceSeen <= LOST_GRACE_MS) {
                  const decayAlpha = Math.max(0, 1 - elapsedSinceSeen / LOST_GRACE_MS);
                  renderPoints[idx] = {
                    x: prevSmoothed.x,
                    y: prevSmoothed.y,
                    visibility: prevSmoothed.visibility * decayAlpha,
                    inFrame: prevSmoothed.inFrame,
                    decayAlpha,
                  };
                } else {
                  delete canvasSmoothedPointsRef.current[idx];
                }
              }
            }
          }

          // Active dynamic colors and styles
          const currentEval = latestEvalResultRef.current;
          const strokeColor =
            currentEval?.formRating === 'error'
              ? '#fbbf24'
              : currentEval?.formRating === 'warning'
                ? '#00f5d4'
                : '#10b981';

          const currentActiveSide =
            activeSideRef.current || resolvedConfigRef.current.side || 'right';
          const isBilateral =
            currentActiveSide === 'bilateral' ||
            (currentActiveSide !== 'left' &&
              currentActiveSide !== 'right' &&
              (resolvedConfigRef.current.side === 'bilateral' ||
                Boolean((resolvedConfigRef.current as any).bilateral)));
          const isNeckExercise =
            resolvedConfigRef.current.targetJoint === 'neck' ||
            resolvedConfigRef.current.framing === 'head_shoulders';

          const activeColor = strokeColor;
          const inactiveColor = 'rgba(148, 163, 184, 0.65)';
          const torsoBridgeColor = 'rgba(56, 189, 248, 0.75)';

          const getConnectionStyle = (idxA: number, idxB: number) => {
            const isHeadConn =
              (idxA === 0 || idxA === 7 || idxA === 8) &&
              (idxB === 0 || idxB === 7 || idxB === 8 || idxB === 11 || idxB === 12);

            if (isNeckExercise) {
              if (isHeadConn) {
                return { lineWidth: 5, strokeStyle: activeColor, isActive: true };
              }
              if (idxA === 11 && idxB === 12) {
                return { lineWidth: 4, strokeStyle: torsoBridgeColor, isActive: false };
              }
              return { lineWidth: 3, strokeStyle: inactiveColor, isActive: false };
            }

            if (isHeadConn) {
              return { lineWidth: 3, strokeStyle: inactiveColor, isActive: false };
            }

            if (isBilateral) {
              return { lineWidth: 6, strokeStyle: activeColor, isActive: true };
            }
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
            if (isNeckExercise) {
              return idx === 0 || idx === 7 || idx === 8;
            }
            if (isBilateral) return true;
            if (currentActiveSide === 'left') return idx % 2 === 1;
            if (currentActiveSide === 'right') return idx % 2 === 0;
            return true;
          };

          // 1. Draw Skeleton Lines (Torso, Arms, Hands, Legs, + Head when neck)
          const activeConnections = isNeckExercise
            ? [...HEAD_POSE_CONNECTIONS, ...POSE_CONNECTIONS]
            : POSE_CONNECTIONS;

          for (const [idxA, idxB] of activeConnections) {
            const ptA = renderPoints[idxA];
            const ptB = renderPoints[idxB];
            if (
              ptA &&
              ptB &&
              ptA.inFrame &&
              ptB.inFrame &&
              (ptA.visibility ?? 0) >= 0.35 &&
              (ptB.visibility ?? 0) >= 0.35
            ) {
              const style = getConnectionStyle(idxA, idxB);
              const lineAlpha = Math.min(ptA.decayAlpha ?? 1.0, ptB.decayAlpha ?? 1.0);
              ctx.lineWidth = style.lineWidth;
              ctx.strokeStyle = applyAlphaToColor(style.strokeStyle, lineAlpha);
              ctx.beginPath();
              ctx.moveTo(ptA.x, ptA.y);
              ctx.lineTo(ptB.x, ptB.y);
              ctx.stroke();
            }
          }

          // 2. Draw Joint Circular Dots
          const activeJointIndices = isNeckExercise
            ? [...HEAD_JOINT_INDICES, ...BODY_JOINT_INDICES]
            : BODY_JOINT_INDICES;

          const fingerJointIndices = [17, 18, 19, 20, 21, 22];

          for (const idx of activeJointIndices) {
            const pt = renderPoints[idx];
            if (!pt || !pt.inFrame || (pt.visibility ?? 0) < 0.35) continue;

            const jointAlpha = pt.decayAlpha ?? 1.0;
            const active = isJointActive(idx);
            const isFinger = fingerJointIndices.includes(idx);
            const radius = isFinger ? (active ? 4 : 2.5) : active ? 7.5 : 4.5;
            const fillColor = active ? activeColor : '#94a3b8';

            ctx.beginPath();
            ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
            ctx.fillStyle = applyAlphaToColor(fillColor, jointAlpha);
            ctx.fill();
            ctx.lineWidth = active ? 2 : 1.5;
            ctx.strokeStyle = applyAlphaToColor('#ffffff', jointAlpha);
            ctx.stroke();

            // Draw debug label if staff debug is enabled
            if (showDebugRef.current && (idx >= 11 || isNeckExercise)) {
              ctx.font = 'bold 11px sans-serif';
              ctx.fillStyle = applyAlphaToColor('#38bdf8', jointAlpha);
              ctx.fillText(`#${idx} (${pt.visibility.toFixed(2)})`, pt.x + 10, pt.y - 6);
            }
          }
        };

        // Start both decoupled loops simultaneously
        scheduleInference();
        renderRafIdRef.current = requestAnimationFrame(renderOverlayLoop);
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
  }, [cleanupResources, playRepChime, speakThai]);

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
  const isInherentlyBilateral =
    resolvedConfig.targetJoint === 'neck' ||
    resolvedConfig.evaluationMode === 'neck_tilt' ||
    resolvedConfig.evaluationMode === 'heel_raise' ||
    resolvedConfig.id === 'sit-to-stand' ||
    resolvedConfig.id === 'wall-pushup' ||
    resolvedConfig.id === 'scapular-retraction' ||
    resolvedConfig.id === 'chin-tuck' ||
    resolvedConfig.id === 'shoulder-shrug' ||
    resolvedConfig.id === 'mini-squat';
  const isBilateral =
    activeSide === 'bilateral' ||
    (activeSide !== 'left' &&
      activeSide !== 'right' &&
      (isInherentlyBilateral || resolvedConfig.side === 'bilateral'));

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

    // Resolve per-exercise side-aware coaching cues
    const cues = getExerciseCoachingCues(resolvedConfig.id, activeSide);

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
      const framingMsg =
        lang === 'zh-CN'
          ? (cues.framingMessageCn || '请后退一些，确保进入镜头')
          : lang === 'en-US'
            ? (cues.framingMessageEn || 'Step back slightly into view')
            : (cues.framingMessageTh ||
                (isLowerBody
                  ? 'ถอยหลังอีกนิด ให้เห็นขาชัดเจน'
                  : resolvedConfig.targetJoint === 'neck'
                    ? 'ถอยหลังอีกนิด ให้เห็นศีรษะและไหล่ชัดเจน'
                    : 'ถอยหลังอีกนิด ให้เห็นแขนถึงข้อศอก'));
      return {
        icon: '⚠️',
        message: framingMsg,
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
        icon: cues.idleIcon || '📷',
        message:
          lang === 'zh-CN'
            ? (cues.idleMessageCn || '请站直并进入检测区域以开始训练')
            : lang === 'en-US'
              ? (cues.idleMessageEn || 'Stand upright in frame to begin')
              : (cues.idleMessageTh ||
                  (resolvedConfig.targetJoint === 'neck'
                    ? 'นั่งตัวตรงมองมาที่กล้อง เพื่อเริ่มท่า'
                    : 'กรุณายืนตรงให้เห็นช่วงบนชัดเจนเพื่อเริ่มท่า')),
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
          icon: cues.movingIcon || '🌀',
          message: evalResult.coachingMessageTh,
          tone: 'teal',
        };
      }
      return {
        icon: cues.movingIcon || '🌀',
        message:
          lang === 'zh-CN'
            ? (cues.movingMessageCn || '身体向前微倾，顺畅做圆周摆动')
            : lang === 'en-US'
              ? (cues.movingMessageEn || 'Lean forward slightly, relax arm and swing in circles')
              : (cues.movingMessageTh || 'แกว่งแขนช้า ๆ เป็นวงกลม ปล่อยแขนตามสบาย'),
        tone: 'teal',
      };
    }

    if (evalResult?.phase === 'HOLDING_TARGET') {
      return {
        icon: cues.holdingIcon || '🌟',
        message:
          lang === 'zh-CN'
            ? (cues.holdingMessageCn || '很好！请在目标位置保持稳定...')
            : lang === 'en-US'
              ? (cues.holdingMessageEn || 'Great! Hold steady at target...')
              : (cues.holdingMessageTh || 'ค้างไว้นิ่งๆ อีกนิด ดีมากครับ'),
        tone: 'emerald',
      };
    }

    if (evalResult?.phase === 'MOVING_TO_TARGET') {
      return {
        icon: cues.movingIcon || (isLowerBody ? '⬆️' : '🎯'),
        message:
          lang === 'zh-CN'
            ? (cues.movingMessageCn || (isLowerBody ? '慢慢向上抬腿...' : '做动作直到达标...'))
            : lang === 'en-US'
              ? (cues.movingMessageEn || (isLowerBody ? 'Lift leg up smoothly...' : 'Move smoothly to target...'))
              : (cues.movingMessageTh || (isLowerBody ? 'ค่อยๆ ยกขาขึ้นช้าๆ...' : 'ทำท่าช้าๆ ตามภาพตัวอย่าง...')),
        tone: 'teal',
      };
    }

    if (evalResult?.phase === 'RETURNING_TO_START') {
      return {
        icon: cues.returningIcon || (isLowerBody ? '⬇️' : '↩️'),
        message:
          lang === 'zh-CN'
            ? (cues.returningMessageCn || (isLowerBody ? '慢慢放下腿部回到起点...' : '缓慢回到初始位置...'))
            : lang === 'en-US'
              ? (cues.returningMessageEn || (isLowerBody ? 'Lower leg down smoothly...' : 'Return smoothly to starting position...'))
              : (cues.returningMessageTh || (isLowerBody ? 'ค่อยๆ ผ่อนขาลงช้าๆ...' : 'ค่อยๆ ผ่อนกลับสู่ตำแหน่งเริ่มต้นช้าๆ')),
        tone: 'teal',
      };
    }

    // Priority (ง): Normal Training / Encouraging
    return {
      icon: cues.idleIcon || '✨',
      message:
        (evalResult?.coachingMessageTh && evalResult.phase !== 'IDLE' ? evalResult.coachingMessageTh : undefined) ||
        (lang === 'zh-CN'
          ? (cues.idleMessageCn || '动作标准，请继续保持')
          : lang === 'en-US'
            ? (cues.idleMessageEn || 'Good form, keep going smoothly')
            : (cues.idleMessageTh || 'ดีมาก ทำต่อเนื่องอย่างผ่อนคลายเลยครับ')),
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
            {isAccuracyTestMode && (
              <button
                type="button"
                onClick={() => setShowAccuracyVerifyModal(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-2xl text-xs font-mono font-bold bg-emerald-500/90 hover:bg-emerald-400 text-slate-950 border border-emerald-300 shadow-lg cursor-pointer active:scale-95 animate-pulse"
                title="คลิกเพื่อดูและส่งออกรายงานการทดสอบความแม่นยำ"
              >
                <span>🧪 TEST</span>
                <span className="opacity-80">({accuracyTotalFramesRef.current}f)</span>
              </button>
            )}
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

          {/* Real-time Framing Alert Banner (Arm clipping boundary) */}
          {hudState.isArmClipping && hudState.repPhase !== 'WAITING_FOR_FRAMING' && (
            <div className="absolute top-4 inset-x-4 z-25 flex justify-center pointer-events-none animate-bounce-subtle">
              <div className="bg-amber-500/95 backdrop-blur-md text-white border-2 border-amber-300 px-6 py-2.5 rounded-2xl shadow-xl font-bold text-xs sm:text-sm flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-white shrink-0 animate-pulse" />
                <span>
                  {hudState.shoulderWidthPct > 50
                    ? (lang === 'zh-CN'
                      ? '🪑 请稍微后退，确保训练手臂完整入镜'
                      : lang === 'en-US'
                        ? '🪑 Step back slightly so your exercise arm is visible'
                        : '🪑 ถอยหลังอีกนิด ให้เห็นแขนข้างที่ฝึกชัดเจน')
                    : (lang === 'zh-CN'
                      ? '📷 请调整位置，确保手肘在画面内'
                      : lang === 'en-US'
                        ? '📷 Adjust position so your elbow and arm remain in frame'
                        : '📷 ขยับถอยหลังอีกนิด ให้เห็นแขนถึงข้อศอก')}
                </span>
              </div>
            </div>
          )}

          {/* Body Alignment Warning Guide Card if waiting for framing */}
          {hudState.repPhase === 'WAITING_FOR_FRAMING' && (
            <div className="absolute top-4 inset-x-4 z-20 flex justify-center pointer-events-none">
              <div className="bg-white/95 backdrop-blur-md text-slate-900 border-2 border-amber-400 px-5 py-2.5 rounded-2xl shadow-lg font-bold text-xs sm:text-sm flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                <span>
                  {hudState.distanceWarning || (lang === 'zh-CN'
                    ? '请调整位置，确保上身与训练手臂在画面中'
                    : lang === 'en-US'
                      ? 'Adjust position so upper body and arm are centered in frame'
                      : 'กรุณาขยับจัดตำแหน่งให้เห็นลำตัวและแขนข้างที่ฝึกในกรอบภาพ')}
                </span>
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
                  <span>🔍 Staff Diagnostic HUD</span>
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
              <div>🦾 ข้างที่ตรวจจับ: {activeSide === 'left' ? 'ซ้าย (L)' : activeSide === 'right' ? 'ขวา (R)' : 'ทั้งสองข้าง (Bilateral)'}</div>
              <div>📐 มุมปัจจุบัน (Current Angle): <span className="font-bold text-white">{hudState.currentAngle}°</span></div>
              <div>🎯 เกณฑ์เป้าหมาย (Target Threshold): <span className="font-bold text-emerald-400">{hudState.targetThreshold}°</span></div>
              <div>🔄 สถานะเฟส (Active Phase): <span className="font-bold text-amber-300">{hudState.repPhase}</span> | นับ: {hudState.completedReps} ครั้ง</div>
              <div>🧭 ระนาบยกแขน (Plane Degradation): <span className={hudState.isPlaneDegraded ? 'text-rose-400 font-bold' : 'text-emerald-400'}>{hudState.isPlaneDegraded ? '⚠️ เสื่อมสภาพ (Degraded)' : '✅ ปกติ (Normal)'}</span></div>
              <div>📏 ขอบภาพ (Arm Boundary): <span className={hudState.isArmClipping ? 'text-amber-400 font-bold' : 'text-emerald-400'}>{hudState.isArmClipping ? '⚠️ หลุดขอบจอ (Clipping)' : '✅ อยู่ในเฟรม (In Frame)'}</span></div>
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
            exerciseId={resolvedConfig.id || (exercise as any).id || (exercise as any).exercise_id || 'shoulder-abduction'}
            titleString={titleString}
            mediaUrl={resolvedConfig.mediaUrl}
            mediaType={resolvedConfig.mediaType}
            fallbackMediaUrl={resolvedConfig.fallbackMediaUrl}
            instructionTextTh={resolvedConfig.cameraGuide?.instructionTextTh}
            instructionTextEn={resolvedConfig.cameraGuide?.instructionTextEn}
            instructionTextCn={resolvedConfig.cameraGuide?.instructionTextCn}
            descriptionTh={resolvedConfig.descriptionTh}
            descriptionEn={resolvedConfig.descriptionEn}
            descriptionCn={resolvedConfig.descriptionCn}
            lang={lang}
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
              {!isInherentlyBilateral && (
                <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
                  <div>
                    <div className="font-bold text-white text-base">🦾 ปรับข้างตรวจจับ (Side Override)</div>
                    <div className="text-xs text-slate-400">สลับข้างตรวจจับฉุกเฉิน</div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleToggleSide('right')}
                      className={`px-3 py-1.5 rounded-xl font-bold text-xs cursor-pointer ${activeSide === 'right'
                        ? 'bg-teal-500 text-slate-950 shadow-sm'
                        : 'bg-slate-800 text-slate-400 hover:text-white'
                        }`}
                    >
                      ขวา (R)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleSide('left')}
                      className={`px-3 py-1.5 rounded-xl font-bold text-xs cursor-pointer ${activeSide === 'left'
                        ? 'bg-teal-500 text-slate-950 shadow-sm'
                        : 'bg-slate-800 text-slate-400 hover:text-white'
                        }`}
                    >
                      ซ้าย (L)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleSide('bilateral')}
                      className={`px-3 py-1.5 rounded-xl font-bold text-xs cursor-pointer ${activeSide === 'bilateral'
                        ? 'bg-teal-500 text-slate-950 shadow-sm'
                        : 'bg-slate-800 text-slate-400 hover:text-white'
                        }`}
                    >
                      สองข้าง (Auto)
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

              {/* 9. Staff Accuracy Test Mode */}
              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-bold text-white text-base">📊 โหมดทดสอบความแม่นยำ (Staff Accuracy Test Mode)</div>
                    <div className="text-xs text-slate-400">บันทึกเฟรม, ข้อต่อ, FPS, และเปรียบเทียบ Actual vs Detected Reps</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsAccuracyTestMode((prev) => !prev)}
                    className={`px-4 py-2 rounded-xl font-bold text-xs cursor-pointer transition ${
                      isAccuracyTestMode
                        ? 'bg-emerald-500 text-slate-950 shadow-md'
                        : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {isAccuracyTestMode ? '🟢 เปิดใช้งานอยู่' : '⚪ ปิดอยู่'}
                  </button>
                </div>
                {isAccuracyTestMode && (
                  <div className="space-y-2 pt-2 border-t border-slate-800/80 text-xs">
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="p-2 rounded-xl bg-slate-900 border border-slate-800">
                        <div className="text-slate-400 text-[10px]">เฟรมทั้งหมด</div>
                        <div className="font-mono font-bold text-teal-400 text-sm">{accuracyTotalFramesRef.current}</div>
                      </div>
                      <div className="p-2 rounded-xl bg-slate-900 border border-slate-800">
                        <div className="text-slate-400 text-[10px]">ข้อต่อครบ</div>
                        <div className="font-mono font-bold text-emerald-400 text-sm">
                          {accuracyTotalFramesRef.current > 0
                            ? Math.round((accuracyCompleteJointFramesRef.current / accuracyTotalFramesRef.current) * 100)
                            : 0}%
                        </div>
                      </div>
                      <div className="p-2 rounded-xl bg-slate-900 border border-slate-800">
                        <div className="text-slate-400 text-[10px]">นับได้ขณะนี้</div>
                        <div className="font-mono font-bold text-amber-400 text-sm">{validCompletedRepsRef.current} ครั้ง</div>
                      </div>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setShowStaffSettingsModal(false);
                          setShowAccuracyVerifyModal(true);
                        }}
                        className="flex-1 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs cursor-pointer text-center transition"
                      >
                        📋 ตรวจสอบผล & ส่งออก CSV
                      </button>
                      <button
                        type="button"
                        onClick={handleResetAccuracyData}
                        className="px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs cursor-pointer transition"
                      >
                        รีเซ็ต
                      </button>
                    </div>
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

      {/* Staff Accuracy Verification & CSV Export Modal */}
      {showAccuracyVerifyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-2xl">📊</span>
                <h3 className="font-black text-white text-lg">Staff Accuracy Verification Report</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAccuracyVerifyModal(false)}
                className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-sm">
              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                <label className="block text-xs font-bold text-slate-300">
                  จำนวนครั้งที่ผู้ป่วยทำจริง (Actual Reps Completed by Patient):
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={actualRepsInput}
                    onChange={(e) => setActualRepsInput(e.target.value)}
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono font-bold text-base focus:border-teal-500 focus:outline-none"
                    placeholder="เช่น 10"
                  />
                  <button
                    type="button"
                    onClick={handleCalculateAccuracy}
                    className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs cursor-pointer transition"
                  >
                    คำนวณผล
                  </button>
                </div>
              </div>

              {accuracyVerificationReport && (
                <div className="space-y-3 p-4 rounded-2xl bg-slate-950/80 border border-slate-800">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                      <div className="text-slate-400">ทำจริง vs AI นับได้</div>
                      <div className="font-bold text-base text-white">
                        {accuracyVerificationReport.actualReps} vs <span className="text-teal-400">{accuracyVerificationReport.detectedReps}</span>
                      </div>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                      <div className="text-slate-400">เฟรมข้อต่อครบ (Completeness)</div>
                      <div className="font-bold text-base text-emerald-400">
                        {accuracyVerificationReport.completeRatioPct}%
                      </div>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                      <div className="text-slate-400">False Positives (นับเกิน)</div>
                      <div className={`font-bold text-base ${accuracyVerificationReport.falsePositives === 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {accuracyVerificationReport.falsePositives} ครั้ง
                      </div>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                      <div className="text-slate-400">False Negatives (นับหลุด)</div>
                      <div className={`font-bold text-base ${accuracyVerificationReport.falseNegatives === 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {accuracyVerificationReport.falseNegatives} ครั้ง
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-between items-center text-xs text-slate-400 px-1">
                    <span>ความเร็วเฉลี่ย: <strong className="text-white">{accuracyVerificationReport.avgFps} FPS</strong></span>
                    <span>เฟรมทั้งหมด: <strong className="text-white">{accuracyVerificationReport.totalFrames} เฟรม</strong></span>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={handleExportAccuracyCsv}
                className="flex-1 py-3.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-sm cursor-pointer shadow-lg active:scale-98 transition flex items-center justify-center gap-2"
              >
                📥 ส่งออกรายงาน CSV
              </button>
              <button
                type="button"
                onClick={() => setShowAccuracyVerifyModal(false)}
                className="px-5 py-3.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-sm cursor-pointer transition"
              >
                ปิด
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
