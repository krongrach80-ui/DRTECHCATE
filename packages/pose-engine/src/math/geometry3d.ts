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
