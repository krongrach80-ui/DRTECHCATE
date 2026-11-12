/**
 * packages/pose-engine/src/types/exerciseConfig.ts
 *
 * DRTECH.CARE DYNAMIC AI BIOMECHANICAL EXERCISE SPECIFICATION & CONFIG SCHEMA
 * Supports both standard joint angle tracking ('angle_rep_hold') and
 * circular trajectory kinematics ('pendulum_circular' - Shoulder Pendulum).
 */

export type EvaluationMode =
  | 'angle_rep_hold'
  | 'pendulum_circular'
  | 'neck_tilt'
  | 'heel_raise'
  | 'hold_balance'
  | 'timer';

export type BodySide = 'left' | 'right' | 'bilateral';

export type TargetJoint =
  | 'shoulder'
  | 'scapula'
  | 'elbow'
  | 'wrist'
  | 'hip'
  | 'knee'
  | 'ankle'
  | 'neck'
  | 'trunk'
  | 'balance';

export type CameraViewOrientation = 'front' | 'side_45' | 'side_90';

export type FramingRequirement =
  | 'head_shoulders'
  | 'upper_body'
  | 'lower_body'
  | 'full_body'
  | 'upper'
  | 'full';

export type AngleDirection = 'increase' | 'decrease';

export interface CameraGuideConfig {
  recommendedView: CameraViewOrientation;
  recommendedDistanceMeters: [number, number]; // e.g. [1.5, 2.5]
  instructionTextTh: string;
  instructionTextEn?: string;
  instructionTextCn?: string;
}

export interface LandmarkTriplet {
  pointA: number;      // MediaPipe landmark index (e.g. 11 Left Shoulder)
  vertex: number;      // Center joint landmark index (e.g. 13 Left Elbow)
  pointB: number;      // Endpoint landmark index (e.g. 15 Left Wrist)
  use3DWorld?: boolean;
}

export interface AngleMechanicsConfig {
  landmarks: {
    left: LandmarkTriplet;
    right: LandmarkTriplet;
  };
  startAngleDeg: number;       // e.g. 15° or 150° (resting position)
  targetMinDeg: number;        // e.g. 80° (effective clinical range lower bound)
  targetMaxDeg: number;        // e.g. 100° (effective clinical range upper bound)
  toleranceDeg: number;        // e.g. 10°
  holdDurationSec: number;     // e.g. 2.0s
  direction?: AngleDirection;  // 'increase' (default) or 'decrease'
}

export interface PendulumMechanicsConfig {
  minTrunkForwardTiltDeg: number;   // default: 18°
  maxTrunkForwardTiltDeg: number;   // default: 65°
  minElbowStraightnessDeg: number;  // default: 145° (relaxed arm straightness)
  minCircleRadiusRatio: number;     // default: 0.07 (relative to total arm length)
  maxCircleRadiusRatio: number;     // default: 0.35
  minCycleDurationSec: number;      // default: 1.2s
  maxCycleDurationSec: number;      // default: 5.0s
}

export interface PrescriptionConfig {
  repsPerSet: number;
  totalSets: number;
  restBetweenSetsSec: number;
  holdDurationSec?: number;
  durationSec?: number;
  targetMinDeg?: number; // Clinical prescription ROM override
}

export type CompensationType =
  | 'trunk_lean'
  | 'trunk_lateral_flexion'
  | 'scapular_hiking'
  | 'shoulder_shrug'
  | 'elbow_flexion'
  | 'excessive_speed'
  | 'tempo_violation'
  | 'wrong_side';

export interface CompensationRule {
  ruleId: string;
  type: CompensationType;
  thresholdValue: number;
  warningMessageTh: string;
  warningMessageEn?: string;
  warningMessageCn?: string;
  severity: 'warning' | 'error';
}

export interface SafetyContraindications {
  stopOnPainMessageTh: string;
  stopOnPainMessageEn?: string;
  stopOnPainMessageCn?: string;
  maxSafeAngleCapDeg: number; // Hard ceiling beyond which engine instructs patient to lower arm
  maxSafeVelocityDegPerSec?: number; // Angular velocity cap (e.g. 180°/s) to prevent uncontrolled joint jerking
  minTempoDurationSec?: number;      // Minimum tempo duration for a clean concentric/eccentric rep
}

export interface ElevationPlaneConfig {
  requiredPlane: 'flexion' | 'abduction';
  targetMinDeg: number; // e.g. 60 for flexion, -30 for abduction
  targetMaxDeg: number; // e.g. 120 for flexion, 30 for abduction
  scaptionMinDeg?: number; // default 30.0
  scaptionMaxDeg?: number; // default 60.0
  minElevationDegToEnforce?: number; // default 30.0 (only enforce when arm is raised past resting position)
  framesAvgCount?: number; // default 4 (moving window averaging)
  warningMessageTh: string;
  warningMessageEn?: string;
  warningMessageCn?: string;
  scaptionCueTh?: string;
  scaptionCueEn?: string;
  scaptionCueCn?: string;
}

