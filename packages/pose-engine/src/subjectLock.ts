/**
 * packages/pose-engine/src/subjectLock.ts
 *
 * FOREGROUND SUBJECT LOCKING & OCCLUSION GUARD ENGINE
 * SaMD Class II & Hospital-Grade Environmental Noise Immunity:
 *
 * 1. Anti-Hijack Bounding Box & Center of Mass (CoM) Tracking:
 *    - Prevents background bystanders (nurses, family members) from hijacking skeletal tracking.
 *    - Detects unnatural lateral CoM jumps (> 35% screen width within Δt < 50ms) and rejects noisy frames.
 *
 * 2. Landmark Visibility & Occlusion Guard:
 *    - Continuously evaluates keypoint visibility (shoulders, elbows, wrists, hips).
 *    - If average visibility < 0.65 for >= 45 consecutive frames (or ~1.5s), flags `isOccluded: true`
 *      and triggers auto-pause on hold timers.
 */

import { PoseEngineLandmark } from './types/exerciseConfig';

export interface SubjectLockConfig {
  minKeypointVisibility?: number; // default: 0.65
  maxOcclusionFrames?: number; // default: 45 frames
  maxJumpThresholdPercent?: number; // default: 0.35 (35% screen width)
  maxJumpDeltaTimeMs?: number; // default: 50 ms
  primaryKeypointIndices?: number[]; // default: [11, 12, 13, 14, 15, 16, 23, 24]
}

export interface BoundingBox2D {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  area: number;
  width: number;
  height: number;
}

export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export interface SubjectLockResult {
  isSubjectLocked: boolean;
  isOccluded: boolean;
  isFrameDropped: boolean;
  occlusionReasonTh?: string;
  frameDropReason?: string;
  averageVisibility: number;
  consecutiveOccludedFrames: number;
  centerOfMass: Point3D;
  boundingBox: BoundingBox2D;
  averageDepthZ: number;
}

const DEFAULT_PRIMARY_KEYPOINTS = [11, 12, 13, 14, 15, 16, 23, 24]; // Shoulders, Elbows, Wrists, Hips

/**
 * Calculates Center of Mass (CoM) from Mid-Shoulder and Mid-Hip
 */
export function calculateCenterOfMass(landmarks: PoseEngineLandmark[]): Point3D {
  if (landmarks.length < 25) {
    return { x: 0.5, y: 0.5, z: 0 };
  }

  const ls = landmarks[11] || { x: 0.5, y: 0.5, z: 0 };
  const rs = landmarks[12] || { x: 0.5, y: 0.5, z: 0 };
  const lh = landmarks[23] || { x: 0.5, y: 0.5, z: 0 };
  const rh = landmarks[24] || { x: 0.5, y: 0.5, z: 0 };

  const midShoulder: Point3D = {
    x: (ls.x + rs.x) / 2.0,
    y: (ls.y + rs.y) / 2.0,
    z: ((ls.z ?? 0) + (rs.z ?? 0)) / 2.0,
  };

  const midHip: Point3D = {
    x: (lh.x + rh.x) / 2.0,
    y: (lh.y + rh.y) / 2.0,
    z: ((lh.z ?? 0) + (rh.z ?? 0)) / 2.0,
  };

  return {
    x: Math.round(((midShoulder.x + midHip.x) / 2.0) * 10000) / 10000,
    y: Math.round(((midShoulder.y + midHip.y) / 2.0) * 10000) / 10000,
    z: Math.round((((midShoulder.z ?? 0) + (midHip.z ?? 0)) / 2.0) * 10000) / 10000,
  };
}

/**
 * Calculates 2D bounding box and area from landmarks
 */
export function calculateBoundingBox(landmarks: PoseEngineLandmark[]): BoundingBox2D {
  if (landmarks.length === 0) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0, area: 0, width: 0, height: 0 };
  }

  let minX = 1.0;
  let maxX = 0.0;
  let minY = 1.0;
  let maxY = 0.0;

  for (const lm of landmarks) {
    if (lm.x < minX) minX = lm.x;
    if (lm.x > maxX) maxX = lm.x;
    if (lm.y < minY) minY = lm.y;
    if (lm.y > maxY) maxY = lm.y;
  }

  const width = Math.max(0, maxX - minX);
  const height = Math.max(0, maxY - minY);
  const area = Math.round(width * height * 10000) / 10000;

  return { minX, maxX, minY, maxY, area, width, height };
}

/**
 * Validates frame integrity against sudden coordinate jumps and anomalies
 */
