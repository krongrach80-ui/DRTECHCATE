/**
 * packages/pose-engine/src/math/armJointProcessor.ts
 *
 * Clinical-grade arm, elbow (13/14), and wrist (15/16) pose processor:
 * 1. Filters landmarks by visibility & presence >= VISIBILITY_THRESHOLD (0.5).
 * 2. Returns null (never 0 or NaN) when any required joint is missing/unconfident.
 * 3. Smooths joint angles per side (left/right) with a 5-frame moving window,
 *    resetting immediately on null or exercise switch.
 * 4. Debounces missing-joint Thai coaching cues past MIN_STABLE_FRAMES (3) frames.
 * 5. Requires MIN_STABLE_FRAMES consecutive valid frames in target/return zones
 *    and resets mid-rep stability counters if elbow or wrist drops out.
 */

import type { PoseEngineLandmark } from '../types/exerciseConfig';
import { clamp } from './geometry3d';

export const VISIBILITY_THRESHOLD = 0.5;
export const SMOOTHING_WINDOW = 5;
export const MIN_STABLE_FRAMES = 3;
const MIN_VECTOR_MAGNITUDE = 1e-6;

export type ArmSide = 'left' | 'right';
export type ArmJointName = 'shoulder' | 'elbow' | 'wrist';
export type ArmJointType = 'shoulder' | 'elbow' | 'wrist';

export const ARM_LANDMARK_INDICES = {
  left: {
    shoulder: 11,
    elbow: 13,
    wrist: 15,
    index: 19,
    hip: 23,
  },
  right: {
    shoulder: 12,
    elbow: 14,
    wrist: 16,
    index: 20,
    hip: 24,
  },
} as const;

export const MISSING_ARM_JOINT_MESSAGES_TH: Record<ArmSide, Record<ArmJointName, string>> = {
  left: {
    shoulder: 'มองไม่เห็นหัวไหล่ซ้าย ลองขยับตัวให้อยู่กลางกรอบกล้อง',
    elbow: 'มองไม่เห็นข้อศอกซ้าย ลองถอยออกมาหรือยกแขนให้อยู่ในกรอบ',
    wrist: 'มองไม่เห็นข้อมือซ้าย ลองหันลำตัวเข้าหากล้อง',
  },
  right: {
    shoulder: 'มองไม่เห็นหัวไหล่ขวา ลองขยับตัวให้อยู่กลางกรอบกล้อง',
    elbow: 'มองไม่เห็นข้อศอกขวา ลองถอยออกมาหรือยกแขนให้อยู่ในกรอบ',
    wrist: 'มองไม่เห็นข้อมือขวา ลองหันลำตัวเข้าหากล้อง',
  },
};

export interface LandmarkConfidenceOptions {
  minConfidence?: number;
  use3D?: boolean;
}

export interface ArmAngleOptions extends LandmarkConfidenceOptions {
  requireFullArmChain?: boolean;
}

export interface MissingJointEvaluation {
  missingJoints: ArmJointName[];
  reportedMissingJoint: ArmJointName | null;
  coachingMessageTh: string | null;
  consecutiveMissingFrames: Record<ArmJointName, number>;
}

export interface ArmPoseProcessorConfig {
  side: ArmSide;
  jointType?: ArmJointType;
  targetMinDeg: number;
  targetMaxDeg?: number;
  returnThresholdDeg?: number;
  direction?: 'increase' | 'decrease';
  visibilityThreshold?: number;
  smoothingWindow?: number;
  minStableFrames?: number;
  use3D?: boolean;
}

export interface ArmPoseFrameResult {
  side: ArmSide;
  jointType: ArmJointType;
  rawAngleDeg: number | null;
  smoothedAngleDeg: number | null;
  hasCompleteArm: boolean;
  isInsideTargetZone: boolean;
  isTargetReached: boolean;
  repCounted: boolean;
  completedReps: number;
  stableTargetFrames: number;
  stableReturnFrames: number;
  missingJoints: ArmJointName[];
  reportedMissingJoint: ArmJointName | null;
  coachingMessageTh: string | null;
}

/**
 * Checks whether a MediaPipe pose landmark has valid finite coordinates and meets
 * visibility (and optional presence) confidence >= threshold.
 */