/**
 * Biomechanical Form Gate Configuration
 * Enforces anatomical prerequisites before a repetition can enter or complete the target zone.
 */
export interface FormGateConfig {
  /**
   * Minimum elbow extension angle (degrees) required for valid arm elevation.
   * Prevents counting reps when the elbow is bent/folded.
   * [ต้องให้นักกายภาพตรวจสอบ]
   */
  minElbowExtensionDeg?: number;

  /**
   * Minimum normalized distance between left and right wrists.
   * Prevents counting when fists/wrists are crossed or clamped together in front of body.
   * [ต้องให้นักกายภาพตรวจสอบ]
   */
  minWristSeparationNorm?: number;

  /**
   * Minimum landmark visibility required for active arm keypoints (shoulder, elbow, wrist).
   */
  minLandmarkVisibility?: number;

  /**
   * Disallow excessive scapular elevation (hiking) during movement.
   */
  disallowScapularHiking?: boolean;

  /**
   * Maximum allowed trunk lean (degrees) before form gate rejects the rep.
   */
  maxTrunkLeanDeg?: number;

  /**
   * Maximum allowed lateral distance (normalized) between active elbow and shoulder.
   * Prevents chicken-wing flare or arm drift during elbow flexion/extension.
   * [ต้องให้นักกายภาพตรวจสอบ]
   */
  elbowDriftTolerance?: number;

  /**
   * Disallow repetitions when active arm landmarks clip camera boundary.
   */
  disallowOutOfFrame?: boolean;

  // Localized Coaching Cues (TH / EN / CN)
  elbowBentCueTh?: string;
  elbowBentCueEn?: string;
  elbowBentCueCn?: string;

  wristCrossedCueTh?: string;
  wristCrossedCueEn?: string;
  wristCrossedCueCn?: string;

  scapularHikingCueTh?: string;
  scapularHikingCueEn?: string;
  scapularHikingCueCn?: string;

  missingArmCueTh?: string;
  missingArmCueEn?: string;
  missingArmCueCn?: string;

  elbowDriftCueTh?: string;
  elbowDriftCueEn?: string;
  elbowDriftCueCn?: string;

  incompleteFlexionCueTh?: string;
  incompleteFlexionCueEn?: string;
  incompleteFlexionCueCn?: string;

  incompleteExtensionCueTh?: string;
  incompleteExtensionCueEn?: string;
  incompleteExtensionCueCn?: string;
}

export interface ExerciseDetectionConfig {
  id?: string;
  exerciseId?: string;
  nameTh: string;
  nameEn: string;
  nameCn?: string;
  description?: string;
  descriptionTh?: string;
  descriptionEn?: string;
  descriptionCn?: string;
  mode?: 'camera' | 'timer';
  clinicalSource?: string;
  clinicalDisclaimerTh?: string;
  defaultSets?: number;
  defaultReps?: number;
  defaultHoldSec?: number;
  defaultDurationSec?: number;
  framing?: FramingRequirement;
  camera_framing?: FramingRequirement;
  is_active?: boolean;
  calibration_notes?: string;
  mediaUrl?: string;
  mediaType?: 'svg' | 'image' | 'video';
  fallbackMediaUrl?: string;
  targetMinDegOverride?: number; // Clinical prescription override
  evaluationMode: EvaluationMode;
  side: BodySide;
  targetJoint: TargetJoint;
  cameraGuide: CameraGuideConfig;
  angleMechanics?: AngleMechanicsConfig;
  pendulumMechanics?: PendulumMechanicsConfig;
  defaultPrescription: PrescriptionConfig;
  compensationRules: CompensationRule[];
  safetyContraindications: SafetyContraindications;
  maxSafeVelocityDegPerSec?: number; // Shortcut or per-exercise velocity ceiling
  requiredLandmarks?: {
    right: number[];
    left: number[];
    bilateral?: number[];
  };
  minLandmarkVisibility?: Record<number, number>;
  coachingCues?: ExerciseCoachingCues;
  elevationPlane?: ElevationPlaneConfig;
  formGate?: FormGateConfig;
}

/**
 * Per-exercise real-time visual and text coaching cues across movement phases
 */
export interface ExerciseCoachingCues {
  idleMessageTh?: string;
  idleMessageEn?: string;
  idleMessageCn?: string;
  idleIcon?: string;

