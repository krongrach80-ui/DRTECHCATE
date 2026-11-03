/**
 * packages/pose-engine/src/math/pendulumAnalyzer.ts
 *
 * CLINICAL DUAL-MODE HYSTERESIS PENDULUM ANALYZER
 * Biomechanical validation & repetition tracking for Codman's Shoulder Pendulum:
 *
 * 1. Torso-Relative Coordinate Normalization:
 *    Δx_norm = (x_distal - x_shoulder) / shoulderWidth
 *    Δy_norm = (y_distal - y_shoulder) / shoulderWidth
 *    Eliminates false reps from whole-body swaying, chair rocking, or head movement.
 *
 * 2. Dual-Mode Hysteresis State Machine:
 *    Supports both linear back-and-forth oscillation and transverse circular loops:
 *    NEUTRAL -> EXTREME_A (Δx >= +A_thresh) -> EXTREME_B (Δx <= -A_thresh) -> RETURN -> +1 Rep
 *
 * 3. Adaptive 2-Rep Calibration:
 *    Measures patient's natural comfortable amplitude in first 2 reps, adapting
 *    threshold within safe clinical bounds [0.10, 0.35] * shoulderWidth.
 *
 * 4. Temporal & Amplitude Guardrails:
 *    Enforces 600ms <= repDuration <= 5000ms and min amplitude to reject micro-tremors.
 */

import { Point3DLike, calculateAngle3D, calculateTrunkForwardTilt, distance3D } from './geometry3d';
import { PendulumMechanicsConfig } from '../types/exerciseConfig';

export interface PendulumFrameInput {
  shoulder: Point3DLike;
  elbow: Point3DLike;
  wrist: Point3DLike;
  hip?: Point3DLike;
  oppositeShoulder?: Point3DLike;
  timestampMs: number;
}

export type PendulumHysteresisState =
  | 'IDLE'
  | 'NEUTRAL'
  | 'EXTREME_A'
  | 'EXTREME_B'
  | 'CROSS_NEUTRAL'
  | 'RETURN_NEUTRAL';

export interface PendulumAnalysisResult {
  completedRep: boolean;
  cycleProgressRatio: number;   // 0.0 to 1.0 (smooth progress)
  trunkTiltDeg: number;
  elbowAngleDeg: number;
  radiusRatio: number;          // R / armLength
  instantaneousPhaseDeg: number;
  isTrunkValid: boolean;
  isElbowRelaxed: boolean;
  isWristHanging: boolean;
  warningTh?: string;
  status: 'valid' | 'trunk_warning' | 'elbow_warning' | 'speed_warning' | 'radius_warning';
  hysteresisState: PendulumHysteresisState;
  normalizedSignal: number;     // Normalized Δx relative to shoulder
  calibratedThreshold: number;  // Current amplitude threshold
  blockingReason?: string;
}

export class ShoulderPendulumAnalyzer {
  private config: PendulumMechanicsConfig;
  private slidingWindowMs: number;
  private trajectoryBuffer: Array<{ x: number; y: number; z: number; timestampMs: number }> = [];

  // Torso-relative baseline
  private baselineX: number | null = null;
  private baselineY: number | null = null;

  // Hysteresis State Machine
  private hysteresisState: PendulumHysteresisState = 'NEUTRAL';
  private repStartTimeMs: number | null = null;
  private completedRepsCount: number = 0;

  // Amplitude & Calibration
  private currentAmplitudeThreshold: number = 0.14; // normalized to shoulderWidth
  private peakAObserved: number = 0;
  private peakBObserved: number = 0;
  private calibrationPeaks: number[] = [];

  // Circular phase unwrapping accumulator
  private accumulatedAngleRad: number = 0;
  private lastPhaseAngleRad: number | null = null;

  constructor(
    config: Partial<PendulumMechanicsConfig> = {},
    slidingWindowMs: number = 3000
  ) {
    this.config = {
      minTrunkForwardTiltDeg: 18.0,
      maxTrunkForwardTiltDeg: 65.0,
      minElbowStraightnessDeg: 140.0,
      minCircleRadiusRatio: 0.08,
      maxCircleRadiusRatio: 0.40,
      minCycleDurationSec: 0.6,
      maxCycleDurationSec: 5.0,
      ...config,
    };
    this.slidingWindowMs = slidingWindowMs;
  }