export function validateFrameIntegrity(
  currentLandmarks: PoseEngineLandmark[],
  prevLandmarks?: PoseEngineLandmark[],
  dtMs: number = 33
): { isValid: boolean; reason?: string } {
  if (!currentLandmarks || currentLandmarks.length < 25) {
    return { isValid: false, reason: 'insufficient_landmarks' };
  }

  if (prevLandmarks && prevLandmarks.length >= 25 && dtMs < 50) {
    const currentCoM = calculateCenterOfMass(currentLandmarks);
    const prevCoM = calculateCenterOfMass(prevLandmarks);

    const deltaX = Math.abs(currentCoM.x - prevCoM.x);
    if (deltaX > 0.35) {
      return {
        isValid: false,
        reason: 'hijack_detected: lateral CoM jump exceeds 35% screen width within 50ms',
      };
    }
  }

  return { isValid: true };
}

/**
 * Stateless primary subject lock evaluation helper
 */
export function lockPrimarySubject(
  landmarks: PoseEngineLandmark[],
  config: SubjectLockConfig = {}
): SubjectLockResult {
  const minVisibility = config.minKeypointVisibility ?? 0.65;
  const keypointIndices = config.primaryKeypointIndices ?? DEFAULT_PRIMARY_KEYPOINTS;

  const com = calculateCenterOfMass(landmarks);
  const bbox = calculateBoundingBox(landmarks);

  let totalVis = 0;
  let count = 0;
  let totalZ = 0;

  for (const idx of keypointIndices) {
    if (landmarks.length > idx) {
      const lm = landmarks[idx];
      totalVis += lm.visibility ?? 1.0;
      totalZ += lm.z ?? 0;
      count++;
    }
  }

  const averageVisibility = count > 0 ? totalVis / count : 0;
  const averageDepthZ = count > 0 ? totalZ / count : 0;
  const isOccluded = averageVisibility < minVisibility;

  return {
    isSubjectLocked: !isOccluded && bbox.area > 0.02,
    isOccluded,
    isFrameDropped: false,
    occlusionReasonTh: isOccluded ? 'กรุณาขยับให้อยู่ในกรอบกล้องอย่างชัดเจน' : undefined,
    averageVisibility: Math.round(averageVisibility * 100) / 100,
    consecutiveOccludedFrames: isOccluded ? 1 : 0,
    centerOfMass: com,
    boundingBox: bbox,
    averageDepthZ: Math.round(averageDepthZ * 1000) / 1000,
  };
}

/**
 * Stateful Foreground Subject Locker
 * Tracks center of mass, bounding box persistence, and frame-to-frame stability
 */
export class ForegroundSubjectLocker {
  private minKeypointVisibility: number;
  private maxOcclusionFrames: number;
  private maxJumpThresholdPercent: number;
  private maxJumpDeltaTimeMs: number;
  private primaryKeypointIndices: number[];

  private lastValidCoM: Point3D | null = null;
  private lastTimestampMs: number | null = null;
  private consecutiveOccludedFrames: number = 0;
  private isSubjectLocked: boolean = false;
  private isCurrentlyOccluded: boolean = false;

  constructor(config: SubjectLockConfig = {}) {
    this.minKeypointVisibility = config.minKeypointVisibility ?? 0.50;
    this.maxOcclusionFrames = config.maxOcclusionFrames ?? 45;
    this.maxJumpThresholdPercent = config.maxJumpThresholdPercent ?? 0.35;
    this.maxJumpDeltaTimeMs = config.maxJumpDeltaTimeMs ?? 50;
    this.primaryKeypointIndices = config.primaryKeypointIndices ?? DEFAULT_PRIMARY_KEYPOINTS;
  }

  public setPrimaryKeypoints(indices: number[]): void {
    if (indices && indices.length > 0) {
      this.primaryKeypointIndices = indices;
    }
  }

  public updateConfig(config: SubjectLockConfig): void {
    if (config.minKeypointVisibility !== undefined) {
      this.minKeypointVisibility = config.minKeypointVisibility;
    }
    if (config.maxOcclusionFrames !== undefined) {
      this.maxOcclusionFrames = config.maxOcclusionFrames;
    }
    if (config.primaryKeypointIndices !== undefined) {
      this.primaryKeypointIndices = config.primaryKeypointIndices;
    }
  }

