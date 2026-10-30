/**
 * packages/pose-engine/src/compensation.ts
 *
 * ADVANCED BIOMECHANICAL COMPENSATION & VELOCITY GUARD ENGINE
 * SaMD Class II (IEC 62304 / ISO 14971) Standard Clinical Form Evaluator
 *
 * Implements:
 * 1. Scapular Hiking (Shoulder Elevation vs Ear / Skull level)
 * 2. Trunk Lateral Flexion (Spine Vector vs Vertical Plumb Line > 12°)
 * 3. Tempo & Angular Velocity Guard (ω = Δθ/Δt with High-Res Timestamps)
 * 4. Monocular Depth Normalization
 */

import {
  CompensationRule,
  ActiveCompensationWarning,
  PoseEngineLandmark,
} from './types/exerciseConfig';
import {
  calculateAngle3D,
  calculateTrunkLateralTilt,
  calculateBiAcromialWidth,
  normalizeLandmarksDepth,
  Point3DLike,
} from './math/geometry3d';

export {
  calculateTrunkLateralTilt,
  calculateBiAcromialWidth,
  normalizeLandmarksDepth,
};

/**
 * Scapular Hiking Detector
 * Checks shoulder elevation ratio relative to ear / skull landmarks
 */
export class ScapularHikingDetector {
  private defaultThresholdRatio: number;

  constructor(thresholdRatio: number = 0.14) {
    this.defaultThresholdRatio = thresholdRatio;
  }

  /**
   * Evaluates shoulder elevation relative to ear level.
   * MediaPipe landmarks:
   * 7: Left Ear, 8: Right Ear
   * 11: Left Shoulder, 12: Right Shoulder
   * Returns hiking ratio and violation status.
   */
  public evaluate(
    landmarks: PoseEngineLandmark[],
    thresholdRatio: number = this.defaultThresholdRatio
  ): { isHiked: boolean; hikingRatio: number; messageTh: string } {
    if (landmarks.length < 13) {
      return { isHiked: false, hikingRatio: 0, messageTh: '' };
    }

    const ls = landmarks[11];
    const rs = landmarks[12];
    const le = landmarks[7];
    const re = landmarks[8];

    // Compute bi-acromial distance for scaling
    const biAcromial = calculateBiAcromialWidth(ls, rs);
    const safeBiAcromial = Math.max(0.1, biAcromial);

    // Vertical distance from ear to shoulder (y is positive downwards in camera space)
    // When a shoulder hikes up towards the ear, (ls.y - le.y) decreases
    const leftEarShoulderDist = Math.max(0, ls.y - (le?.y ?? ls.y - 0.2));
    const rightEarShoulderDist = Math.max(0, rs.y - (re?.y ?? rs.y - 0.2));

    // Normalized ear-shoulder height relative to bi-acromial width
    const leftRatio = leftEarShoulderDist / safeBiAcromial;
    const rightRatio = rightEarShoulderDist / safeBiAcromial;

    // Asymmetry or excessive elevation (normal ear-shoulder ratio is ~0.4 - 0.7)
    // If ratio drops below threshold, shoulder has hiked upward towards ear
    const isLeftHiked = leftRatio < thresholdRatio;
    const isRightHiked = rightRatio < thresholdRatio;

    // Also detect unilateral hiking (one shoulder significantly higher than the other)
    const shoulderDeltaY = Math.abs(ls.y - rs.y) / safeBiAcromial;
    const isAsymmetricHike = shoulderDeltaY > 0.18;

    const isHiked = isLeftHiked || isRightHiked || isAsymmetricHike;
    const hikingRatio = Math.max(isLeftHiked ? 1 - leftRatio : 0, isRightHiked ? 1 - rightRatio : 0, shoulderDeltaY);

    return {
      isHiked,
      hikingRatio: Math.round(hikingRatio * 100) / 100,
      messageTh: 'ผ่อนคลายหัวไหล่ลง อย่าเกร็งหรือยักไหล่ขึ้น',
    };
  }
}

/**
 * Trunk Compensation Detector
 * Evaluates lateral flexion and excessive sway of the spine
 */
export class TrunkCompensationDetector {
  private lateralThresholdDeg: number;

  constructor(lateralThresholdDeg: number = 12.0) {
    this.lateralThresholdDeg = lateralThresholdDeg;
  }

