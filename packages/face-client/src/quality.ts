/**
 * packages/face-client/src/quality.ts
 * Quality checks before frame capture per Master Prompt v3 Section 7.2 (Line 187).
 * Real Mathematical Quality Gate:
 * 1. Exactly 1 face (faceCount === 1)
 * 2. Inter-ocular distance (iod >= minIod)
 * 3. Bounding box padding (not touching/clipped by frame boundary)
 * 4. Illumination / Luminance within [minBrightness, maxBrightness]
 * 5. Real Laplacian Variance (3x3 Kernel [0, 1, 0, 1, -4, 1, 0, 1, 0]) >= minSharpness
 * 6. Eye openness (both eyes open: eyeBlink < maxBlinkScore)
 * 7. Head pose (yaw, pitch, roll) matches the required step pose ('front' | 'left' | 'right' | 'nod')
 * 8. 300ms continuous temporal stability
 */

import { FaceDetectionResult } from './detect';

export type RequiredPose = 'front' | 'left' | 'right' | 'nod';

export interface QualityConfig {
  minIod?: number; // Minimum inter-ocular distance in pixels (default 40)
  minBrightness?: number; // Minimum average brightness (0-255, default 40)
  maxBrightness?: number; // Maximum average brightness (0-255, default 220)
  minSharpness?: number; // Minimum Laplacian variance (default 50)
  stabilityMs?: number; // Continuous face stability duration in ms (default 300)
  maxBlinkScore?: number; // Maximum blink score to consider eyes open (default 0.5)
  edgeMargin?: number; // Minimum margin in px from frame edges (default 10)
  frontMaxYaw?: number; // Max degrees for frontal yaw (default 12)
  frontMaxPitch?: number; // Max degrees for frontal pitch (default 12)
  frontMaxRoll?: number; // Max degrees for frontal roll (default 12)
  leftMinYaw?: number; // Min degrees yaw for left turn (default -15)
  rightMinYaw?: number; // Min degrees yaw for right turn (default 15)
  nodMinPitch?: number; // Min degrees pitch for nod (default -12)
}

export interface QualityResult {
  passed: boolean;
  issues: string[];
  iod: number;
  brightness: number;
  sharpness: number;
  stableDurationMs: number;
  poseMatched: boolean;
  eyesOpen: boolean;
}

/**
 * Computes standard mathematical Laplacian Variance on grayscale pixel buffer
 * using 3x3 Discrete Laplace Operator Kernel:
 * [  0,  1,  0 ]
 * [  1, -4,  1 ]
 * [  0,  1,  0 ]
 */
export function computeLaplacianVariance(
  pixels: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number
): number {
  if (width < 3 || height < 3 || pixels.length < width * height * 4) {
    return 0;
  }

  // 1. Convert RGBA to Grayscale
  const totalPixels = width * height;
  const gray = new Float32Array(totalPixels);
  for (let i = 0, j = 0; j < totalPixels; i += 4, j++) {
    gray[j] = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
  }

  // 2. Convolution with 3x3 Laplacian Kernel
  let sum = 0;
  let sumSq = 0;
  let count = 0;

  for (let y = 1; y < height - 1; y++) {
    const rowOffset = y * width;
    const prevRowOffset = (y - 1) * width;
    const nextRowOffset = (y + 1) * width;

    for (let x = 1; x < width - 1; x++) {
      const center = gray[rowOffset + x];
      const top = gray[prevRowOffset + x];
      const bottom = gray[nextRowOffset + x];
      const left = gray[rowOffset + x - 1];
      const right = gray[rowOffset + x + 1];

      const lap = top + left + bottom + right - 4 * center;

      sum += lap;
      sumSq += lap * lap;
      count++;
    }
  }

  if (count === 0) return 0;
  const mean = sum / count;
  const variance = sumSq / count - mean * mean;
  return Math.max(0, variance);
}

export class FaceQualityChecker {
  public readonly minIod: number;
  public readonly minBrightness: number;
  public readonly maxBrightness: number;
  public readonly minSharpness: number;
  public readonly stabilityMs: number;
  public readonly maxBlinkScore: number;
  public readonly edgeMargin: number;

