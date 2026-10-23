/**
 * Single-Hand Edge-Zone Gesture Tracker with One Euro Filter Tremor Suppression
 * Master Prompt v3 Section 10 (ระบบ 13 ข้อ 2):
 * - MediaPipe Hand Landmarker + One Euro filter
 * - ชี้ค้างที่โซนขอบจอ ~1 วินาที
 * - ห้ามบังคับให้ยก 2 มือ (คนไข้แขน/ไหล่บาดเจ็บทำไม่ได้ ใช้มือเดียวได้สมบูรณ์)
 */

import {
  Point2D,
  HoverZone,
  HAND_LANDMARK,
  KioskInputConfig,
  DEFAULT_KIOSK_INPUT_CONFIG,
  KioskInputEvent,
} from './types.js';
import { OneEuroFilter2D } from './oneEuroFilter.js';

export interface HandTrackerState {
  rawPoint: Point2D | null;
  filteredPoint: Point2D | null;
  currentZone: HoverZone;
  holdProgress: number; // 0.0 to 1.0
  isHolding: boolean;
}

export class SingleHandGestureTracker {
  private config: KioskInputConfig;
  private filter: OneEuroFilter2D;
  private activeZone: HoverZone = 'none';
  private zoneHoverStartTime: number | null = null;
  private lastRawPoint: Point2D | null = null;
  private lastFilteredPoint: Point2D | null = null;
  private hasTriggeredInCurrentHover: boolean = false;

  constructor(config: Partial<KioskInputConfig> = {}) {
    this.config = { ...DEFAULT_KIOSK_INPUT_CONFIG, ...config };
    this.filter = new OneEuroFilter2D(
      this.config.oneEuroMinCutoff,
      this.config.oneEuroBeta,
      this.config.oneEuroDCutoff
    );
  }

  /**
   * Process a single hand landmark set (Array of 21 Point2D/Point3D landmarks)
   * or a single pointing coordinate (Index finger tip).
   */
  public update(
    input: Point2D[] | Point2D | null,
    timestampMs: number
  ): KioskInputEvent[] {
    const events: KioskInputEvent[] = [];

    if (!input) {
      this.handleHandLost(timestampMs, events);
      return events;
    }

    // Extract index finger tip coordinate (Normalized 0.0 to 1.0)
    let rawPoint: Point2D;
    if (Array.isArray(input)) {
      if (input.length > HAND_LANDMARK.INDEX_FINGER_TIP) {
        rawPoint = input[HAND_LANDMARK.INDEX_FINGER_TIP];
      } else if (input.length > 0) {
        rawPoint = input[0];
      } else {
        this.handleHandLost(timestampMs, events);
        return events;
      }
    } else {
      rawPoint = input;
    }

    this.lastRawPoint = rawPoint;

    // Apply One Euro Filter to cancel hand jitter and resting tremor
    const filteredPoint = this.filter.filter(rawPoint, timestampMs);
    this.lastFilteredPoint = filteredPoint;

    // Determine current zone based on filtered X coordinate
    const zone = this.evaluateZone(filteredPoint.x);

    if (zone !== this.activeZone) {
      // Zone transition
      if (this.activeZone !== 'none') {
        events.push({
          type: 'ZONE_HOVER_EXIT',
          zone: this.activeZone,
          timestamp: timestampMs,
        });
      }

      this.activeZone = zone;
      this.hasTriggeredInCurrentHover = false;

      if (zone !== 'none') {
        this.zoneHoverStartTime = timestampMs;
        events.push({
          type: 'ZONE_HOVER_START',
          zone,
          timestamp: timestampMs,
          rawPoint,
          filteredPoint,
        });
      } else {
        this.zoneHoverStartTime = null;
      }
    } else if (zone !== 'none' && this.zoneHoverStartTime !== null && !this.hasTriggeredInCurrentHover) {
      // Continuing hover in active edge zone
      const elapsed = timestampMs - this.zoneHoverStartTime;
      const progress = Math.min(1.0, elapsed / this.config.handHoldDurationMs);

      events.push({
        type: 'ZONE_HOVER_PROGRESS',
        zone,
        progress,
        elapsedMs: elapsed,
      });

      // Held for full hold duration (e.g. 1000ms) -> Select!
      if (progress >= 1.0) {
        this.hasTriggeredInCurrentHover = true;
        events.push({
          type: 'ZONE_SELECTED',
          zone,
          timestamp: timestampMs,
        });
      }
    }

    return events;
  }

  private evaluateZone(x: number): HoverZone {
    if (x < this.config.leftZoneRatio) {
      return 'left';
    }
    if (x > this.config.rightZoneRatio) {
      return 'right';
    }
    return 'none';
  }

  private handleHandLost(timestampMs: number, events: KioskInputEvent[]): void {
    if (this.activeZone !== 'none') {
      events.push({
        type: 'ZONE_HOVER_EXIT',
        zone: this.activeZone,
        timestamp: timestampMs,
      });
      this.activeZone = 'none';
      this.zoneHoverStartTime = null;
      this.hasTriggeredInCurrentHover = false;
    }
    this.filter.reset();
    this.lastRawPoint = null;
    this.lastFilteredPoint = null;
  }

  public getState(currentTimestampMs: number): HandTrackerState {
    let holdProgress = 0;
    if (this.activeZone !== 'none' && this.zoneHoverStartTime !== null) {
      const elapsed = currentTimestampMs - this.zoneHoverStartTime;
      holdProgress = Math.min(1.0, elapsed / this.config.handHoldDurationMs);
    }

    return {
      rawPoint: this.lastRawPoint ? { ...this.lastRawPoint } : null,
      filteredPoint: this.lastFilteredPoint ? { ...this.lastFilteredPoint } : null,
      currentZone: this.activeZone,
      holdProgress,
      isHolding: this.activeZone !== 'none' && holdProgress > 0,
    };
  }

  public reset(): void {
    this.filter.reset();
    this.activeZone = 'none';
    this.zoneHoverStartTime = null;
    this.hasTriggeredInCurrentHover = false;
    this.lastRawPoint = null;
    this.lastFilteredPoint = null;
  }
}