export function isLandmarkConfident(
  lm: PoseEngineLandmark | null | undefined,
  options: LandmarkConfidenceOptions = {}
): lm is PoseEngineLandmark {
  if (!lm) return false;
  const threshold = options.minConfidence ?? VISIBILITY_THRESHOLD;
  const use3D = Boolean(options.use3D);

  if (!Number.isFinite(lm.x) || !Number.isFinite(lm.y)) {
    return false;
  }
  if (use3D && (lm.z === undefined || !Number.isFinite(lm.z))) {
    return false;
  }

  const vis = lm.visibility;
  if (vis === undefined) {
    return false;
  }
  if (!Number.isFinite(vis) || vis < threshold) {
    return false;
  }

  if (lm.presence !== undefined) {
    if (!Number.isFinite(lm.presence) || lm.presence < threshold) {
      return false;
    }
  }

  return true;
}

/**
 * Computes joint angle in degrees [0, 180] from (pointA -> vertex -> pointB)
 * ONLY if all 3 points are confident and form non-zero vectors.
 * Returns null (never 0 or NaN) when any point is missing, invalid, or low-confidence.
 */
export function calculateVisibleJointAngle(
  pointA: PoseEngineLandmark | null | undefined,
  vertex: PoseEngineLandmark | null | undefined,
  pointB: PoseEngineLandmark | null | undefined,
  options: LandmarkConfidenceOptions = {}
): number | null {
  if (
    !isLandmarkConfident(pointA, options) ||
    !isLandmarkConfident(vertex, options) ||
    !isLandmarkConfident(pointB, options)
  ) {
    return null;
  }

  const use3D = Boolean(options.use3D);
  const uX = pointA.x - vertex.x;
  const uY = pointA.y - vertex.y;
  const uZ = use3D ? (pointA.z ?? 0) - (vertex.z ?? 0) : 0;

  const vX = pointB.x - vertex.x;
  const vY = pointB.y - vertex.y;
  const vZ = use3D ? (pointB.z ?? 0) - (vertex.z ?? 0) : 0;

  const magU = use3D ? Math.hypot(uX, uY, uZ) : Math.hypot(uX, uY);
  const magV = use3D ? Math.hypot(vX, vY, vZ) : Math.hypot(vX, vY);

  if (
    !Number.isFinite(magU) ||
    !Number.isFinite(magV) ||
    magU < MIN_VECTOR_MAGNITUDE ||
    magV < MIN_VECTOR_MAGNITUDE
  ) {
    return null;
  }

  const dot = uX * vX + uY * vY + uZ * vZ;
  const cosTheta = clamp(dot / (magU * magV), -1.0, 1.0);
  const deg = (Math.acos(cosTheta) * 180.0) / Math.PI;
  return Number.isFinite(deg) ? deg : null;
}

/**
 * Returns which arm joints (shoulder, elbow, wrist) are missing or unconfident on the given side.
 */
export function getMissingArmJoints(
  landmarks: readonly PoseEngineLandmark[] | null | undefined,
  side: ArmSide,
  minConfidence: number = VISIBILITY_THRESHOLD
): ArmJointName[] {
  if (!Array.isArray(landmarks) || landmarks.length === 0) {
    return ['shoulder', 'elbow', 'wrist'];
  }

  const indices = ARM_LANDMARK_INDICES[side];
  const missing: ArmJointName[] = [];

  if (!isLandmarkConfident(landmarks[indices.shoulder], { minConfidence })) {
    missing.push('shoulder');
  }
  if (!isLandmarkConfident(landmarks[indices.elbow], { minConfidence })) {
    missing.push('elbow');
  }
  if (!isLandmarkConfident(landmarks[indices.wrist], { minConfidence })) {
    missing.push('wrist');
  }

  return missing;
}

/**
 * Calculates the requested arm joint angle ('elbow' | 'shoulder' | 'wrist') on left or right side.
 * Returns null immediately when landmarks are missing, contain NaN, or fail visibility/presence gates.
 */
export function calculateArmJointAngle(
  landmarks: readonly PoseEngineLandmark[] | null | undefined,
  side: ArmSide,
  jointType: ArmJointType = 'elbow',
  options: ArmAngleOptions = {}
): number | null {
  if (!Array.isArray(landmarks) || landmarks.length === 0) {
    return null;
  }

  const minConfidence = options.minConfidence ?? VISIBILITY_THRESHOLD;
  const requireFullArmChain = options.requireFullArmChain ?? true;
  const indices = ARM_LANDMARK_INDICES[side];

  const shoulder = landmarks[indices.shoulder];
  const elbow = landmarks[indices.elbow];
  const wrist = landmarks[indices.wrist];

  if (requireFullArmChain) {
    if (
      !isLandmarkConfident(shoulder, { minConfidence, use3D: options.use3D }) ||
      !isLandmarkConfident(elbow, { minConfidence, use3D: options.use3D }) ||
      !isLandmarkConfident(wrist, { minConfidence, use3D: options.use3D })
    ) {
      return null;
    }
  }

  if (jointType === 'elbow') {
    return calculateVisibleJointAngle(shoulder, elbow, wrist, options);
  }

  if (jointType === 'shoulder') {
    const hip = landmarks[indices.hip];
    return calculateVisibleJointAngle(hip, shoulder, wrist, options);
  }

  const indexFinger = landmarks[indices.index];
  return calculateVisibleJointAngle(elbow, wrist, indexFinger, options);
}