  public processFrame(
    landmarks: PoseEngineLandmark[],
    timestampMs: number = Date.now()
  ): SubjectLockResult {
    const com = calculateCenterOfMass(landmarks);
    const bbox = calculateBoundingBox(landmarks);

    // 1. Calculate Average Visibility of Keypoints
    let totalVis = 0;
    let count = 0;
    let totalZ = 0;

    for (const idx of this.primaryKeypointIndices) {
      if (landmarks.length > idx) {
        const lm = landmarks[idx];
        totalVis += lm.visibility ?? 1.0;
        totalZ += lm.z ?? 0;
        count++;
      }
    }

    const averageVisibility = count > 0 ? totalVis / count : 0;
    const averageDepthZ = count > 0 ? totalZ / count : 0;

    // 2. Anti-Hijack Bounding Box & CoM Jump Check
    let isFrameDropped = false;
    let frameDropReason: string | undefined = undefined;

    if (this.lastValidCoM !== null && this.lastTimestampMs !== null) {
      const dtMs = timestampMs - this.lastTimestampMs;
      const deltaX = Math.abs(com.x - this.lastValidCoM.x);

      // If Center of Mass jumped > 35% screen width within 50ms, reject as bystander noise
      if (dtMs > 0 && dtMs <= this.maxJumpDeltaTimeMs && deltaX > this.maxJumpThresholdPercent) {
        isFrameDropped = true;
        frameDropReason = 'hijack_detected: background subject crossed frame';
      }
    }

    if (!isFrameDropped) {
      this.lastValidCoM = com;
      this.lastTimestampMs = timestampMs;
    }

    // 3. Occlusion Guard
    const isFrameLowVisibility = averageVisibility < this.minKeypointVisibility;
    if (isFrameLowVisibility) {
      this.consecutiveOccludedFrames++;
    } else {
      this.consecutiveOccludedFrames = 0;
    }

    // Occlusion is confirmed when low visibility persists for >= maxOcclusionFrames
    this.isCurrentlyOccluded = this.consecutiveOccludedFrames >= this.maxOcclusionFrames;
    this.isSubjectLocked = !this.isCurrentlyOccluded && !isFrameDropped && bbox.area > 0.02;

    return {
      isSubjectLocked: this.isSubjectLocked,
      isOccluded: this.isCurrentlyOccluded,
      isFrameDropped,
      occlusionReasonTh: this.isCurrentlyOccluded
        ? 'กรุณาขยับให้อยู่ในกรอบกล้องอย่างชัดเจน'
        : undefined,
      frameDropReason,
      averageVisibility: Math.round(averageVisibility * 100) / 100,
      consecutiveOccludedFrames: this.consecutiveOccludedFrames,
      centerOfMass: com,
      boundingBox: bbox,
      averageDepthZ: Math.round(averageDepthZ * 1000) / 1000,
    };
  }

  public reset(): void {
    this.lastValidCoM = null;
    this.lastTimestampMs = null;
    this.consecutiveOccludedFrames = 0;
    this.isSubjectLocked = false;
    this.isCurrentlyOccluded = false;
  }
}

/**
 * Multi-Pose Subject Selector:
 * Selects and locks onto primary patient among detected poses (numPoses: 2+)
 * using torso size, distance to center (0.5, 0.5), and centroid temporal continuity
 * so background bystanders walking behind never steal the tracking lock.
 */
export function selectPrimarySubjectPose(
  allPoses: PoseEngineLandmark[][],
  prevLockedCoM?: { x: number; y: number } | null
): { selectedPose: PoseEngineLandmark[]; selectedIndex: number; newLockedCoM: { x: number; y: number } } {
  if (!allPoses || allPoses.length === 0) {
    return { selectedPose: [], selectedIndex: -1, newLockedCoM: prevLockedCoM || { x: 0.5, y: 0.5 } };
  }
  if (allPoses.length === 1) {
    const com = calculateCenterOfMass(allPoses[0]);
    return { selectedPose: allPoses[0], selectedIndex: 0, newLockedCoM: { x: com.x, y: com.y } };
  }

  let bestIdx = 0;
  let maxScore = -Infinity;

  for (let i = 0; i < allPoses.length; i++) {
    const pose = allPoses[i];
    const ls = pose[11];
    const rs = pose[12];
    const com = calculateCenterOfMass(pose);
    const bbox = calculateBoundingBox(pose);

    // Torso size score (closer person has wider shoulders / larger bbox)
    const shoulderWidth = ls && rs ? Math.hypot(ls.x - rs.x, ls.y - rs.y) : bbox.width;
    const sizeScore = shoulderWidth * 2.5 + bbox.area * 1.5;

    // Center distance score (closest to screen center (0.5, 0.5))
    const distFromCenter = Math.hypot(com.x - 0.5, com.y - 0.5);
    const centerScore = Math.max(0, 1.0 - distFromCenter * 1.8);

    // Centroid continuity bonus with previous locked CoM (anti-hijack)
    let persistenceScore = 0;
    if (prevLockedCoM) {
      const distFromPrev = Math.hypot(com.x - prevLockedCoM.x, com.y - prevLockedCoM.y);
      persistenceScore = Math.max(0, (1.0 - distFromPrev * 2.2) * 3.0);
    }

    const totalScore = sizeScore * 1.8 + centerScore * 1.5 + persistenceScore * 2.5;
    if (totalScore > maxScore) {
      maxScore = totalScore;
      bestIdx = i;
    }
  }

  const chosenPose = allPoses[bestIdx];
  const chosenCoM = calculateCenterOfMass(chosenPose);
  const newLockedCoM = prevLockedCoM
    ? {
        x: 0.80 * prevLockedCoM.x + 0.20 * chosenCoM.x,
        y: 0.80 * prevLockedCoM.y + 0.20 * chosenCoM.y,
      }
    : { x: chosenCoM.x, y: chosenCoM.y };

  return { selectedPose: chosenPose, selectedIndex: bestIdx, newLockedCoM };
}

