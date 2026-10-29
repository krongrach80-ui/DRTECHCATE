/**
 * packages/pose-engine/src/math/pendulumAnalyzer.ts
 *
 * SHOULDER PENDULUM CIRCULAR TRAJECTORY & PHASE ANALYZER
 * Biomechanical validation for Codman's Shoulder Pendulum exercises:
 * 1. Forward Trunk Lean [18°, 65°] relative to gravity axis.
 * 2. Passive Arm Relaxation (Elbow angle >= 145°, wrist hanging below shoulder).
 * 3. Continuous 360° phase unwrapping around the dynamic oscillation centroid.
 */

import { Point3DLike, calculateAngle3D, calculateTrunkForwardTilt, distance3D } from './geometry3d';
import { PendulumMechanicsConfig } from '../types/exerciseConfig';

export interface PendulumFrameInput {
  shoulder: Point3DLike;
  elbow: Point3DLike;
  wrist: Point3DLike;
  hip: Point3DLike;
  timestampMs: number;
}

export interface PendulumAnalysisResult {
  completedRep: boolean;
  cycleProgressRatio: number;   // 0.0 to 1.0 (accumulated 0° to 360°)
  trunkTiltDeg: number;
  elbowAngleDeg: number;
  radiusRatio: number;          // R / armLength
  instantaneousPhaseDeg: number;
  isTrunkValid: boolean;
  isElbowRelaxed: boolean;
  isWristHanging: boolean;
  warningTh?: string;
  status: 'valid' | 'trunk_warning' | 'elbow_warning' | 'speed_warning' | 'radius_warning';
}

export class ShoulderPendulumAnalyzer {
  private config: PendulumMechanicsConfig;
  private slidingWindowMs: number;
  private trajectoryBuffer: Array<{ x: number; y: number; z: number; timestampMs: number }> = [];
  private accumulatedAngleRad: number = 0;
  private lastPhaseAngleRad: number | null = null;
  private cycleStartTimeMs: number | null = null;
  private completedRepsCount: number = 0;

  constructor(
    config: Partial<PendulumMechanicsConfig> = {},
    slidingWindowMs: number = 2500
  ) {
    this.config = {
      minTrunkForwardTiltDeg: 18.0,
      maxTrunkForwardTiltDeg: 65.0,
      minElbowStraightnessDeg: 145.0,
      minCircleRadiusRatio: 0.07,
      maxCircleRadiusRatio: 0.35,
      minCycleDurationSec: 1.2,
      maxCycleDurationSec: 5.0,
      ...config,
    };
    this.slidingWindowMs = slidingWindowMs;
  }