/**
 * Per-side moving-average smoother (window = SMOOTHING_WINDOW) that resets cleanly on null.
 */
export class ArmAngleSmoother {
  private readonly windowSize: number;
  private windows: Record<ArmSide, number[]> = {
    left: [],
    right: [],
  };

  constructor(windowSize: number = SMOOTHING_WINDOW) {
    this.windowSize = Math.max(1, Math.floor(windowSize));
  }

  public smooth(side: ArmSide, rawAngle: number | null): number | null {
    if (rawAngle === null || !Number.isFinite(rawAngle)) {
      this.resetSide(side);
      return null;
    }

    const buf = this.windows[side];
    buf.push(rawAngle);
    if (buf.length > this.windowSize) {
      buf.shift();
    }

    const sum = buf.reduce((acc, val) => acc + val, 0);
    return sum / buf.length;
  }

  public resetSide(side: ArmSide): void {
    this.windows[side] = [];
  }

  public reset(): void {
    this.windows.left = [];
    this.windows.right = [];
  }

  public getWindow(side: ArmSide): readonly number[] {
    return this.windows[side];
  }
}

/**
 * Tracks consecutive missing frames per joint and emits targeted Thai guidance only after
 * a joint stays missing for strictly more than MIN_STABLE_FRAMES consecutive frames.
 */
export class MissingArmJointTracker {
  private readonly stableThreshold: number;
  private readonly minConfidence: number;
  private counts: Record<ArmSide, Record<ArmJointName, number>> = {
    left: { shoulder: 0, elbow: 0, wrist: 0 },
    right: { shoulder: 0, elbow: 0, wrist: 0 },
  };

  constructor(
    stableThreshold: number = MIN_STABLE_FRAMES,
    minConfidence: number = VISIBILITY_THRESHOLD
  ) {
    this.stableThreshold = Math.max(1, Math.floor(stableThreshold));
    this.minConfidence = minConfidence;
  }

  public update(
    landmarks: readonly PoseEngineLandmark[] | null | undefined,
    side: ArmSide
  ): MissingJointEvaluation {
    const missingJoints = getMissingArmJoints(landmarks, side, this.minConfidence);
    const missingSet = new Set<ArmJointName>(missingJoints);
    const sideCounts = this.counts[side];
    const jointOrder: ArmJointName[] = ['shoulder', 'elbow', 'wrist'];

    for (const joint of jointOrder) {
      if (missingSet.has(joint)) {
        sideCounts[joint] += 1;
      } else {
        sideCounts[joint] = 0;
      }
    }

    let reportedMissingJoint: ArmJointName | null = null;
    for (const joint of jointOrder) {
      if (sideCounts[joint] > this.stableThreshold) {
        reportedMissingJoint = joint;
        break;
      }
    }

    const coachingMessageTh = reportedMissingJoint
      ? MISSING_ARM_JOINT_MESSAGES_TH[side][reportedMissingJoint]
      : null;

    return {
      missingJoints,
      reportedMissingJoint,
      coachingMessageTh,
      consecutiveMissingFrames: { ...sideCounts },
    };
  }

  public reset(side?: ArmSide): void {
    if (side) {
      this.counts[side] = { shoulder: 0, elbow: 0, wrist: 0 };
      return;
    }
    this.counts.left = { shoulder: 0, elbow: 0, wrist: 0 };
    this.counts.right = { shoulder: 0, elbow: 0, wrist: 0 };
  }
}

/**
 * Stateful frame-by-frame processor combining visibility gating, per-side angle smoothing,
 * debounced missing-joint Thai coaching cues, and MIN_STABLE_FRAMES rep stability gating.
 */
export class ArmPoseProcessor {
  private config: ArmPoseProcessorConfig;
  private readonly smoother: ArmAngleSmoother;
  private readonly missingTracker: MissingArmJointTracker;
  private stableTargetFrames = 0;
  private stableReturnFrames = 0;
  private isTargetReached = false;
  private completedReps = 0;