  movingMessageTh?: string;
  movingMessageEn?: string;
  movingMessageCn?: string;
  movingIcon?: string;

  holdingMessageTh?: string;
  holdingMessageEn?: string;
  holdingMessageCn?: string;
  holdingIcon?: string;

  returningMessageTh?: string;
  returningMessageEn?: string;
  returningMessageCn?: string;
  returningIcon?: string;

  framingMessageTh?: string;
  framingMessageEn?: string;
  framingMessageCn?: string;

  targetKeypoints?: number[];
}

export type ExerciseConfig = ExerciseDetectionConfig;

/**
 * Standard MediaPipe Pose Landmark Point
 */
export interface PoseEngineLandmark {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
  presence?: number;
}

/**
 * Rep Evaluation Runtime State
 */
export type RepPhase =
  | 'IDLE'
  | 'WAITING_FOR_FRAMING'
  | 'MOVING_TO_TARGET'
  | 'HOLDING_TARGET'
  | 'RETURNING_TO_START'
  | 'REP_COMPLETED'
  | 'PAUSED';

export interface ActiveCompensationWarning {
  ruleId: string;
  type: CompensationType;
  messageTh: string;
  messageEn?: string;
  messageCn?: string;
  severity: 'warning' | 'error';
  currentValue: number;
  thresholdValue: number;
}

export interface RepEvaluationResult {
  phase: RepPhase;
  currentAngleDeg: number;
  targetAngleDeg: number;
  accuracyPercent?: number; // 0 to 100
  accuracyPct?: number; // Alias for accuracyPercent (0 to 100)
  severity?: 'good' | 'warning' | 'error'; // Alias for formRating
  holdProgressRatio: number; // 0.0 to 1.0 during HOLDING_TARGET
  pendulumCircleProgressRatio: number; // 0.0 to 1.0 during 360° phase rotation
  isInsideTargetZone: boolean;
  isExceedingSafetyCap: boolean;
  completedReps: number;
  incorrectReps: number;
  targetReps: number;
  currentSet: number;
  totalSets: number;
  isSetCompleted: boolean;
  isExerciseCompleted: boolean;
  coachingMessage?: string;
  coachingMessageTh: string;
  coachingMessageEn?: string;
  coachingMessageCn?: string;
  activeWarnings: ActiveCompensationWarning[];
  formRating: 'good' | 'warning' | 'error';
  instantaneousVelocity: number;
  angularVelocityDegPerSec?: number;
  trunkLateralTiltDeg?: number;
  scapularHikingRatio?: number;
  isRepRejected?: boolean;
  repRejectionReasonTh?: string;
  isOccluded?: boolean;
  occlusionReasonTh?: string;
  elevationPlaneDeg?: number;
  isPlaneDegraded?: boolean;
  isSubjectLocked?: boolean;
  isArmAmbiguous?: boolean;
  ambiguousReasonTh?: string;
  ambiguousJoints?: number[];
  isArmClipping?: boolean;
  isFrameDropped?: boolean;
  frameDropReason?: string;
  readinessStatus?:
    | 'ready'
    | 'optimal'
    | 'too_close_missing_arm'
    | 'too_far'
    | 'waiting_for_framing'
    | 'missing_shoulder'
    | 'missing_arm_landmarks'
    | 'missing_lower_body'
    | 'missing_head_shoulders'
    | 'missing_full_body'
    | 'partial_upper_body';
  blockingReason?: string;
  distanceStatus?: string;
  shoulderWidthRatio?: number;
  normalizedSignal?: number;
  hysteresisState?:
    | 'IDLE'
    | 'NEUTRAL'
    | 'EXTREME_A'
    | 'EXTREME_B'
    | 'CROSS_NEUTRAL'
    | 'RETURN_NEUTRAL';
  backlightDetected?: boolean;
  calibratedThreshold?: number;
  activeRequiredLandmarks?: number[];
  missingRequiredLandmarks?: number[];
  filteredLandmarks: PoseEngineLandmark[];
}

export interface ExerciseSessionTelemetry {
  exerciseId: string;
  exerciseName: string;
  patientId: string;
  totalRepsTarget: number;
  completedReps: number;
  incorrectReps: number;
  totalSetsCompleted: number;
  maxAngleAchievedDeg: number;
  averageAngleDeg: number;
  averageHoldDurationSec: number;
  consistencyScorePercent: number; // 0 to 100
  compensationEventsCount: number;
  scapularHikingRate?: number;
  trunkCompensationIndex?: number;
  averageVelocityDegPerSec?: number;
  completionMode: 'ai_verified' | 'skipped_unverified' | 'stopped_pain';
  painReported: boolean;
  sessionDurationSec: number;
  timestamp: string;
  idempotencyKey?: string;
}
