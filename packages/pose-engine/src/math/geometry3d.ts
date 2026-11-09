/**
 * packages/pose-engine/src/math/geometry3d.ts
 *
 * 3D/2D BIOMECHANICAL JOINT ANGLE & KINEMATICS ENGINE
 * Pure mathematical functions for clinical range-of-motion (ROM),
 * trunk lean vectors, and bone-length sanity verification.
 */

export interface Point3DLike {
  x: number;
  y: number;
  z?: number;
}

export function distance2D(a: Point3DLike, b: Point3DLike): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function distance3D(a: Point3DLike, b: Point3DLike): number {
  const az = a.z ?? 0;
  const bz = b.z ?? 0;
  return Math.hypot(a.x - b.x, a.y - b.y, az - bz);
}

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

/**
 * Calculates 3D joint angle formed by (pointA -> vertex -> pointB) in degrees [0°, 180°].
 */
export function calculateAngle3D(
  pointA: Point3DLike,
  vertex: Point3DLike,
  pointB: Point3DLike
): number {
  const uX = pointA.x - vertex.x;
  const uY = pointA.y - vertex.y;
  const uZ = (pointA.z ?? 0) - (vertex.z ?? 0);

  const vX = pointB.x - vertex.x;
  const vY = pointB.y - vertex.y;
  const vZ = (pointB.z ?? 0) - (vertex.z ?? 0);

  const dot = uX * vX + uY * vY + uZ * vZ;
  const magU = Math.hypot(uX, uY, uZ);
  const magV = Math.hypot(vX, vY, vZ);

  if (magU < 1e-6 || magV < 1e-6) {
    return 0.0;
  }

  const cosTheta = clamp(dot / (magU * magV), -1.0, 1.0);
  return (Math.acos(cosTheta) * 180.0) / Math.PI;
}

/**
 * Calculates 2D planar joint angle formed by (pointA -> vertex -> pointB) in degrees [0°, 180°].
 */
export function calculateAngle2D(
  pointA: Point3DLike,
  vertex: Point3DLike,
  pointB: Point3DLike
): number {
  const uX = pointA.x - vertex.x;
  const uY = pointA.y - vertex.y;

  const vX = pointB.x - vertex.x;
  const vY = pointB.y - vertex.y;

  const dot = uX * vX + uY * vY;
  const magU = Math.hypot(uX, uY);
  const magV = Math.hypot(vX, vY);

  if (magU < 1e-6 || magV < 1e-6) {
    return 0.0;
  }

  const cosTheta = clamp(dot / (magU * magV), -1.0, 1.0);
  return (Math.acos(cosTheta) * 180.0) / Math.PI;
}

/**
 * Calculates trunk forward tilt relative to the vertical plumb line (gravity axis).
 * In image space (y pointing down):
 * - Standing straight: shoulder is directly above hip (0° tilt).
 * - Leaning forward: torso tilts into x/z plane relative to the vertical axis.
 * Returns angle in degrees [0°, 90°].
 */
export function calculateTrunkForwardTilt(
  shoulder: Point3DLike,
  hip: Point3DLike
): number {
  const dx = shoulder.x - hip.x;
  const dy = Math.abs(shoulder.y - hip.y);
  const dz = (shoulder.z ?? 0) - (hip.z ?? 0);

  // Horizontal displacement from vertical axis
  const horizontalDist = Math.hypot(dx, dz);

  if (dy < 1e-4) {
    return 90.0; // Completely horizontal trunk
  }

  const tiltRad = Math.atan2(horizontalDist, dy);
  return (tiltRad * 180.0) / Math.PI;
}

/**
 * Validates anatomical bone length sanity between two connected landmarks.
 * Prevents camera occlusion spikes from generating false repetitions.
 */
export function calculateBoneLengthSanity(
  pointA: Point3DLike,
  pointB: Point3DLike,
  expectedLength: number,
  toleranceRatio: number = 0.40
): boolean {
  if (expectedLength <= 0) return true;
  const measured = distance3D(pointA, pointB);
  const lowerBound = expectedLength * (1.0 - toleranceRatio);
  const upperBound = expectedLength * (1.0 + toleranceRatio);
  return measured >= lowerBound && measured <= upperBound;
}

/**
 * Calculates trunk lateral flexion (side tilt) relative to the vertical plumb line in the frontal plane.
 * @param midShoulder Center point between left and right shoulders
 * @param midHip Center point between left and right hips
 * @returns Lateral tilt angle in degrees [0°, 90°]. 0° = perfectly upright.
 */
