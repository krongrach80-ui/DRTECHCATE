/**
 * packages/pose-engine/src/math/sessionProgressAndAccuracy.ts
 *
 * Pure mathematical helpers for:
 * 1. Exercise session progress percentage (single-set & multi-set)
 * 2. Live pose joint accuracy scoring, visibility filtering, EMA smoothing,
 *    and directional coaching hints.
 */

import type {
  BodySide,
  ExerciseDetectionConfig,
  LandmarkTriplet,
  PoseEngineLandmark,
} from '../types/exerciseConfig';
import { calculateAngle2D, calculateAngle3D, clamp } from './geometry3d';
import {
  ARM_LANDMARK_INDICES,
  MISSING_ARM_JOINT_MESSAGES_TH,
  VISIBILITY_THRESHOLD,
} from './armJointProcessor';

export const DEFAULT_ANGLE_TOLERANCE_DEG = 10;
export const DEFAULT_ANGLE_FALLOFF_DEG = 30;
export const MIN_JOINT_VISIBILITY = VISIBILITY_THRESHOLD;
export const ACCURACY_EMA_ALPHA = 0.3;
export const ACCURACY_UI_UPDATE_INTERVAL_MS = 100;
export const ACCURACY_LEVEL_HIGH = 90;
export const ACCURACY_LEVEL_MEDIUM = 70;
export const MIN_VECTOR_MAGNITUDE = 1e-6;

export type AccuracyLevel = 'high' | 'medium' | 'low' | 'none';

export interface MultiSetProgressSummary {
  doneReps: number;
  totalTargetReps: number;
  currentSetReps: number;
  repsPerSet: number;
  completedSets: number;
  totalSets: number;
  progressPercent: number;
  displayPercent: number;
  isCompleted: boolean;
}

export interface JointScoreDetail {
  key: string;
  side: 'left' | 'right';
  measuredAngle: number;
  targetAngle: number;
  errorDeg: number;
  toleranceDeg: number;
  falloffDeg: number;
  weight: number;
  score: number;
  hintTh: string | null;
}

export interface PoseAccuracyResult {
  score: number | null;
  displayPercent: number | null;
  hasValidJoints: boolean;
  level: AccuracyLevel;
  badgeTextTh: string;
  statusTextTh: string;
  worstJointHintTh: string | null;
  worstJointKey: string | null;
  missingJointHintTh: string | null;
  jointScores: JointScoreDetail[];
}

interface JointSpec {
  key: string;
  side: 'left' | 'right';
  triplet: LandmarkTriplet;
  targetMinDeg: number;
  targetMaxDeg: number;
  toleranceDeg: number;
  falloffDeg: number;
  weight: number;
  lowAngleHintTh?: string;
  highAngleHintTh?: string;
}

function toFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || typeof value === 'boolean') {
    return null;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

/**
 * Computes session progress percentage clamped to [0, 100].
 * Returns 0 when total <= 0, null, undefined, NaN, or non-finite.
 */
export function calcProgressPercent(done: unknown, total: unknown): number {
  const safeTotal = toFiniteNumber(total);
  const safeDone = toFiniteNumber(done);

  if (safeTotal === null || safeTotal <= 0 || safeDone === null || safeDone <= 0) {
    return 0;
  }

  return clamp((safeDone / safeTotal) * 100, 0, 100);
}

/**
 * Computes multi-set progress:
 * ((completedSets * repsPerSet + currentSetReps) / (totalSets * repsPerSet)) * 100
 */
export function calcMultiSetProgress(params: {
  completedSets: unknown;
  currentSetReps: unknown;
  totalSets: unknown;
  repsPerSet: unknown;
}): MultiSetProgressSummary {
  const rawTotalSets = toFiniteNumber(params.totalSets);
  const rawRepsPerSet = toFiniteNumber(params.repsPerSet);
  const safeTotalSets = rawTotalSets !== null && rawTotalSets > 0 ? Math.floor(rawTotalSets) : 0;
  const safeRepsPerSet = rawRepsPerSet !== null && rawRepsPerSet > 0 ? Math.floor(rawRepsPerSet) : 0;

  if (safeTotalSets <= 0 || safeRepsPerSet <= 0) {
    return {
      doneReps: 0,
      totalTargetReps: 0,
      currentSetReps: 0,
      repsPerSet: 0,
      completedSets: 0,
      totalSets: 0,
      progressPercent: 0,
      displayPercent: 0,
      isCompleted: false,
    };
  }

  const rawCompletedSets = toFiniteNumber(params.completedSets) ?? 0;
  const rawCurrentSetReps = toFiniteNumber(params.currentSetReps) ?? 0;

  const safeCompletedSets = clamp(Math.floor(rawCompletedSets), 0, safeTotalSets);
  const safeCurrentSetReps = clamp(Math.floor(rawCurrentSetReps), 0, safeRepsPerSet);
  const totalTargetReps = safeTotalSets * safeRepsPerSet;
  const doneReps = clamp(
    safeCompletedSets * safeRepsPerSet + safeCurrentSetReps,
    0,
    totalTargetReps
  );

  const progressPercent = calcProgressPercent(doneReps, totalTargetReps);
  const displayPercent = Math.round(progressPercent);

  return {
    doneReps,
    totalTargetReps,
    currentSetReps: safeCurrentSetReps,
    repsPerSet: safeRepsPerSet,
    completedSets: safeCompletedSets,
    totalSets: safeTotalSets,
    progressPercent,
    displayPercent,
    isCompleted: progressPercent >= 100,
  };
}

/**
 * Computes per-joint accuracy score in [0, 100]:
 * - error = |measuredAngle - targetAngle|
 * - error <= tolerance -> 100
 * - error > tolerance -> 100 * clamp(1 - (error - tolerance) / falloff, 0, 1)
 */
export function calcJointScore(
  measuredAngle: unknown,
  targetAngle: unknown,
  tolerance: unknown = DEFAULT_ANGLE_TOLERANCE_DEG,
  falloff: unknown = DEFAULT_ANGLE_FALLOFF_DEG
): number {
  const safeMeasured = toFiniteNumber(measuredAngle);
  const safeTarget = toFiniteNumber(targetAngle);
  if (safeMeasured === null || safeTarget === null) {
    return 0;
  }

  const rawTol = toFiniteNumber(tolerance);
  const rawFalloff = toFiniteNumber(falloff);
  const safeTol = rawTol !== null && rawTol >= 0 ? rawTol : DEFAULT_ANGLE_TOLERANCE_DEG;
  const safeFalloff =
    rawFalloff !== null && rawFalloff > 0 ? rawFalloff : DEFAULT_ANGLE_FALLOFF_DEG;

  const error = Math.abs(safeMeasured - safeTarget);
  if (error <= safeTol) {
    return 100;
  }

  return 100 * clamp(1 - (error - safeTol) / safeFalloff, 0, 1);
}

function isLandmarkReliable(
  lm: PoseEngineLandmark | undefined,
  use3D: boolean
): lm is PoseEngineLandmark {
  if (!lm) return false;
  if (!Number.isFinite(lm.x) || !Number.isFinite(lm.y)) return false;
  if (use3D && lm.z !== undefined && !Number.isFinite(lm.z)) return false;

  const vis = lm.visibility;
  if (vis !== undefined && (!Number.isFinite(vis) || vis < MIN_JOINT_VISIBILITY)) {
    return false;
  }

  const presence = lm.presence;
  if (presence !== undefined && (!Number.isFinite(presence) || presence < MIN_JOINT_VISIBILITY)) {
    return false;
  }

  return true;
}

function findMissingArmJointHintTh(
  landmarks: PoseEngineLandmark[],
  config: ExerciseDetectionConfig,
  sideOverride?: BodySide | string | null
): string | null {
  const isArmExercise =
    config.targetJoint === 'shoulder' ||
    config.targetJoint === 'elbow' ||
    config.targetJoint === 'wrist' ||
    config.framing === 'upper' ||
    config.framing === 'upper_body';

  if (!isArmExercise) {
    return null;
  }

  const sides = resolveSides(sideOverride ?? config.side ?? 'both');
  const jointOrder: Array<'shoulder' | 'elbow' | 'wrist'> = ['shoulder', 'elbow', 'wrist'];

  for (const side of sides) {
    const indices = ARM_LANDMARK_INDICES[side];
    for (const joint of jointOrder) {
      if (!isLandmarkReliable(landmarks[indices[joint]], false)) {
        return MISSING_ARM_JOINT_MESSAGES_TH[side][joint];
      }
    }
  }

  return null;
}

function hasNonZeroVectors(
  a: PoseEngineLandmark,
  v: PoseEngineLandmark,
  b: PoseEngineLandmark,
  use3D: boolean
): boolean {
  const uX = a.x - v.x;
  const uY = a.y - v.y;
  const uZ = use3D ? (a.z ?? 0) - (v.z ?? 0) : 0;
  const vX = b.x - v.x;
  const vY = b.y - v.y;
  const vZ = use3D ? (b.z ?? 0) - (v.z ?? 0) : 0;

  const magU = use3D ? Math.hypot(uX, uY, uZ) : Math.hypot(uX, uY);
  const magV = use3D ? Math.hypot(vX, vY, vZ) : Math.hypot(vX, vY);
  return magU >= MIN_VECTOR_MAGNITUDE && magV >= MIN_VECTOR_MAGNITUDE;
}

function resolveSides(side: BodySide | string | null | undefined): Array<'left' | 'right'> {
  if (side === 'left') return ['left'];
  if (side === 'right') return ['right'];
  return ['left', 'right'];
}

function buildDirectionalHintTh(spec: JointSpec, measuredAngle: number, targetAngle: number): string {
  const isBelowTarget = measuredAngle < targetAngle;
  if (isBelowTarget && spec.lowAngleHintTh) return spec.lowAngleHintTh;
  if (!isBelowTarget && spec.highAngleHintTh) return spec.highAngleHintTh;

  const vertex = spec.triplet.vertex;
  if (vertex === 11 || vertex === 12) {
    return isBelowTarget ? 'ยกแขนให้สูงขึ้นอีกเล็กน้อย' : 'ลดระดับแขนลงเล็กน้อย';
  }
  if (vertex === 13 || vertex === 14) {
    return isBelowTarget ? 'เหยียดข้อศอกออกอีกเล็กน้อย' : 'งอข้อศอกเข้าอีกเล็กน้อย';
  }
  if (vertex === 25 || vertex === 26) {
    return isBelowTarget ? 'เหยียดเข่าให้ตรงขึ้นอีกเล็กน้อย' : 'งอเข่าลงอีกเล็กน้อย';
  }
  if (vertex === 23 || vertex === 24) {
    return isBelowTarget ? 'ยืดสะโพกหรือลำตัวขึ้นอีกเล็กน้อย' : 'ก้มหรือพับสะโพกลงอีกเล็กน้อย';
  }
  if (vertex === 0 || vertex === 7 || vertex === 8) {
    return isBelowTarget ? 'ตั้งศีรษะและคอให้ตรงขึ้นเล็กน้อย' : 'เอียงหรือก้มศีรษะกลับมาในมุมเป้าหมาย';
  }

  return isBelowTarget ? 'เพิ่มมุมการเคลื่อนไหวอีกเล็กน้อย' : 'ลดมุมการเคลื่อนไหวลงเล็กน้อย';
}

function buildFallbackJointSpecs(
  config: ExerciseDetectionConfig,
  sides: Array<'left' | 'right'>
): JointSpec[] {
  const evalMode = config.evaluationMode;
  const targetJoint = config.targetJoint;

  const makeSpec = (
    side: 'left' | 'right',
    triplet: LandmarkTriplet,
    targetMinDeg: number,
    targetMaxDeg: number
  ): JointSpec => ({
    key: `${side}_${triplet.vertex}`,
    side,
    triplet,
    targetMinDeg,
    targetMaxDeg,
    toleranceDeg: DEFAULT_ANGLE_TOLERANCE_DEG,
    falloffDeg: DEFAULT_ANGLE_FALLOFF_DEG,
    weight: triplet.weight ?? 1,
    lowAngleHintTh: triplet.lowAngleHintTh,
    highAngleHintTh: triplet.highAngleHintTh,
  });

  if (evalMode === 'heel_raise' || evalMode === 'hold_balance' || targetJoint === 'ankle' || targetJoint === 'balance') {
    return sides.map((side) =>
      makeSpec(
        side,
        side === 'left'
          ? { pointA: 23, vertex: 25, pointB: 27 }
          : { pointA: 24, vertex: 26, pointB: 28 },
        165,
        180
      )
    );
  }

  if (targetJoint === 'wrist') {
    return sides.map((side) =>
      makeSpec(
        side,
        side === 'left'
          ? { pointA: 13, vertex: 15, pointB: 19 }
          : { pointA: 14, vertex: 16, pointB: 20 },
        150,
        180
      )
    );
  }

  if (evalMode === 'neck_tilt' || targetJoint === 'neck') {
    return sides.map((side) =>
      makeSpec(
        side,
        side === 'left'
          ? { pointA: 7, vertex: 11, pointB: 23 }
          : { pointA: 8, vertex: 12, pointB: 24 },
        165,
        180
      )
    );
  }

  // Upper-body / pendulum / timer stretch default
  return sides.map((side) =>
    makeSpec(
      side,
      side === 'left'
        ? { pointA: 23, vertex: 11, pointB: 13 }
        : { pointA: 24, vertex: 12, pointB: 14 },
      config.id === 'shoulder-pendulum' ? 20 : 15,
      config.id === 'shoulder-pendulum' ? 60 : 45
    )
  );
}

function buildJointSpecs(
  config: ExerciseDetectionConfig,
  sideOverride?: BodySide | string | null
): JointSpec[] {
  const effectiveSide = sideOverride ?? config.side ?? 'both';
  const sides = resolveSides(effectiveSide);

  if (config.angleMechanics) {
    const am = config.angleMechanics;
    const tol =
      typeof am.toleranceDeg === 'number' && Number.isFinite(am.toleranceDeg) && am.toleranceDeg >= 0
        ? am.toleranceDeg
        : DEFAULT_ANGLE_TOLERANCE_DEG;
    const fo =
      typeof am.falloffDeg === 'number' && Number.isFinite(am.falloffDeg) && am.falloffDeg > 0
        ? am.falloffDeg
        : DEFAULT_ANGLE_FALLOFF_DEG;
    const defaultWeight =
      typeof am.weight === 'number' && Number.isFinite(am.weight) && am.weight > 0
        ? am.weight
        : 1;

    return sides.map((side) => {
      const triplet = side === 'left' ? am.landmarks.left : am.landmarks.right;
      const weight =
        typeof triplet.weight === 'number' && Number.isFinite(triplet.weight) && triplet.weight > 0
          ? triplet.weight
          : defaultWeight;

      return {
        key: `${side}_${triplet.vertex}`,
        side,
        triplet,
        targetMinDeg: am.targetMinDeg,
        targetMaxDeg:
          typeof am.targetMaxDeg === 'number' && Number.isFinite(am.targetMaxDeg)
            ? am.targetMaxDeg
            : am.targetMinDeg,
        toleranceDeg: tol,
        falloffDeg: fo,
        weight,
        lowAngleHintTh: triplet.lowAngleHintTh ?? am.lowAngleHintTh,
        highAngleHintTh: triplet.highAngleHintTh ?? am.highAngleHintTh,
      };
    });
  }

  return buildFallbackJointSpecs(config, sides);
}

/**
 * Calculates real-time weighted pose accuracy across configured joints.
 * Skips joints whose landmarks have visibility < MIN_JOINT_VISIBILITY (0.5) or zero-length vectors.
 * Returns { score: null, hasValidJoints: false, statusTextTh: 'ไม่พบท่าทาง ขยับให้เห็นทั้งตัว' } when
 * no reliable joints are present (never returns 0% when nobody is detected).
 */
export function calcPoseAccuracy(
  landmarks: PoseEngineLandmark[] | null | undefined,
  config: ExerciseDetectionConfig | null | undefined,
  sideOverride?: BodySide | string | null
): PoseAccuracyResult {
  if (!landmarks || landmarks.length === 0 || !config) {
    return {
      score: null,
      displayPercent: null,
      hasValidJoints: false,
      level: 'none',
      badgeTextTh: 'ไม่พบท่าทาง',
      statusTextTh: 'ไม่พบท่าทาง ขยับให้เห็นทั้งตัว',
      worstJointHintTh: null,
      worstJointKey: null,
      missingJointHintTh: null,
      jointScores: [],
    };
  }

  const missingJointHintTh = findMissingArmJointHintTh(landmarks, config, sideOverride);

  const specs = buildJointSpecs(config, sideOverride);
  const jointScores: JointScoreDetail[] = [];

  for (const spec of specs) {
    const { pointA, vertex, pointB, use3DWorld } = spec.triplet;
    const use3D = Boolean(use3DWorld);

    const lmA = landmarks[pointA];
    const lmV = landmarks[vertex];
    const lmB = landmarks[pointB];

    if (!isLandmarkReliable(lmA, use3D) || !isLandmarkReliable(lmV, use3D) || !isLandmarkReliable(lmB, use3D)) {
      continue;
    }

    if (!hasNonZeroVectors(lmA, lmV, lmB, use3D)) {
      continue;
    }

    const measuredAngle = use3D
      ? calculateAngle3D(lmA, lmV, lmB)
      : calculateAngle2D(lmA, lmV, lmB);

    if (!Number.isFinite(measuredAngle)) {
      continue;
    }

    const minT = Math.min(spec.targetMinDeg, spec.targetMaxDeg);
    const maxT = Math.max(spec.targetMinDeg, spec.targetMaxDeg);
    const effectiveTarget = clamp(measuredAngle, minT, maxT);

    const jointScore = calcJointScore(
      measuredAngle,
      effectiveTarget,
      spec.toleranceDeg,
      spec.falloffDeg
    );

    const errorDeg = Math.abs(measuredAngle - effectiveTarget);
    const hintTh =
      jointScore < ACCURACY_LEVEL_HIGH || errorDeg > spec.toleranceDeg
        ? buildDirectionalHintTh(spec, measuredAngle, effectiveTarget)
        : null;

    jointScores.push({
      key: spec.key,
      side: spec.side,
      measuredAngle,
      targetAngle: effectiveTarget,
      errorDeg,
      toleranceDeg: spec.toleranceDeg,
      falloffDeg: spec.falloffDeg,
      weight: spec.weight,
      score: jointScore,
      hintTh,
    });
  }

  if (jointScores.length === 0) {
    return {
      score: null,
      displayPercent: null,
      hasValidJoints: false,
      level: 'none',
      badgeTextTh: 'ไม่พบท่าทาง',
      statusTextTh: 'ไม่พบท่าทาง ขยับให้เห็นทั้งตัว',
      worstJointHintTh: null,
      worstJointKey: null,
      missingJointHintTh,
      jointScores: [],
    };
  }

  let weightedSum = 0;
  let totalWeight = 0;
  let worstJoint: JointScoreDetail | null = null;

  for (const js of jointScores) {
    weightedSum += js.score * js.weight;
    totalWeight += js.weight;
    if (!worstJoint || js.score < worstJoint.score || (js.score === worstJoint.score && js.errorDeg > worstJoint.errorDeg)) {
      worstJoint = js;
    }
  }

  const score = totalWeight > 0 ? clamp(weightedSum / totalWeight, 0, 100) : 0;
  const displayPercent = Math.round(score);

  let level: AccuracyLevel = 'low';
  let badgeTextTh = 'ควรปรับท่า';
  if (score >= ACCURACY_LEVEL_HIGH) {
    level = 'high';
    badgeTextTh = 'ดีมาก';
  } else if (score >= ACCURACY_LEVEL_MEDIUM) {
    level = 'medium';
    badgeTextTh = 'ปานกลาง';
  }

  const needsHint = score < ACCURACY_LEVEL_HIGH && worstJoint !== null && worstJoint.hintTh !== null;

  return {
    score,
    displayPercent,
    hasValidJoints: true,
    level,
    badgeTextTh,
    statusTextTh: badgeTextTh,
    worstJointHintTh: needsHint && worstJoint ? worstJoint.hintTh : null,
    worstJointKey: needsHint && worstJoint ? worstJoint.key : null,
    missingJointHintTh,
    jointScores,
  };
}

/**
 * Exponential Moving Average (EMA) smoother for displayed live accuracy.
 * Returns null immediately if rawScore is null or non-finite.
 */
export function updateSmoothedAccuracyEma(
  prevSmoothed: number | null,
  rawScore: number | null,
  alpha: number = ACCURACY_EMA_ALPHA
): number | null {
  if (rawScore === null || !Number.isFinite(rawScore)) {
    return null;
  }
  const safeRaw = clamp(rawScore, 0, 100);
  if (prevSmoothed === null || !Number.isFinite(prevSmoothed)) {
    return safeRaw;
  }
  const safeAlpha = clamp(Number.isFinite(alpha) ? alpha : ACCURACY_EMA_ALPHA, 0.01, 1);
  return clamp(safeAlpha * safeRaw + (1 - safeAlpha) * prevSmoothed, 0, 100);
}

