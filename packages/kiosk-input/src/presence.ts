/**
 * Face Presence & Sitting Detector with Stability Window and Hysteresis
 * Master Prompt v3 Section 10 (ระบบ 13 ข้อ 1):
 * - เริ่มเมื่อหน้าขนาดเกินเกณฑ์นิ่งประมาณ 1 วินาที
 * - จบเมื่อหายเกินเวลาที่กำหนด (Hysteresis)
 * - ตอนพักจอไม่บันทึกภาพ (Zero Image Capture During Idle)
 */

import { BoundingBox, KioskInputConfig, DEFAULT_KIOSK_INPUT_CONFIG } from './types.js';

export interface FacePresenceStatus {
  isStablePresent: boolean;
  isEvaluating: boolean;
  evaluationElapsedMs: number;
  absenceElapsedMs: number;
  lastFaceBox: BoundingBox | null;
}

export class FacePresenceTracker {
  private config: KioskInputConfig;
  private isPresent: boolean = false;
  private stableStartTime: number | null = null;
  private absenceStartTime: number | null = null;
  private lastCenter: { x: number; y: number } | null = null;
  private lastFaceBox: BoundingBox | null = null;

  constructor(config: Partial<KioskInputConfig> = {}) {
    this.config = { ...DEFAULT_KIOSK_INPUT_CONFIG, ...config };
  }

  /**
   * Process a detection frame.
   * STRICT PRIVACY INVARIANT: This function takes only bounding box coordinates, NEVER raw image data or video frames!
   */
  public update(faceBox: BoundingBox | null, timestampMs: number): {
    stateChanged: boolean;
    isPresent: boolean;
    eventType: 'PRESENCE_DETECTED' | 'PRESENCE_LOST' | null;
  } {
    // 1. Evaluate whether face meets minimum size and positioning criteria
    const hasSufficientFace = this.isSufficientFace(faceBox);

    if (hasSufficientFace && faceBox) {
      this.lastFaceBox = { ...faceBox };
      const center = {
        x: faceBox.x + faceBox.width / 2,
        y: faceBox.y + faceBox.height / 2,
      };

      // Check motion variance (stability)
      const isMotionStable = this.checkStability(center);
      this.lastCenter = center;

      // Face returned/stable -> reset absence hysteresis timer
      this.absenceStartTime = null;

      if (isMotionStable) {
        if (this.stableStartTime === null) {
          this.stableStartTime = timestampMs;
        }

        const stableDuration = timestampMs - this.stableStartTime;

        // If held still for >= 1000ms and not yet marked present
        if (!this.isPresent && stableDuration >= this.config.facePresenceMinDurationMs) {
          this.isPresent = true;
          return {
            stateChanged: true,
            isPresent: true,
            eventType: 'PRESENCE_DETECTED',
          };
        }
      } else {
        // Patient moved too fast -> restart stability timer
        this.stableStartTime = timestampMs;
      }
    } else {
      // Face is absent or too small
      this.lastFaceBox = null;
      this.lastCenter = null;
      this.stableStartTime = null;

      if (this.isPresent) {
        if (this.absenceStartTime === null) {
          this.absenceStartTime = timestampMs;
        }

        const absenceDuration = timestampMs - this.absenceStartTime;

        // Only lose presence if absence exceeds hysteresis window (e.g. 2000ms)
        if (absenceDuration >= this.config.faceAbsenceHysteresisMs) {
          this.isPresent = false;
          this.absenceStartTime = null;
          return {
            stateChanged: true,
            isPresent: false,
            eventType: 'PRESENCE_LOST',
          };
        }
      }
    }

    return {
      stateChanged: false,
      isPresent: this.isPresent,
      eventType: null,
    };
  }

  private isSufficientFace(faceBox: BoundingBox | null): boolean {
    if (!faceBox) return false;
    // Bounding box dimensions are normalized [0.0, 1.0]
    // Check width and height ratio against minFaceSizeRatio
    const sizeRatio = Math.max(faceBox.width, faceBox.height);
    return sizeRatio >= this.config.minFaceSizeRatio;
  }

  private checkStability(currentCenter: { x: number; y: number }): boolean {
    if (this.lastCenter === null) return true;
    const dx = currentCenter.x - this.lastCenter.x;
    const dy = currentCenter.y - this.lastCenter.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    return dist <= this.config.maxFaceMotionVariance;
  }

  public getStatus(currentTimestampMs: number): FacePresenceStatus {
    return {
      isStablePresent: this.isPresent,
      isEvaluating: this.stableStartTime !== null && !this.isPresent,
      evaluationElapsedMs:
        this.stableStartTime !== null && !this.isPresent
          ? currentTimestampMs - this.stableStartTime
          : 0,
      absenceElapsedMs:
        this.absenceStartTime !== null ? currentTimestampMs - this.absenceStartTime : 0,
      lastFaceBox: this.lastFaceBox ? { ...this.lastFaceBox } : null,
    };
  }

  public reset(): void {
    this.isPresent = false;
    this.stableStartTime = null;
    this.absenceStartTime = null;
    this.lastCenter = null;
    this.lastFaceBox = null;
  }
}