export function calculateTrunkLateralTilt(
  midShoulder: Point3DLike,
  midHip: Point3DLike
): number {
  const dx = Math.abs(midShoulder.x - midHip.x);
  const dy = Math.abs(midShoulder.y - midHip.y);

  if (dy < 1e-4) {
    return 90.0;
  }

  const tiltRad = Math.atan2(dx, dy);
  return (tiltRad * 180.0) / Math.PI;
}

/**
 * Calculates Bi-acromial Width (distance between left and right shoulder landmarks).
 */
export function calculateBiAcromialWidth(
  leftShoulder: Point3DLike,
  rightShoulder: Point3DLike
): number {
  return distance3D(leftShoulder, rightShoulder);
}

/**
 * Monocular Depth Normalization
 * Uses Bi-acromial width (and hip width) to compute a scale factor that mitigates
 * perspective lens distortion and Z-axis drift for consistent joint angle tracking.
 */
export function normalizeLandmarksDepth<T extends Point3DLike>(
  landmarks: T[],
  referenceBiAcromialWidth: number = 0.35
): T[] {
  if (landmarks.length < 25) return landmarks;

  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];
  const leftHip = landmarks[23];
  const rightHip = landmarks[24];

  if (!leftShoulder || !rightShoulder || !leftHip || !rightHip) {
    return landmarks;
  }

  const measuredShoulderWidth = distance3D(leftShoulder, rightShoulder);
  if (measuredShoulderWidth < 1e-3) return landmarks;

  const scaleFactor = referenceBiAcromialWidth / measuredShoulderWidth;

  // Anchor centroid at mid-hip
  const anchorX = (leftHip.x + rightHip.x) / 2.0;
  const anchorY = (leftHip.y + rightHip.y) / 2.0;
  const anchorZ = ((leftHip.z ?? 0) + (rightHip.z ?? 0)) / 2.0;

  return landmarks.map((lm) => {
    const normX = anchorX + (lm.x - anchorX) * scaleFactor;
    const normY = anchorY + (lm.y - anchorY) * scaleFactor;
    const normZ = anchorZ + ((lm.z ?? 0) - anchorZ) * scaleFactor;

    return {
      ...lm,
      x: normX,
      y: normY,
      z: normZ,
    };
  });
}

export interface PlaneOfElevationResult {
  planeAngleDeg: number;   // Angle in degrees [ -180°, 180° ], where 0° = Abduction (Coronal), 90° = Flexion (Sagittal)
  lateralComp: number;     // Projection on coronal axis (> 0 is lateral)
  anteriorComp: number;    // Projection on sagittal axis (> 0 is anterior / forward)
  isConfident: boolean;    // true if required landmarks are usable
}

/**
 * Calculates the Plane of Elevation (ISB Shoulder Biomechanics Standard).
 * Projects the arm vector (Shoulder -> Wrist/Elbow) onto the thorax transverse plane.
 * - Coronal Axis (Lateral): points outward from mid-shoulder to active shoulder (0° = pure abduction)
 * - Sagittal Axis (Anterior): points forward from the chest (90° = pure flexion)
 * - Scaption Zone: ~30° to 60°
 *
 * Invariant to body rotation (works when patient stands front, 45°, or side-on).
 */
