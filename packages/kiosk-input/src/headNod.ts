/**
 * Head Nod Confirmation Detector (Hands-Free Accessibility)
 * Master Prompt v3 Section 10 (ระบบ 13 ข้อ 2):
 * - หรือพยักหน้ายืนยัน
 * - ห้ามบังคับให้ยก 2 มือ (คนไข้แขน/ไหล่บาดเจ็บทำไม่ได้ ใช้พยักหน้าแทนได้สมบูรณ์)
 */

import { Point2D, KioskInputConfig, DEFAULT_KIOSK_INPUT_CONFIG, KioskInputEvent } from './types.js';

export class HeadNodDetector {
  private config: KioskInputConfig;
  private baselineY: number | null = null;
  private peakNodY: number | null = null;
  private nodStartTime: number | null = null;
  private isNodding: boolean = false;
  private lastTriggerTime: number = -Infinity;
  private readonly REFACTORY_DEBOUNCE_MS = 1500; // Prevent accidental double nods

  constructor(config: Partial<KioskInputConfig> = {}) {
    this.config = { ...DEFAULT_KIOSK_INPUT_CONFIG, ...config };
  }

  /**
   * Update with normalized nose tip coordinate { x, y }
   * where y increases downward [0.0 = top, 1.0 = bottom].
   */
  public update(nosePoint: Point2D | null, timestampMs: number): KioskInputEvent[] {
    const events: KioskInputEvent[] = [];

    if (!nosePoint) {
      this.reset();
      return events;
    }

    // Check refractory debounce period
    if (timestampMs - this.lastTriggerTime < this.REFACTORY_DEBOUNCE_MS) {
      this.baselineY = nosePoint.y;
      return events;
    }

    if (this.baselineY === null) {
      this.baselineY = nosePoint.y;
      return events;
    }

    // Downward delta in normalized coordinates (positive when head dips downward)
    const deltaY = nosePoint.y - this.baselineY;
    // Approximate degree conversion: 0.1 normalized pitch corresponds to ~15 degrees
    const estimatedPitchDeg = (deltaY / 0.1) * 15.0;

    if (!this.isNodding) {
      // Look for downward movement exceeding nod threshold
      if (estimatedPitchDeg >= this.config.nodAngleThresholdDeg) {
        this.isNodding = true;
        this.nodStartTime = timestampMs;
        this.peakNodY = nosePoint.y;
      } else {
        // Slowly adapt baseline to neutral head posture drift
        this.baselineY = 0.95 * this.baselineY + 0.05 * nosePoint.y;
      }
    } else {
      // In nod state: track peak downward displacement
      if (nosePoint.y > (this.peakNodY ?? nosePoint.y)) {
        this.peakNodY = nosePoint.y;
      }

      // Check for return upward toward neutral baseline
      const recoveryDelta = (this.peakNodY ?? nosePoint.y) - nosePoint.y;
      const recoveryDeg = (recoveryDelta / 0.1) * 15.0;

      const elapsed = timestampMs - (this.nodStartTime ?? timestampMs);

      // Successfully dipped and returned within 1000ms
      if (recoveryDeg >= this.config.nodAngleThresholdDeg * 0.5 && elapsed <= 1000) {
        this.lastTriggerTime = timestampMs;
        events.push({
          type: 'HEAD_NOD_CONFIRMED',
          timestamp: timestampMs,
          pitchDeltaDeg: estimatedPitchDeg,
        });
        this.reset();
      } else if (elapsed > 1200) {
        // Timed out without returning upward -> cancel
        this.reset();
      }
    }

    return events;
  }

  public reset(): void {
    this.baselineY = null;
    this.peakNodY = null;
    this.nodStartTime = null;
    this.isNodding = false;
  }
}