  constructor(config: ArmPoseProcessorConfig) {
    this.config = { ...config };
    this.smoother = new ArmAngleSmoother(config.smoothingWindow ?? SMOOTHING_WINDOW);
    this.missingTracker = new MissingArmJointTracker(
      config.minStableFrames ?? MIN_STABLE_FRAMES,
      config.visibilityThreshold ?? VISIBILITY_THRESHOLD
    );
  }

  private get minStableFrames(): number {
    return Math.max(1, Math.floor(this.config.minStableFrames ?? MIN_STABLE_FRAMES));
  }

  private isAngleInTargetZone(angleDeg: number): boolean {
    const targetMin = this.config.targetMinDeg;
    const targetMax = this.config.targetMaxDeg ?? targetMin;
    const lower = Math.min(targetMin, targetMax);
    const upper = Math.max(targetMin, targetMax);

    if (this.config.targetMaxDeg !== undefined) {
      return angleDeg >= lower && angleDeg <= upper;
    }

    return this.config.direction === 'decrease'
      ? angleDeg <= targetMin
      : angleDeg >= targetMin;
  }

  private isAngleReturnedToStart(angleDeg: number): boolean {
    if (this.config.returnThresholdDeg !== undefined) {
      return this.config.direction === 'decrease'
        ? angleDeg >= this.config.returnThresholdDeg
        : angleDeg <= this.config.returnThresholdDeg;
    }
    return !this.isAngleInTargetZone(angleDeg);
  }

  public processFrame(
    landmarks: readonly PoseEngineLandmark[] | null | undefined,
    sideOverride?: ArmSide
  ): ArmPoseFrameResult {
    const side = sideOverride ?? this.config.side;
    const jointType = this.config.jointType ?? 'elbow';
    const minConfidence = this.config.visibilityThreshold ?? VISIBILITY_THRESHOLD;

    const rawAngleDeg = calculateArmJointAngle(landmarks, side, jointType, {
      minConfidence,
      use3D: this.config.use3D,
      requireFullArmChain: true,
    });
    const smoothedAngleDeg = this.smoother.smooth(side, rawAngleDeg);
    const missingEval = this.missingTracker.update(landmarks, side);

    if (smoothedAngleDeg === null || !Number.isFinite(smoothedAngleDeg)) {
      // Mid-rep joint loss: reset stability counters immediately and refuse rep credit
      this.stableTargetFrames = 0;
      this.stableReturnFrames = 0;
      this.isTargetReached = false;

      return {
        side,
        jointType,
        rawAngleDeg: null,
        smoothedAngleDeg: null,
        hasCompleteArm: false,
        isInsideTargetZone: false,
        isTargetReached: false,
        repCounted: false,
        completedReps: this.completedReps,
        stableTargetFrames: 0,
        stableReturnFrames: 0,
        missingJoints: missingEval.missingJoints,
        reportedMissingJoint: missingEval.reportedMissingJoint,
        coachingMessageTh: missingEval.coachingMessageTh,
      };
    }

    const isInsideTargetZone = this.isAngleInTargetZone(smoothedAngleDeg);
    let repCounted = false;

    if (isInsideTargetZone) {
      this.stableTargetFrames += 1;
      this.stableReturnFrames = 0;
      if (this.stableTargetFrames >= this.minStableFrames) {
        this.isTargetReached = true;
      }
    } else {
      if (!this.isTargetReached) {
        this.stableTargetFrames = 0;
      }

      if (this.isTargetReached && this.isAngleReturnedToStart(smoothedAngleDeg)) {
        this.stableReturnFrames += 1;
        if (this.stableReturnFrames >= this.minStableFrames) {
          this.completedReps += 1;
          this.isTargetReached = false;
          this.stableTargetFrames = 0;
          this.stableReturnFrames = 0;
          repCounted = true;
        }
      } else {
        this.stableReturnFrames = 0;
      }
    }

    return {
      side,
      jointType,
      rawAngleDeg,
      smoothedAngleDeg,
      hasCompleteArm: true,
      isInsideTargetZone,
      isTargetReached: this.isTargetReached,
      repCounted,
      completedReps: this.completedReps,
      stableTargetFrames: this.stableTargetFrames,
      stableReturnFrames: this.stableReturnFrames,
      missingJoints: [],
      reportedMissingJoint: null,
      coachingMessageTh: null,
    };
  }

  public setExercise(config: ArmPoseProcessorConfig): void {
    this.config = { ...config };
    this.reset();
  }

  public reset(): void {
    this.stableTargetFrames = 0;
    this.stableReturnFrames = 0;
    this.isTargetReached = false;
    this.completedReps = 0;
    this.smoother.reset();
    this.missingTracker.reset();
  }
}
