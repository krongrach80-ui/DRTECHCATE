/**
 * packages/pose-engine/src/types/exerciseConfig.ts
 *
 * DRTECH.CARE DYNAMIC AI BIOMECHANICAL EXERCISE SPECIFICATION & CONFIG SCHEMA
 * Supports both standard joint angle tracking ('angle_rep_hold') and
 * circular trajectory kinematics ('pendulum_circular' - Shoulder Pendulum).
 */

export type EvaluationMode = 'angle_rep_hold' | 'pendulum_circular';

export type BodySide = 'left' | 'right' | 'bilateral';

export type TargetJoint =
  | 'shoulder'
  | 'elbow'
  | 'wrist'
  | 'hip'
  | 'knee'
  | 'ankle'
  | 'neck'
  | 'trunk';

export type CameraViewOrientation = 'front' | 'side_45' | 'side_90';

export interface CameraGuideConfig {
  recommendedView: CameraViewOrientation;
  recommendedDistanceMeters: [number, number]; // e.g. [1.5, 2.5]
  instructionTextTh: string;
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
  startAngleDeg: number;       // e.g. 15° (resting position)
  targetMinDeg: number;        // e.g. 80° (effective clinical range lower bound)
  targetMaxDeg: number;        // e.g. 100° (effective clinical range upper bound)
  toleranceDeg: number;        // e.g. 10°
  holdDurationSec: number;     // e.g. 2.0s
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
}

export type CompensationType =
  | 'trunk_lean'
  | 'trunk_lateral_flexion'
  | 'scapular_hiking'
  | 'shoulder_shrug'
  | 'elbow_flexion'
  | 'excessive_speed'
  | 'tempo_violation';

export interface CompensationRule {
  ruleId: string;
  type: CompensationType;
  thresholdValue: number;
  warningMessageTh: string;
  severity: 'warning' | 'error';
}

export interface SafetyContraindications {
  stopOnPainMessageTh: string;
  maxSafeAngleCapDeg: number; // Hard ceiling beyond which engine instructs patient to lower arm
  maxSafeVelocityDegPerSec?: number; // Angular velocity cap (e.g. 180°/s) to prevent uncontrolled joint jerking
  minTempoDurationSec?: number;      // Minimum tempo duration for a clean concentric/eccentric rep
}

export interface ExerciseDetectionConfig {
  id?: string;
  exerciseId?: string;
  nameTh: string;
  nameEn: string;
  description?: string;
  mediaUrl?: string;
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
}

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
  | 'MOVING_TO_TARGET'
  | 'HOLDING_TARGET'
  | 'RETURNING_TO_START'
  | 'REP_COMPLETED'
  | 'PAUSED';

export interface ActiveCompensationWarning {
  ruleId: string;
  type: CompensationType;
  messageTh: string;
  severity: 'warning' | 'error';
  currentValue: number;
  thresholdValue: number;
}

export interface RepEvaluationResult {
  phase: RepPhase;
  currentAngleDeg: number;
  targetAngleDeg: number;
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
  coachingMessageTh: string;
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
  isSubjectLocked?: boolean;
  isFrameDropped?: boolean;
  frameDropReason?: string;
  readinessStatus?: 'ready' | 'missing_shoulder' | 'missing_arm_landmarks';
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