  /**
   * Calculates lateral trunk flexion angle relative to vertical plumb line.
   * Mid-Shoulder: (11 + 12) / 2
   * Mid-Hip: (23 + 24) / 2
   */
  public evaluate(
    landmarks: PoseEngineLandmark[],
    thresholdDeg: number = this.lateralThresholdDeg
  ): { isCompensating: boolean; lateralTiltDeg: number; messageTh: string } {
    if (landmarks.length < 25) {
      return { isCompensating: false, lateralTiltDeg: 0, messageTh: '' };
    }

    const midShoulder: Point3DLike = {
      x: (landmarks[11].x + landmarks[12].x) / 2.0,
      y: (landmarks[11].y + landmarks[12].y) / 2.0,
      z: ((landmarks[11].z ?? 0) + (landmarks[12].z ?? 0)) / 2.0,
    };

    const midHip: Point3DLike = {
      x: (landmarks[23].x + landmarks[24].x) / 2.0,
      y: (landmarks[23].y + landmarks[24].y) / 2.0,
      z: ((landmarks[23].z ?? 0) + (landmarks[24].z ?? 0)) / 2.0,
    };

    const lateralTiltDeg = calculateTrunkLateralTilt(midShoulder, midHip);
    const isCompensating = lateralTiltDeg > thresholdDeg;

    return {
      isCompensating,
      lateralTiltDeg: Math.round(lateralTiltDeg * 10) / 10,
      messageTh: 'รักษาลำตัวให้ตั้งตรง อย่าเอียงตัวช่วยยก',
    };
  }
}

/**
 * Tempo & Angular Velocity Guard
 * Calculates ω = Δθ/Δt using high-resolution timestamps
 * Rejects jerky, uncontrolled joint movements exceeding clinical safety ceilings
 */
export class VelocityGuard {
  private lastAngleDeg: number | null = null;
  private lastTimestampMs: number | null = null;
  private maxSafeVelocityDegPerSec: number | null;
  private velocityViolationOccurred: boolean = false;

  constructor(maxSafeVelocityDegPerSec?: number | null) {
    this.maxSafeVelocityDegPerSec = maxSafeVelocityDegPerSec ?? null;
  }

  public setMaxSafeVelocity(maxVelocity?: number | null): void {
    this.maxSafeVelocityDegPerSec = maxVelocity ?? null;
  }

  /**
   * Computes angular velocity and checks for tempo violations.
   */
  public update(
    currentAngleDeg: number,
    timestampMs: number
  ): { angularVelocityDegPerSec: number; isViolated: boolean; messageTh: string } {
    let velocity = 0;

    if (this.lastAngleDeg !== null && this.lastTimestampMs !== null) {
      const dtSec = (timestampMs - this.lastTimestampMs) / 1000.0;
      if (dtSec > 0.005) {
        velocity = Math.abs(currentAngleDeg - this.lastAngleDeg) / dtSec;
      }
    }

    this.lastAngleDeg = currentAngleDeg;
    this.lastTimestampMs = timestampMs;

    const isViolated =
      this.maxSafeVelocityDegPerSec !== null &&
      this.maxSafeVelocityDegPerSec !== undefined &&
      velocity > this.maxSafeVelocityDegPerSec;
    if (isViolated) {
      this.velocityViolationOccurred = true;
    }

    return {
      angularVelocityDegPerSec: Math.round(velocity * 10) / 10,
      isViolated,
      messageTh: 'เคลื่อนไหวช้าลง ควบคุมจังหวะให้สม่ำเสมอ',
    };
  }

  /**
   * Checks whether a velocity violation occurred during the current repetition.
   */
  public hasRepViolation(): boolean {
    return this.velocityViolationOccurred;
  }

  /**
   * Resets the violation flag for a new repetition.
   */
  public resetRepViolation(): void {
    this.velocityViolationOccurred = false;
  }

  public reset(): void {
    this.lastAngleDeg = null;
    this.lastTimestampMs = null;
    this.velocityViolationOccurred = false;
  }
}

/**
 * Unified Clinical Compensation Detector
 * Combines Scapular Hiking, Lateral Flexion, Velocity Guard, and legacy rules
 */
export class CompensationDetector {
  private rules: CompensationRule[];
  private scapularHikingDetector: ScapularHikingDetector;
  private trunkCompensationDetector: TrunkCompensationDetector;
  private velocityGuard: VelocityGuard;

  constructor(rules: CompensationRule[] = [], maxSafeVelocityDegPerSec?: number | null) {
    this.rules = rules;
    this.scapularHikingDetector = new ScapularHikingDetector();
    this.trunkCompensationDetector = new TrunkCompensationDetector(12.0);
    this.velocityGuard = new VelocityGuard(maxSafeVelocityDegPerSec);
  }