export function calculatePlaneOfElevation(
  landmarks: (Point3DLike & { visibility?: number })[],
  side: 'left' | 'right',
  useWrist: boolean = true
): PlaneOfElevationResult | null {
  if (!landmarks || landmarks.length < 25) return null;

  const activeShoulderIdx = side === 'left' ? 11 : 12;
  const oppShoulderIdx = side === 'left' ? 12 : 11;
  const activeHipIdx = side === 'left' ? 23 : 24;
  const oppHipIdx = side === 'left' ? 24 : 23;
  const elbowIdx = side === 'left' ? 13 : 14;
  const wristIdx = side === 'left' ? 15 : 16;

  const s = landmarks[activeShoulderIdx];
  const oppS = landmarks[oppShoulderIdx];
  const h = landmarks[activeHipIdx];
  const oppH = landmarks[oppHipIdx];
  const distal = (useWrist && landmarks[wristIdx] && (landmarks[wristIdx].visibility ?? 1.0) >= 0.3)
    ? landmarks[wristIdx]
    : landmarks[elbowIdx];

  if (!s || !oppS || !distal) return null;

  const sVis = s.visibility ?? 1.0;
  const oppSVis = oppS.visibility ?? 1.0;
  const dVis = distal.visibility ?? 1.0;
  const isConfident = sVis >= 0.35 && oppSVis >= 0.35 && dVis >= 0.35;

  // 1. Thorax Midpoints
  const midShoulder: Point3DLike = {
    x: (s.x + oppS.x) / 2.0,
    y: (s.y + oppS.y) / 2.0,
    z: ((s.z ?? 0) + (oppS.z ?? 0)) / 2.0,
  };

  const hasHips = h && oppH && (h.visibility ?? 1.0) >= 0.3 && (oppH.visibility ?? 1.0) >= 0.3;
  const midHip: Point3DLike = hasHips
    ? {
        x: (h.x + oppH.x) / 2.0,
        y: (h.y + oppH.y) / 2.0,
        z: ((h.z ?? 0) + (oppH.z ?? 0)) / 2.0,
      }
    : {
        x: midShoulder.x,
        y: midShoulder.y + 0.35, // fallback downwards in image coordinates (+Y)
        z: midShoulder.z,
      };

  // 2. Trunk Longitudinal Axis (Upward: from midHip to midShoulder)
  let uUp = {
    x: midShoulder.x - midHip.x,
    y: midShoulder.y - midHip.y,
    z: (midShoulder.z ?? 0) - (midHip.z ?? 0),
  };
  const magUp = Math.hypot(uUp.x, uUp.y, uUp.z);
  if (magUp < 1e-6) {
    uUp = { x: 0, y: -1, z: 0 };
  } else {
    uUp = { x: uUp.x / magUp, y: uUp.y / magUp, z: uUp.z / magUp };
  }

  // 3. Coronal / Lateral Axis (Outward: from midShoulder to active shoulder)
  const vLatRaw = {
    x: s.x - midShoulder.x,
    y: s.y - midShoulder.y,
    z: (s.z ?? 0) - (midShoulder.z ?? 0),
  };
  // Gram-Schmidt orthogonalization against uUp
  const dotLatUp = vLatRaw.x * uUp.x + vLatRaw.y * uUp.y + vLatRaw.z * uUp.z;
  let uLat = {
    x: vLatRaw.x - dotLatUp * uUp.x,
    y: vLatRaw.y - dotLatUp * uUp.y,
    z: vLatRaw.z - dotLatUp * uUp.z,
  };
  const magLat = Math.hypot(uLat.x, uLat.y, uLat.z);
  if (magLat < 1e-6) {
    uLat = side === 'left' ? { x: 1, y: 0, z: 0 } : { x: -1, y: 0, z: 0 };
  } else {
    uLat = { x: uLat.x / magLat, y: uLat.y / magLat, z: uLat.z / magLat };
  }

  // 4. Sagittal / Anterior Axis (Forward from chest: normalize((LeftShoulder - RightShoulder) x uUp))
  const leftShoulder = side === 'left' ? s : oppS;
  const rightShoulder = side === 'left' ? oppS : s;
  const shVec = {
    x: leftShoulder.x - rightShoulder.x,
    y: leftShoulder.y - rightShoulder.y,
    z: (leftShoulder.z ?? 0) - (rightShoulder.z ?? 0),
  };
  let uAnt = {
    x: shVec.y * uUp.z - shVec.z * uUp.y,
    y: shVec.z * uUp.x - shVec.x * uUp.z,
    z: shVec.x * uUp.y - shVec.y * uUp.x,
  };
  const magAnt = Math.hypot(uAnt.x, uAnt.y, uAnt.z);
  if (magAnt < 1e-6) {
    uAnt = { x: 0, y: 0, z: -1 };
  } else {
    uAnt = { x: uAnt.x / magAnt, y: uAnt.y / magAnt, z: uAnt.z / magAnt };
  }

  // 5. Arm Vector (from active shoulder to distal point)
  const arm = {
    x: distal.x - s.x,
    y: distal.y - s.y,
    z: (distal.z ?? 0) - (s.z ?? 0),
  };

  // 6. Project arm onto transverse plane (uLat, uAnt)
  const lateralComp = arm.x * uLat.x + arm.y * uLat.y + arm.z * uLat.z;
  const anteriorComp = arm.x * uAnt.x + arm.y * uAnt.y + arm.z * uAnt.z;

  const planeAngleRad = Math.atan2(anteriorComp, lateralComp);
  const planeAngleDeg = (planeAngleRad * 180.0) / Math.PI;

  return {
    planeAngleDeg,
    lateralComp,
    anteriorComp,
    isConfident,
  };
}