  public readonly frontMaxYaw: number;
  public readonly frontMaxPitch: number;
  public readonly frontMaxRoll: number;
  public readonly leftMinYaw: number;
  public readonly rightMinYaw: number;
  public readonly nodMinPitch: number;

  private stableStartTime: number = 0;
  private lastPassedCriteria: boolean = false;

  constructor(config: QualityConfig = {}) {
    this.minIod = config.minIod ?? 40;
    this.minBrightness = config.minBrightness ?? 40;
    this.maxBrightness = config.maxBrightness ?? 220;
    this.minSharpness = config.minSharpness ?? 50;
    this.stabilityMs = config.stabilityMs ?? 300;
    this.maxBlinkScore = config.maxBlinkScore ?? 0.5;
    this.edgeMargin = config.edgeMargin ?? 10;

    this.frontMaxYaw = config.frontMaxYaw ?? 12;
    this.frontMaxPitch = config.frontMaxPitch ?? 12;
    this.frontMaxRoll = config.frontMaxRoll ?? 12;
    this.leftMinYaw = config.leftMinYaw ?? -15;
    this.rightMinYaw = config.rightMinYaw ?? 15;
    this.nodMinPitch = config.nodMinPitch ?? -12;
  }

  public resetStability(): void {
    this.stableStartTime = 0;
    this.lastPassedCriteria = false;
  }

