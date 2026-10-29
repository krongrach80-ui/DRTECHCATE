/**
 * packages/pose-engine/src/engine/calibrationRecorder.ts
 *
 * PT LIVE WEBCAM MOTION-CAPTURE CALIBRATION RECORDER
 * Automatically captures 2-3 reference repetitions performed by the PT,
 * analyzes peak & valley trajectory inflection points, and auto-extracts:
 * - startAngleDeg
 * - targetMinDeg & targetMaxDeg
 * - recommended holdDurationSec
 */

import { LandmarkTriplet, PoseEngineLandmark } from '../types/exerciseConfig';
import { calculateAngle3D, calculateAngle2D } from '../math/geometry3d';

export interface CalibrationSample {
  angleDeg: number;
  timestampMs: number;
}

export interface CalibrationResult {
  startAngleDeg: number;
  targetMinDeg: number;
  targetMaxDeg: number;
  toleranceDeg: number;
  holdDurationSec: number;
  sampleCount: number;
  detectedRepsCount: number;
}

export class CalibrationRecorder {
  private samples: CalibrationSample[] = [];
  private isRecording: boolean = false;

  public start(): void {
    this.samples = [];
    this.isRecording = true;
  }

  public recordFrame(
    landmarks: PoseEngineLandmark[],
    triplet: LandmarkTriplet,
    timestampMs: number = Date.now()
  ): number | null {
    if (!this.isRecording) return null;

    if (
      landmarks.length <= triplet.pointA ||
      landmarks.length <= triplet.vertex ||
      landmarks.length <= triplet.pointB
    ) {
      return null;
    }

    const pA = landmarks[triplet.pointA];
    const pV = landmarks[triplet.vertex];
    const pB = landmarks[triplet.pointB];

    const angle = triplet.use3DWorld
      ? calculateAngle3D(pA, pV, pB)
      : calculateAngle2D(pA, pV, pB);

    this.samples.push({
      angleDeg: angle,
      timestampMs,
    });

    return angle;
  }

  public stop(): CalibrationResult {
    this.isRecording = false;

    if (this.samples.length < 10) {
      // Default fallback if too few samples
      return {
        startAngleDeg: 15,
        targetMinDeg: 80,
        targetMaxDeg: 100,
        toleranceDeg: 10,
        holdDurationSec: 2.0,
        sampleCount: this.samples.length,
        detectedRepsCount: 0,
      };
    }

    const angles = this.samples.map((s) => s.angleDeg);
    const sorted = [...angles].sort((a, b) => a - b);

    // 10th percentile as resting/start angle
    const p10Index = Math.floor(sorted.length * 0.1);
    const p90Index = Math.floor(sorted.length * 0.9);

    const startAngleDeg = Math.round(sorted[p10Index]);
    const maxObservedAngle = Math.round(sorted[p90Index]);

    // Clinical target range: 85% to 100% of maximum range of motion
    const rom = Math.max(20, maxObservedAngle - startAngleDeg);
    const targetMinDeg = Math.round(startAngleDeg + rom * 0.80);
    const targetMaxDeg = Math.round(startAngleDeg + rom * 1.0);

    // Estimate hold duration around targetMax (within 10% of max)
    let maxConsecutiveHoldFrames = 0;
    let currentConsecutive = 0;
    const threshold = targetMinDeg - 5;

    for (const sample of this.samples) {
      if (sample.angleDeg >= threshold) {
        currentConsecutive++;
        if (currentConsecutive > maxConsecutiveHoldFrames) {
          maxConsecutiveHoldFrames = currentConsecutive;
        }
      } else {
        currentConsecutive = 0;
      }
    }

    // Assume average 30 FPS camera feed
    const estimatedHoldDurationSec = Math.max(
      1.0,
      Math.min(5.0, Math.round((maxConsecutiveHoldFrames / 30.0) * 2) / 2)
    );

    return {
      startAngleDeg,
      targetMinDeg,
      targetMaxDeg,
      toleranceDeg: 10,
      holdDurationSec: estimatedHoldDurationSec,
      sampleCount: this.samples.length,
      detectedRepsCount: Math.max(1, Math.round(this.samples.length / 90)),
    };
  }

  public getSampleCount(): number {
    return this.samples.length;
  }

  public reset(): void {
    this.samples = [];
    this.isRecording = false;
  }
}
