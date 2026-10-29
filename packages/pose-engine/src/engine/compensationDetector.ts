/**
 * packages/pose-engine/src/engine/compensationDetector.ts
 *
 * REAL-TIME BIOMECHANICAL COMPENSATION & FORM ERROR DETECTOR
 * Detects compensatory maneuvers common in rehabilitation:
 * - Trunk lean / lateral sway
 * - Shoulder shrug (scapular elevation)
 * - Active elbow flexion
 * - Excessive angular speed
 */

import {
  CompensationRule,
  ActiveCompensationWarning,
  PoseEngineLandmark,
} from '../types/exerciseConfig';
import { calculateAngle3D } from '../math/geometry3d';

export class CompensationDetector {
  private rules: CompensationRule[];
  private lastAngleDeg: number | null = null;
  private lastTimestampMs: number | null = null;

  constructor(rules: CompensationRule[] = []) {
    this.rules = rules;
  }

  public setRules(rules: CompensationRule[]): void {
    this.rules = rules;
  }

  public evaluate(
    landmarks: PoseEngineLandmark[],
    currentAngleDeg: number,
    timestampMs: number
  ): ActiveCompensationWarning[] {
    const activeWarnings: ActiveCompensationWarning[] = [];

    // Calculate angular velocity (deg/s)
    let angularVelocityDegPerSec = 0;
    if (this.lastAngleDeg !== null && this.lastTimestampMs !== null) {
      const dtSec = (timestampMs - this.lastTimestampMs) / 1000.0;
      if (dtSec > 0.005) {
        angularVelocityDegPerSec = Math.abs(currentAngleDeg - this.lastAngleDeg) / dtSec;
      }
    }
    this.lastAngleDeg = currentAngleDeg;
    this.lastTimestampMs = timestampMs;

    for (const rule of this.rules) {
      let currentValue = 0;
      let isViolated = false;

      switch (rule.type) {
        case 'excessive_speed': {
          currentValue = angularVelocityDegPerSec;
          isViolated = currentValue > rule.thresholdValue;
          break;
        }

        case 'shoulder_shrug': {
          // Compare left vs right shoulder Y level, or shoulder to ear vertical distance
          // In MediaPipe: 11 = Left Shoulder, 12 = Right Shoulder
          if (landmarks.length > 12) {
            const ls = landmarks[11];
            const rs = landmarks[12];
            // Delta Y between shoulders in normalized coords
            currentValue = Math.abs(ls.y - rs.y);
            isViolated = currentValue > rule.thresholdValue;
          }
          break;
        }

        case 'trunk_lean': {
          // Compare shoulder midpoint X to hip midpoint X
          // 11, 12 = Shoulders; 23, 24 = Hips
          if (landmarks.length > 24) {
            const shoulderMidX = (landmarks[11].x + landmarks[12].x) / 2.0;
            const hipMidX = (landmarks[23].x + landmarks[24].x) / 2.0;
            currentValue = Math.abs(shoulderMidX - hipMidX);
            isViolated = currentValue > rule.thresholdValue;
          }
          break;
        }

        case 'elbow_flexion': {
          // Calculate elbow joint angle (11-13-15 or 12-14-16)
          if (landmarks.length > 16) {
            const lElbowAngle = calculateAngle3D(landmarks[11], landmarks[13], landmarks[15]);
            const rElbowAngle = calculateAngle3D(landmarks[12], landmarks[14], landmarks[16]);
            // If checking straightness, rule.thresholdValue is minimum straight angle e.g. 145°
            const minElbow = Math.min(lElbowAngle, rElbowAngle);
            currentValue = minElbow;
            isViolated = currentValue < rule.thresholdValue;
          }
          break;
        }
      }

      if (isViolated) {
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

    return activeWarnings;
  }

  public reset(): void {
    this.lastAngleDeg = null;
    this.lastTimestampMs = null;
  }
}