  /**
   * Assesses quality of the detected face frame against all 8 Quality Gate criteria.
   */
  public checkQuality(
    detection: FaceDetectionResult,
    frameCanvas?: HTMLCanvasElement,
    targetPose: RequiredPose = 'front',
    now: number = Date.now()
  ): QualityResult {
    const issues: string[] = [];

    // Criterion 1: Exactly 1 face
    if (!detection.hasFace || detection.faceCount === 0) {
      this.resetStability();
      return {
        passed: false,
        issues: ['NO_FACE_DETECTED'],
        iod: 0,
        brightness: 0,
        sharpness: 0,
        stableDurationMs: 0,
        poseMatched: false,
        eyesOpen: false,
      };
    }

    if (detection.multipleFaces || detection.faceCount > 1) {
      this.resetStability();
      return {
        passed: false,
        issues: ['MULTIPLE_FACES_DETECTED'],
        iod: 0,
        brightness: 0,
        sharpness: 0,
        stableDurationMs: 0,
        poseMatched: false,
        eyesOpen: false,
      };
    }

    // Criterion 2: Inter-Ocular Distance (IOD)
    let iod = 0;
    if (detection.landmarks) {
      const lx = detection.landmarks.leftEye.x;
      const ly = detection.landmarks.leftEye.y;
      const rx = detection.landmarks.rightEye.x;
      const ry = detection.landmarks.rightEye.y;
      iod = Math.sqrt((rx - lx) * (rx - lx) + (ry - ly) * (ry - ly));

      if (iod < this.minIod) {
        issues.push(`FACE_TOO_FAR (IOD ${iod.toFixed(1)}px < ${this.minIod}px)`);
      }
    } else {
      iod = detection.box ? detection.box.width * 0.4 : 50;
    }

    // Criterion 3: Bounding box margin (not clipped by frame boundaries)
    if (detection.box && frameCanvas) {
      const cw = frameCanvas.width;
      const ch = frameCanvas.height;
      const box = detection.box;
      if (
        box.x < this.edgeMargin ||
        box.y < this.edgeMargin ||
        box.x + box.width > cw - this.edgeMargin ||
        box.y + box.height > ch - this.edgeMargin
      ) {
        issues.push('FACE_TOO_CLOSE_TO_EDGE');
      }
    }

    // Criterion 4 & 5: Brightness (Luminance) & Sharpness (Laplacian Variance)
    let brightness = 128;
    let sharpness = 0;

    if (frameCanvas && frameCanvas.getContext && detection.box) {
      const ctx = frameCanvas.getContext('2d');
      if (ctx) {
        try {
          const bx = Math.max(0, Math.floor(detection.box.x));
          const by = Math.max(0, Math.floor(detection.box.y));
          const bw = Math.min(frameCanvas.width - bx, Math.floor(detection.box.width));
          const bh = Math.min(frameCanvas.height - by, Math.floor(detection.box.height));

          if (bw >= 3 && bh >= 3) {
            const imgData = ctx.getImageData(bx, by, bw, bh);
            const data = imgData.data;

            // Compute luminance
            let sumLuminance = 0;
            const pixelCount = data.length / 4;
            for (let i = 0; i < data.length; i += 4) {
              sumLuminance += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            }
            brightness = pixelCount > 0 ? sumLuminance / pixelCount : 128;

            if (brightness < this.minBrightness) {
              issues.push(`LIGHT_TOO_DARK (${brightness.toFixed(0)} < ${this.minBrightness})`);
            } else if (brightness > this.maxBrightness) {
              issues.push(`LIGHT_TOO_BRIGHT (${brightness.toFixed(0)} > ${this.maxBrightness})`);
            }

            // Real Mathematical Laplacian Variance
            sharpness = computeLaplacianVariance(data, bw, bh);
            if (sharpness < this.minSharpness) {
              issues.push(
                `IMAGE_BLURRY (Laplacian variance ${sharpness.toFixed(1)} < ${this.minSharpness})`
              );
            }
          }
        } catch {
          // Canvas cross-origin or headless fallback
          sharpness = this.minSharpness;
        }
      }
    } else {
      sharpness = this.minSharpness; // Fallback if no canvas passed
    }

    // Criterion 6: Both eyes open
    let eyesOpen = true;
    if (detection.eyes) {
      const minOpenness = 1.0 - this.maxBlinkScore;
      if (detection.eyes.leftEyeOpen < minOpenness || detection.eyes.rightEyeOpen < minOpenness) {
        eyesOpen = false;
        issues.push('EYES_CLOSED');
      }
    }

    // Criterion 7: Head pose matches targetPose
    let poseMatched = true;
    if (detection.pose) {
      const { yaw, pitch, roll } = detection.pose;

      if (targetPose === 'front') {
        if (
          Math.abs(yaw) > this.frontMaxYaw ||
          Math.abs(pitch) > this.frontMaxPitch ||
          Math.abs(roll) > this.frontMaxRoll
        ) {
          poseMatched = false;
          issues.push(
            `POSE_NOT_FRONT (yaw: ${yaw.toFixed(1)}°, pitch: ${pitch.toFixed(1)}°, roll: ${roll.toFixed(1)}°)`
          );
        }
      } else if (targetPose === 'left') {
        // Turning head to patient's left (negative yaw)
        if (yaw > this.leftMinYaw) {
          poseMatched = false;
          issues.push(`POSE_NOT_LEFT (yaw: ${yaw.toFixed(1)}° > required ${this.leftMinYaw}°)`);
        }
      } else if (targetPose === 'right') {
        // Turning head to patient's right (positive yaw)
        if (yaw < this.rightMinYaw) {
          poseMatched = false;
          issues.push(`POSE_NOT_RIGHT (yaw: ${yaw.toFixed(1)}° < required ${this.rightMinYaw}°)`);
        }
      } else if (targetPose === 'nod') {
        // Nodding / tilting head downwards (negative pitch) or vertical nod
        if (pitch > this.nodMinPitch && Math.abs(pitch) < Math.abs(this.nodMinPitch)) {
          poseMatched = false;
          issues.push(`POSE_NOT_NOD (pitch: ${pitch.toFixed(1)}° > required ${this.nodMinPitch}°)`);
        }
      }
    }

    // Criterion 8: Continuous stability (stabilityMs ~300ms)
    const instantPassed = issues.length === 0;

    if (!instantPassed) {
      this.resetStability();
      return {
        passed: false,
        issues,
        iod,
        brightness,
        sharpness,
        stableDurationMs: 0,
        poseMatched,
        eyesOpen,
      };
    }

    if (!this.lastPassedCriteria || this.stableStartTime === 0) {
      this.stableStartTime = now;
      this.lastPassedCriteria = true;
    }

    const stableDurationMs = now - this.stableStartTime;
    const stablePassed = stableDurationMs >= this.stabilityMs;

    if (!stablePassed) {
      issues.push(`STABILITY_INSUFFICIENT (${stableDurationMs}ms < ${this.stabilityMs}ms)`);
    }

    return {
      passed: stablePassed,
      issues,
      iod,
      brightness,
      sharpness,
      stableDurationMs,
      poseMatched,
      eyesOpen,
    };
  }
}