export interface NormalizedBox {
  x: number;      // minX [0, 1]
  y: number;      // minY [0, 1]
  width: number;  // [0, 1]
  height: number; // [0, 1]
}

/**
 * Checks whether a Pose's head landmarks (Nose, Eyes, or Upper Collar)
 * lie within or closely align with a verified Face Bounding Box.
 */
export function isPoseHeadInsideFaceBox(
  pose: PoseEngineLandmark[],
  faceBox: NormalizedBox,
  margin: number = 0.08
): boolean {
  if (!pose || pose.length === 0 || !faceBox) return false;
  const nose = pose[0];
  const leftEye = pose[2];
  const rightEye = pose[5];

  const minX = faceBox.x - margin;
  const maxX = faceBox.x + faceBox.width + margin;
  const minY = faceBox.y - margin;
  const maxY = faceBox.y + faceBox.height + margin;

  // 1. Check nose landmark
  if (nose && (nose.visibility ?? 0) >= 0.20) {
    if (nose.x >= minX && nose.x <= maxX && nose.y >= minY && nose.y <= maxY) {
      return true;
    }
  }

  // 2. Check eye midpoint
  if (leftEye && rightEye && ((leftEye.visibility ?? 0) >= 0.20 || (rightEye.visibility ?? 0) >= 0.20)) {
    const eyeMidX = (leftEye.x + rightEye.x) / 2;
    const eyeMidY = (leftEye.y + rightEye.y) / 2;
    if (eyeMidX >= minX && eyeMidX <= maxX && eyeMidY >= minY && eyeMidY <= maxY) {
      return true;
    }
  }

  // 3. Check upper neck / shoulders midpoint
  const ls = pose[11];
  const rs = pose[12];
  if (ls && rs && ((ls.visibility ?? 0) >= 0.25 || (rs.visibility ?? 0) >= 0.25)) {
    const neckX = (ls.x + rs.x) / 2;
    const neckY = Math.min(ls.y, rs.y);
    const faceMidX = faceBox.x + faceBox.width / 2;
    const faceBottom = faceBox.y + faceBox.height;
    if (Math.abs(neckX - faceMidX) < Math.max(0.12, faceBox.width * 0.9) &&
        Math.abs(neckY - faceBottom) < Math.max(0.15, faceBox.height * 0.8)) {
      return true;
    }
  }

  return false;
}

/**
 * Identity-Aware Subject Pose Selector:
 * Locks onto the specific pose whose head corresponds to the verified patient's face box.
 * Even if bystanders or relatives are closer or larger, they are completely ignored.
 * Falls back to spatial continuity scoring if no verified face box is provided.
 */
export function selectSubjectPoseWithIdentity(
  allPoses: PoseEngineLandmark[][],
  verifiedFaceBox?: NormalizedBox | null,
  prevLockedCoM?: { x: number; y: number } | null
): {
  selectedPose: PoseEngineLandmark[];
  selectedIndex: number;
  newLockedCoM: { x: number; y: number };
  isIdentityMatched: boolean;
} {
  if (!allPoses || allPoses.length === 0) {
    return {
      selectedPose: [],
      selectedIndex: -1,
      newLockedCoM: prevLockedCoM || { x: 0.5, y: 0.5 },
      isIdentityMatched: false,
    };
  }

  // If a verified face box exists, find the pose matching it
  if (verifiedFaceBox) {
    for (let i = 0; i < allPoses.length; i++) {
      if (isPoseHeadInsideFaceBox(allPoses[i], verifiedFaceBox)) {
        const chosenPose = allPoses[i];
        const chosenCoM = calculateCenterOfMass(chosenPose);
        const newLockedCoM = prevLockedCoM
          ? {
              x: 0.80 * prevLockedCoM.x + 0.20 * chosenCoM.x,
              y: 0.80 * prevLockedCoM.y + 0.20 * chosenCoM.y,
            }
          : { x: chosenCoM.x, y: chosenCoM.y };
        return {
          selectedPose: chosenPose,
          selectedIndex: i,
          newLockedCoM,
          isIdentityMatched: true,
        };
      }
    }
  }

  // If no pose matched verified face box, or verified face box is not available:
  const standardSelection = selectPrimarySubjectPose(allPoses, prevLockedCoM);
  return {
    ...standardSelection,
    isIdentityMatched: false,
  };
}
