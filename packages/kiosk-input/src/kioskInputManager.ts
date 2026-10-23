/**
 * DrTech.Care Kiosk Input Master Manager
 * Coordinates:
 * - Face presence & sitting detection with hysteresis
 * - Single-hand edge-zone pointing with One Euro filter
 * - Hands-free head nod confirmation
 * - Always-available touch and staff call fallbacks
 */

import {
  KioskInputConfig,
  DEFAULT_KIOSK_INPUT_CONFIG,
  KioskInputEvent,
  KioskInputEventListener,
  BoundingBox,
  Point2D,
} from './types.js';
import { FacePresenceTracker } from './presence.js';
import { SingleHandGestureTracker } from './handTracker.js';
import { HeadNodDetector } from './headNod.js';

export class KioskInputManager {
  private config: KioskInputConfig;
  private presenceTracker: FacePresenceTracker;
  private handTracker: SingleHandGestureTracker;
  private headNodDetector: HeadNodDetector;
  private listeners: Set<KioskInputEventListener> = new Set();
  private isIdleMode: boolean = true;

  constructor(config: Partial<KioskInputConfig> = {}) {
    this.config = { ...DEFAULT_KIOSK_INPUT_CONFIG, ...config };
    this.presenceTracker = new FacePresenceTracker(this.config);
    this.handTracker = new SingleHandGestureTracker(this.config);
    this.headNodDetector = new HeadNodDetector(this.config);
  }

  public setIdleMode(isIdle: boolean): void {
    this.isIdleMode = isIdle;
    if (isIdle) {
      // In screensaver/idle mode: reset hand and nod trackers to conserve resources
      this.handTracker.reset();
      this.headNodDetector.reset();
    }
  }

  public getIdleMode(): boolean {
    return this.isIdleMode;
  }

  public subscribe(listener: KioskInputEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(event: KioskInputEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  /**
   * Process face detection frame bounding box
   * PRIVACY INVARIANT: Never receives raw images in idle state
   */
  public processFaceDetection(faceBox: BoundingBox | null, timestampMs: number): void {
    const result = this.presenceTracker.update(faceBox, timestampMs);
    if (result.stateChanged && result.eventType) {
      this.emit({
        type: result.eventType,
        timestamp: timestampMs,
      });
    }
  }

  /**
   * Process single hand landmarks or pointing tip
   */
  public processHandLandmarks(handInput: Point2D[] | Point2D | null, timestampMs: number): void {
    // Only process hand gestures when not in screensaver mode
    if (this.isIdleMode) return;

    const events = this.handTracker.update(handInput, timestampMs);
    for (const ev of events) {
      this.emit(ev);
    }
  }

  /**
   * Process nose/head landmarks for hands-free confirmation
   */
  public processHeadPose(noseTip: Point2D | null, timestampMs: number): void {
    if (this.isIdleMode) return;

    const events = this.headNodDetector.update(noseTip, timestampMs);
    for (const ev of events) {
      this.emit(ev);
    }
  }

  /**
   * Always-Available Fallback: Touch button click on screen
   */
  public triggerTouchFallback(action: string, timestampMs: number = Date.now()): void {
    this.emit({
      type: 'TOUCH_FALLBACK',
      action,
      timestamp: timestampMs,
    });
  }

  /**
   * Always-Available Fallback: Emergency staff call button
   */
  public triggerStaffCall(timestampMs: number = Date.now()): void {
    this.emit({
      type: 'CALL_STAFF_FALLBACK',
      timestamp: timestampMs,
    });
  }

  public resetAll(): void {
    this.presenceTracker.reset();
    this.handTracker.reset();
    this.headNodDetector.reset();
    this.isIdleMode = true;
  }

  public getConfig(): Readonly<KioskInputConfig> {
    return { ...this.config };
  }
}