  public update(frame: PendulumFrameInput): PendulumAnalysisResult {
    const { shoulder, elbow, wrist, hip, timestampMs } = frame;

    if (this.cycleStartTimeMs === null) {
      this.cycleStartTimeMs = timestampMs;
    }

    // 1. Biomechanical Check 1: Forward Trunk Lean
    const trunkTiltDeg = calculateTrunkForwardTilt(shoulder, hip);
    const isTrunkValid =
      trunkTiltDeg >= this.config.minTrunkForwardTiltDeg &&
      trunkTiltDeg <= this.config.maxTrunkForwardTiltDeg;

    // 2. Biomechanical Check 2: Passive Arm Relaxation (Elbow >= 145° & Wrist hanging below shoulder)
    const elbowAngleDeg = calculateAngle3D(shoulder, elbow, wrist);
    const isElbowRelaxed = elbowAngleDeg >= this.config.minElbowStraightnessDeg;
    // In video frame coords, Y increases downwards, so wrist.y > shoulder.y indicates hanging arm
    const isWristHanging = wrist.y >= shoulder.y;

    // 3. Sliding window buffer for wrist trajectory
    this.trajectoryBuffer.push({
      x: wrist.x,
      y: wrist.y,
      z: wrist.z ?? 0,
      timestampMs,
    });

    // Prune trajectory older than sliding window
    const cutoffTime = timestampMs - this.slidingWindowMs;
    while (
      this.trajectoryBuffer.length > 0 &&
      this.trajectoryBuffer[0].timestampMs < cutoffTime
    ) {
      this.trajectoryBuffer.shift();
    }

    // Dynamic Centroid Calculation: (cx, cy)
    let sumX = 0;
    let sumY = 0;
    for (const pt of this.trajectoryBuffer) {
      sumX += pt.x;
      sumY += pt.y;
    }
    const centroidX = this.trajectoryBuffer.length > 0 ? sumX / this.trajectoryBuffer.length : shoulder.x;
    const centroidY = this.trajectoryBuffer.length > 0 ? sumY / this.trajectoryBuffer.length : shoulder.y + 0.3;

    // Calculate arm length reference L = |Shoulder - Elbow| + |Elbow - Wrist|
    const armUpper = distance3D(shoulder, elbow);
    const armFore = distance3D(elbow, wrist);
    const totalArmLength = Math.max(0.1, armUpper + armFore);

    // Current radius from moving centroid
    const currentRadius = Math.hypot(wrist.x - centroidX, wrist.y - centroidY);
    const radiusRatio = currentRadius / totalArmLength;

    // Current phase angle theta = atan2(dy, dx)
    const currentPhaseRad = Math.atan2(wrist.y - centroidY, wrist.x - centroidX);
    const instantaneousPhaseDeg = ((currentPhaseRad * 180.0) / Math.PI + 360.0) % 360.0;

    let warningTh: string | undefined;
    let status: PendulumAnalysisResult['status'] = 'valid';

    if (!isTrunkValid) {
      if (trunkTiltDeg < this.config.minTrunkForwardTiltDeg) {
        warningTh = 'โน้มลำตัวไปข้างหน้าอีกนิด เพื่อให้หัวไหล่หย่อนลงตามแรงโน้มถ่วง';
      } else {
        warningTh = 'ลำตัวก้มต่ำเกินไป ค่อยๆ ยืดตัวขึ้นเล็กน้อย';
      }
      status = 'trunk_warning';
    } else if (!isElbowRelaxed || !isWristHanging) {
      warningTh = 'ปล่อยแขนให้ห้อยตรงผ่อนคลาย อย่าเกร็งหรืองอข้อศอก';
      status = 'elbow_warning';
    }

    // 4. Phase Unwrapping & Angular Accumulation
    if (this.lastPhaseAngleRad !== null && isTrunkValid && isElbowRelaxed) {
      let deltaAngle = currentPhaseRad - this.lastPhaseAngleRad;
      // Wrap into [-PI, PI]
      while (deltaAngle > Math.PI) deltaAngle -= 2 * Math.PI;
      while (deltaAngle < -Math.PI) deltaAngle += 2 * Math.PI;

      // Accumulate absolute circular progression
      this.accumulatedAngleRad += Math.abs(deltaAngle);
    }
    this.lastPhaseAngleRad = currentPhaseRad;

    const twoPi = 2.0 * Math.PI;
    const cycleProgressRatio = Math.min(1.0, this.accumulatedAngleRad / twoPi);
    let completedRep = false;

    // 5. Complete 360° Revolution Check (with 0.05 rad ~ 2.8° float tolerance)
    if (this.accumulatedAngleRad >= twoPi - 0.05) {
      const cycleDurationSec = (timestampMs - (this.cycleStartTimeMs || timestampMs)) / 1000.0;

      const isRadiusValid =
        radiusRatio >= this.config.minCircleRadiusRatio &&
        radiusRatio <= this.config.maxCircleRadiusRatio;

      const isSpeedValid =
        cycleDurationSec >= this.config.minCycleDurationSec &&
        cycleDurationSec <= this.config.maxCycleDurationSec;

      if (!isRadiusValid) {
        if (radiusRatio < this.config.minCircleRadiusRatio) {
          warningTh = 'วาดวงกลมให้กว้างขึ้นอีกนิด';
        } else {
          warningTh = 'ลดขนาดวงกลมลงเล็กน้อย ไม่ต้องแกว่งกว้างเกินไป';
        }
        status = 'radius_warning';
        // Reset without crediting rep
        this.accumulatedAngleRad = 0;
        this.cycleStartTimeMs = timestampMs;
      } else if (!isSpeedValid) {
        if (cycleDurationSec < this.config.minCycleDurationSec) {
          warningTh = 'แกว่งแขนช้าลงอีกนิด เพื่อความปลอดภัยและผ่อนคลาย';
        } else {
          warningTh = 'แกว่งแขนต่อเนื่องอย่างสม่ำเสมอ';
        }
        status = 'speed_warning';
        this.accumulatedAngleRad = 0;
        this.cycleStartTimeMs = timestampMs;
      } else {
        // Valid complete circular pendulum rep!
        completedRep = true;
        this.completedRepsCount++;
        this.accumulatedAngleRad = 0;
        this.cycleStartTimeMs = timestampMs;
        status = 'valid';
      }
    }

    return {
      completedRep,
      cycleProgressRatio,
      trunkTiltDeg,
      elbowAngleDeg,
      radiusRatio,
      instantaneousPhaseDeg,
      isTrunkValid,
      isElbowRelaxed,
      isWristHanging,
      warningTh,
      status,
    };
  }

  public getCompletedReps(): number {
    return this.completedRepsCount;
  }

  public reset(): void {
    this.trajectoryBuffer = [];
    this.accumulatedAngleRad = 0;
    this.lastPhaseAngleRad = null;
    this.cycleStartTimeMs = null;
    this.completedRepsCount = 0;
  }
}