  public setRules(rules: CompensationRule[]): void {
    this.rules = rules;
  }

  public setMaxSafeVelocity(maxVelocity?: number | null): void {
    this.velocityGuard.setMaxSafeVelocity(maxVelocity);
  }

  public getVelocityGuard(): VelocityGuard {
    return this.velocityGuard;
  }

  public evaluate(
    landmarks: PoseEngineLandmark[],
    currentAngleDeg: number,
    timestampMs: number
  ): {
    warnings: ActiveCompensationWarning[];
    angularVelocityDegPerSec: number;
    lateralTiltDeg: number;
    scapularHikingRatio: number;
    isVelocityViolated: boolean;
  } {
    const activeWarnings: ActiveCompensationWarning[] = [];

    // 1. Angular Velocity Check
    const velocityResult = this.velocityGuard.update(currentAngleDeg, timestampMs);
    if (velocityResult.isViolated) {
      activeWarnings.push({
        ruleId: 'velocity_tempo_guard',
        type: 'excessive_speed',
        messageTh: velocityResult.messageTh,
        severity: 'warning',
        currentValue: velocityResult.angularVelocityDegPerSec,
        thresholdValue: 180.0,
      });
    }

    // 2. Trunk Lateral Flexion Check (Δθ > 12°)
    const trunkResult = this.trunkCompensationDetector.evaluate(landmarks);
    if (trunkResult.isCompensating) {
      activeWarnings.push({
        ruleId: 'trunk_lateral_flexion_guard',
        type: 'trunk_lateral_flexion',
        messageTh: trunkResult.messageTh,
        severity: 'warning',
        currentValue: trunkResult.lateralTiltDeg,
        thresholdValue: 12.0,
      });
    }

    // 3. Scapular Hiking Check
    const hikingResult = this.scapularHikingDetector.evaluate(landmarks);
    if (hikingResult.isHiked) {
      activeWarnings.push({
        ruleId: 'scapular_hiking_guard',
        type: 'scapular_hiking',
        messageTh: hikingResult.messageTh,
        severity: 'warning',
        currentValue: hikingResult.hikingRatio,
        thresholdValue: 0.14,
      });
    }

    // 4. Custom Configured Rules
    for (const rule of this.rules) {
      let currentValue = 0;
      let isViolated = false;

      switch (rule.type) {
        case 'excessive_speed':
        case 'tempo_violation': {
          currentValue = velocityResult.angularVelocityDegPerSec;
          isViolated = currentValue > rule.thresholdValue;
          break;
        }

        case 'trunk_lateral_flexion': {
          currentValue = trunkResult.lateralTiltDeg;
          isViolated = currentValue > rule.thresholdValue;
          break;
        }

        case 'scapular_hiking':
        case 'shoulder_shrug': {
          currentValue = hikingResult.hikingRatio;
          isViolated = hikingResult.isHiked;
          break;
        }

        case 'trunk_lean': {
          if (landmarks.length > 24) {
            const shoulderMidX = (landmarks[11].x + landmarks[12].x) / 2.0;
            const hipMidX = (landmarks[23].x + landmarks[24].x) / 2.0;
            currentValue = Math.abs(shoulderMidX - hipMidX);
            isViolated = currentValue > rule.thresholdValue;
          }
          break;
        }

        case 'elbow_flexion': {
          if (landmarks.length > 16) {
            const lElbow = calculateAngle3D(landmarks[11], landmarks[13], landmarks[15]);
            const rElbow = calculateAngle3D(landmarks[12], landmarks[14], landmarks[16]);
            currentValue = Math.min(lElbow, rElbow);
            isViolated = currentValue < rule.thresholdValue;
          }
          break;
        }
      }

      if (isViolated) {
        // Avoid duplicate rule entries if already caught by guard
        const alreadyExists = activeWarnings.some((w) => w.type === rule.type);
        if (!alreadyExists) {
          activeWarnings.push({
            ruleId: rule.ruleId,
            type: rule.type,
            messageTh: rule.warningMessageTh,
            severity: rule.severity,
            currentValue: Math.round(currentValue * 100) / 100,
            thresholdValue: rule.thresholdValue,
          });
        }
      }
    }

    return {
      warnings: activeWarnings,
      angularVelocityDegPerSec: velocityResult.angularVelocityDegPerSec,
      lateralTiltDeg: trunkResult.lateralTiltDeg,
      scapularHikingRatio: hikingResult.hikingRatio,
      isVelocityViolated: velocityResult.isViolated,
    };
  }

  public reset(): void {
    this.velocityGuard.reset();
  }
}