  public update(frame: PendulumFrameInput): PendulumAnalysisResult {
    const { shoulder, elbow, wrist, hip, oppositeShoulder, timestampMs } = frame;

    if (this.repStartTimeMs === null) {
      this.repStartTimeMs = timestampMs;
    }

    // 1. Calculate Shoulder Width for scale-invariant normalization
    let shoulderWidth = 0.28; // default fallback if opposite shoulder not given
    if (oppositeShoulder) {
      shoulderWidth = Math.max(
        0.12,
        Math.hypot(shoulder.x - oppositeShoulder.x, shoulder.y - oppositeShoulder.y)
      );
    }

    // 2. Torso-Relative Distal Displacement
    // Use wrist if available, otherwise fallback smoothly to elbow
    const distalPoint = wrist && wrist.y !== undefined ? wrist : elbow;
    const rawDeltaX = distalPoint.x - shoulder.x;
    const rawDeltaY = distalPoint.y - shoulder.y;

    const normX = rawDeltaX / shoulderWidth;
    const normY = rawDeltaY / shoulderWidth;

    // Adaptive Baseline Update:
    // X is naturally centered at 0.0 relative to the shoulder axis.
    if (this.baselineX === null) {
      this.baselineX = 0.0;
    } else {
      this.baselineX = 0.995 * this.baselineX + 0.005 * normX;
    }

    if (this.baselineY === null) {
      this.baselineY = normY;
    } else {
      this.baselineY = 0.985 * this.baselineY + 0.015 * normY;
    }

    const signalX = normX - this.baselineX;
    const signalY = normY - this.baselineY;
    const normalizedSignal = signalX;

    // 3. Biomechanical Validation
    // Forward Trunk Lean (if hip provided, else assume valid)
    let trunkTiltDeg = 25.0;
    let isTrunkValid = true;
    if (hip) {
      trunkTiltDeg = calculateTrunkForwardTilt(shoulder, hip);
      // Soft tolerance for clinical seating: [12°, 70°]
      isTrunkValid = trunkTiltDeg >= 12.0 && trunkTiltDeg <= 70.0;
    }

    // Arm Relaxation: elbow straightness
    const elbowAngleDeg = calculateAngle3D(shoulder, elbow, distalPoint);
    const isElbowRelaxed = elbowAngleDeg >= this.config.minElbowStraightnessDeg;
    // Wrist hanging below shoulder in video coordinates (Y increases downwards)
    const isWristHanging = distalPoint.y >= shoulder.y - 0.05;

    // Arm length reference L = |Shoulder - Elbow| + |Elbow - Wrist|
    const armUpper = distance3D(shoulder, elbow);
    const armFore = distance3D(elbow, distalPoint);
    const totalArmLength = Math.max(0.1, armUpper + armFore);
    const currentRadius = Math.hypot(rawDeltaX, rawDeltaY);
    const radiusRatio = currentRadius / totalArmLength;

    // Angular phase for circular mode
    const currentPhaseRad = Math.atan2(signalY, signalX);
    const instantaneousPhaseDeg = ((currentPhaseRad * 180.0) / Math.PI + 360.0) % 360.0;

    // Phase unwrapping for circular trajectory
    if (this.lastPhaseAngleRad !== null) {
      let dTheta = currentPhaseRad - this.lastPhaseAngleRad;
      while (dTheta > Math.PI) dTheta -= 2 * Math.PI;
      while (dTheta < -Math.PI) dTheta += 2 * Math.PI;
      this.accumulatedAngleRad += Math.abs(dTheta);
    }
    this.lastPhaseAngleRad = currentPhaseRad;

    // Determine Biomechanical Coaching Message & Warnings
    let warningTh: string | undefined;
    let status: PendulumAnalysisResult['status'] = 'valid';
    let blockingReason: string | undefined;

    if (!isTrunkValid && hip) {
      warningTh = 'โน้มลำตัวไปข้างหน้าเล็กน้อย ให้หัวไหล่ผ่อนคลายตามแรงโน้มถ่วง';
      status = 'trunk_warning';
      blockingReason = 'trunk_angle_invalid';
    } else if (!isElbowRelaxed) {
      warningTh = 'ปล่อยแขนให้ตรงและผ่อนคลาย อย่าเกร็งหรืองอข้อศอก';
      status = 'elbow_warning';
      blockingReason = 'elbow_bent';
    } else if (!isWristHanging) {
      warningTh = 'ปล่อยแขนห้อยลงอย่างสบายๆ ไม่ต้องยกแขนขึ้น';
      status = 'elbow_warning';
      blockingReason = 'arm_not_hanging';
    }

    // 4. Hysteresis State Machine Update (for Linear Back-and-Forth Oscillation)
    const thresh = this.currentAmplitudeThreshold;
    let completedRep = false;
    let cycleProgressRatio = 0.0;

    switch (this.hysteresisState) {
      case 'IDLE':
      case 'NEUTRAL':
        this.repStartTimeMs = this.repStartTimeMs ?? timestampMs;
        if (signalX >= thresh) {
          this.hysteresisState = 'EXTREME_A';
          this.peakAObserved = signalX;
          cycleProgressRatio = 0.35;
        } else if (signalX <= -thresh) {
          this.hysteresisState = 'EXTREME_B';
          this.peakBObserved = Math.abs(signalX);
          cycleProgressRatio = 0.35;
        } else {
          cycleProgressRatio = Math.min(0.30, (Math.abs(signalX) / thresh) * 0.30);
        }
        break;

      case 'EXTREME_A':
        if (signalX > this.peakAObserved) {
          this.peakAObserved = signalX;
        }
        if (signalX <= -thresh || this.accumulatedAngleRad >= 1.4 * Math.PI) {
          this.hysteresisState = 'EXTREME_B';
          this.peakBObserved = Math.abs(signalX);
          cycleProgressRatio = 0.75;
        } else if (signalX <= 0) {
          cycleProgressRatio = 0.50 + 0.25 * (Math.abs(signalX) / thresh);
        } else {
          cycleProgressRatio = 0.40;
        }
        break;

      case 'EXTREME_B':
        if (Math.abs(signalX) > this.peakBObserved) {
          this.peakBObserved = Math.abs(signalX);
        }
        cycleProgressRatio = 0.85;
        break;
    }

    // Dual-Mode Completion Detection:
    // Mode A: Circular 360° phase unwrapping (Codman's circular pendulum)
    const isCircleComplete = this.accumulatedAngleRad >= 2.0 * Math.PI - 0.35;
    // Mode B: Linear back-and-forth oscillation return to neutral
    const isLinearComplete =
      this.hysteresisState === 'EXTREME_B' &&
      Math.abs(signalX) <= 0.40 * thresh &&
      this.accumulatedAngleRad < 1.4 * Math.PI;

    if (isCircleComplete || isLinearComplete) {
      const durationSec = (timestampMs - (this.repStartTimeMs || timestampMs)) / 1000.0;

      // Check timing bounds: [minCycleDurationSec, maxCycleDurationSec]
      if (durationSec >= this.config.minCycleDurationSec && durationSec <= this.config.maxCycleDurationSec) {
        completedRep = true;
        this.completedRepsCount++;
        cycleProgressRatio = 1.0;

        // 2-Rep Auto-Calibration
        if (this.calibrationPeaks.length < 2) {
          const repPeak = Math.max(this.peakAObserved, this.peakBObserved, Math.hypot(signalX, signalY));
          if (repPeak >= 0.08) {
            this.calibrationPeaks.push(repPeak);
            const avgPeak =
              this.calibrationPeaks.reduce((a, b) => a + b, 0) / this.calibrationPeaks.length;
            this.currentAmplitudeThreshold = Math.max(0.10, Math.min(0.35, avgPeak * 0.75));
          }
        }

        // Reset for next rep
        this.hysteresisState = 'NEUTRAL';
        this.repStartTimeMs = timestampMs;
        this.accumulatedAngleRad = 0;
        this.peakAObserved = 0;
        this.peakBObserved = 0;
      } else if (durationSec < this.config.minCycleDurationSec) {
        warningTh = 'แกว่งแขนช้าลงอีกนิด เพื่อความผ่อนคลายและปลอดภัย';
        status = 'speed_warning';
        blockingReason = 'tempo_too_fast';
        this.hysteresisState = 'NEUTRAL';
        this.repStartTimeMs = timestampMs;
        this.accumulatedAngleRad = 0;
      } else {
        // Duration too long (> 5.0s) - reset without rep
        this.hysteresisState = 'NEUTRAL';
        this.repStartTimeMs = timestampMs;
        this.accumulatedAngleRad = 0;
      }
    }

    if (this.accumulatedAngleRad > 0 && !completedRep) {
      const circProgress = Math.min(0.95, this.accumulatedAngleRad / (2.0 * Math.PI));
      cycleProgressRatio = Math.max(cycleProgressRatio, circProgress);
    }

    return {
      completedRep,
      cycleProgressRatio: Math.min(1.0, Math.max(0.0, cycleProgressRatio)),
      trunkTiltDeg,
      elbowAngleDeg,
      radiusRatio,
      instantaneousPhaseDeg,
      isTrunkValid,
      isElbowRelaxed,
      isWristHanging,
      warningTh,
      status,
      hysteresisState: this.hysteresisState,
      normalizedSignal: Number(normalizedSignal.toFixed(3)),
      calibratedThreshold: Number(this.currentAmplitudeThreshold.toFixed(3)),
      blockingReason,
    };
  }

  public getCompletedReps(): number {
    return this.completedRepsCount;
  }

  public getCalibratedThreshold(): number {
    return this.currentAmplitudeThreshold;
  }

  public reset(): void {
    this.trajectoryBuffer = [];
    this.baselineX = null;
    this.baselineY = null;
    this.hysteresisState = 'NEUTRAL';
    this.repStartTimeMs = null;
    this.completedRepsCount = 0;
    this.currentAmplitudeThreshold = 0.14;
    this.peakAObserved = 0;
    this.peakBObserved = 0;
    this.calibrationPeaks = [];
    this.accumulatedAngleRad = 0;
    this.lastPhaseAngleRad = null;
  }
}
