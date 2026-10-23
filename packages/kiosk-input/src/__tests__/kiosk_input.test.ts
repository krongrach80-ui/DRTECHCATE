import { describe, it, expect, beforeEach } from 'vitest';
import {
  OneEuroFilter,
  OneEuroFilter2D,
  FacePresenceTracker,
  SingleHandGestureTracker,
  HeadNodDetector,
  KioskInputManager,
  KioskInputEvent,
  DEFAULT_KIOSK_INPUT_CONFIG,
} from '../index.js';

describe('[UNIT] DrTech.Care System 13: Kiosk Input & Gesture Processing Test Suite', () => {
  // =========================================================================
  // 1. One Euro Filter & Tremor Suppression
  // =========================================================================
  describe('1. One Euro Filter (Jitter & Physiological Tremor Suppression)', () => {
    it('1.1 Suppresses high-frequency hand tremors (>75% variance reduction)', () => {
      const filter = new OneEuroFilter(1.0, 0.007, 1.0);
      const truePosition = 0.5;
      const samplingRateHz = 60;
      const tremorFreqHz = 10; // 10 Hz resting/intention tremor
      const tremorAmplitude = 0.05;

      const rawSamples: number[] = [];
      const filteredSamples: number[] = [];

      let tMs = 1000;
      for (let i = 0; i < 60; i++) {
        // True static position + sinusoidal hand tremor
        const noise = tremorAmplitude * Math.sin(2 * Math.PI * tremorFreqHz * (i / samplingRateHz));
        const raw = truePosition + noise;
        const filtered = filter.filter(raw, tMs);

        rawSamples.push(raw);
        // Exclude first 5 frames of filter warmup
        if (i >= 5) {
          filteredSamples.push(filtered);
        }
        tMs += Math.round(1000 / samplingRateHz);
      }

      // Compute variances
      const rawMean = rawSamples.reduce((a, b) => a + b, 0) / rawSamples.length;
      const rawVariance =
        rawSamples.reduce((sum, v) => sum + Math.pow(v - rawMean, 2), 0) / rawSamples.length;

      const filteredMean =
        filteredSamples.reduce((a, b) => a + b, 0) / filteredSamples.length;
      const filteredVariance =
        filteredSamples.reduce((sum, v) => sum + Math.pow(v - filteredMean, 2), 0) /
        filteredSamples.length;

      // Variance must be reduced by more than 75%
      const reductionRatio = (rawVariance - filteredVariance) / rawVariance;
      expect(reductionRatio).toBeGreaterThan(0.75);
      expect(filteredVariance).toBeLessThan(rawVariance * 0.25);
    });

    it('1.2 2D Point Filter handles simultaneous X and Y filtering', () => {
      const filter2D = new OneEuroFilter2D(1.0, 0.007, 1.0);
      const p1 = filter2D.filter({ x: 0.2, y: 0.5 }, 1000);
      expect(p1.x).toBeCloseTo(0.2);
      expect(p1.y).toBeCloseTo(0.5);

      const p2 = filter2D.filter({ x: 0.25, y: 0.55 }, 1033);
      expect(p2.x).toBeGreaterThan(0.2);
      expect(p2.y).toBeGreaterThan(0.5);
    });
  });

  // =========================================================================
  // 2. Single-Hand Edge-Zone Gesture Tracking (Arm/Shoulder Injury Invariant)
  // =========================================================================
  describe('2. Single-Hand Edge-Zone Hover & Hold Tracking', () => {
    let tracker: SingleHandGestureTracker;

    beforeEach(() => {
      tracker = new SingleHandGestureTracker({
        handHoldDurationMs: 1000,
        leftZoneRatio: 0.25,
        rightZoneRatio: 0.75,
      });
    });

    it('2.1 Single-Hand Left Zone Selection: Hold for 1 second triggers ZONE_SELECTED', () => {
      const events: KioskInputEvent[] = [];

      // Frame 1: Finger enters left zone (x = 0.15 < 0.25) at t = 1000ms
      const ev1 = tracker.update({ x: 0.15, y: 0.5 }, 1000);
      events.push(...ev1);

      expect(events.some((e) => e.type === 'ZONE_HOVER_START' && e.zone === 'left')).toBe(true);

      // Frame 2: Still holding at t = 1500ms (500ms elapsed -> progress ~ 0.5)
      const ev2 = tracker.update({ x: 0.14, y: 0.51 }, 1500);
      events.push(...ev2);

      const progressEvent = events.find(
        (e) => e.type === 'ZONE_HOVER_PROGRESS' && e.progress >= 0.4
      );
      expect(progressEvent).toBeDefined();

      // Frame 3: Completed hold at t = 2050ms (>= 1000ms elapsed)
      const ev3 = tracker.update({ x: 0.15, y: 0.5 }, 2050);
      events.push(...ev3);

      const selectedEvent = events.find((e) => e.type === 'ZONE_SELECTED' && e.zone === 'left');
      expect(selectedEvent).toBeDefined();
    });

    it('2.2 Single-Hand Right Zone Selection: Hold for 1 second triggers ZONE_SELECTED right', () => {
      const events: KioskInputEvent[] = [];

      tracker.update({ x: 0.85, y: 0.5 }, 1000);
      tracker.update({ x: 0.86, y: 0.5 }, 1500);
      const evFinal = tracker.update({ x: 0.85, y: 0.5 }, 2050);
      events.push(...evFinal);

      const selected = events.find((e) => e.type === 'ZONE_SELECTED' && e.zone === 'right');
      expect(selected).toBeDefined();
    });

    it('2.3 Moving out of zone before 1 second cancels hold without false selection', () => {
      const events: KioskInputEvent[] = [];

      // Enter left zone at t = 1000ms
      tracker.update({ x: 0.15, y: 0.5 }, 1000);

      // Move away to center (x = 0.5) at t = 1600ms (only 600ms held)
      const evExit = tracker.update({ x: 0.5, y: 0.5 }, 1600);
      events.push(...evExit);

      expect(events.some((e) => e.type === 'ZONE_HOVER_EXIT' && e.zone === 'left')).toBe(true);
      expect(events.some((e) => e.type === 'ZONE_SELECTED')).toBe(false);
    });

    it('2.4 SPEC INVARIANT: Works with ONLY 1 hand input (Never requires two hands)', () => {
      // 21-element landmark array for a SINGLE hand
      const singleHand = Array.from({ length: 21 }, () => ({ x: 0.15, y: 0.4 }));

      // t = 1000
      tracker.update(singleHand, 1000);
      // t = 2050
      const ev = tracker.update(singleHand, 2050);

      const selected = ev.find((e) => e.type === 'ZONE_SELECTED');
      expect(selected).toBeDefined();
    });
  });

  // =========================================================================
  // 3. Hands-Free Head Nod Alternative (Paralyzed/Injured Arms)
  // =========================================================================
  describe('3. Hands-Free Head Nod Confirmation Detector', () => {
    it('3.1 Detects deliberate downward nod followed by return to neutral', () => {
      const nodDetector = new HeadNodDetector({
        nodAngleThresholdDeg: 12.0,
      });

      const events: KioskInputEvent[] = [];

      // Neutral head posture at t = 1000ms (nose y = 0.45)
      nodDetector.update({ x: 0.5, y: 0.45 }, 1000);

      // Downward dip at t = 1200ms (nose y moves to 0.55 -> pitch angle ~ 15 deg)
      nodDetector.update({ x: 0.5, y: 0.55 }, 1200);

      // Return upward toward neutral at t = 1450ms (nose y moves back to 0.46)
      const ev = nodDetector.update({ x: 0.5, y: 0.46 }, 1450);
      events.push(...ev);

      const nodConfirmed = events.find((e) => e.type === 'HEAD_NOD_CONFIRMED');
      expect(nodConfirmed).toBeDefined();
    });

    it('3.2 Debounce refractory period prevents accidental double-triggering', () => {
      const nodDetector = new HeadNodDetector();

      // First nod
      nodDetector.update({ x: 0.5, y: 0.45 }, 1000);
      nodDetector.update({ x: 0.5, y: 0.56 }, 1200);
      const ev1 = nodDetector.update({ x: 0.5, y: 0.46 }, 1400);
      expect(ev1.some((e) => e.type === 'HEAD_NOD_CONFIRMED')).toBe(true);

      // Immediate second movement within 800ms (< 1500ms debounce)
      nodDetector.update({ x: 0.5, y: 0.56 }, 1700);
      const ev2 = nodDetector.update({ x: 0.5, y: 0.46 }, 1900);
      expect(ev2.some((e) => e.type === 'HEAD_NOD_CONFIRMED')).toBe(false);
    });
  });

  // =========================================================================
  // 4. Face Presence & Sitting Detection (Hysteresis & Privacy)
  // =========================================================================
  describe('4. Face Presence Tracker with Hysteresis & Strict Privacy', () => {
    let presence: FacePresenceTracker;

    beforeEach(() => {
      presence = new FacePresenceTracker({
        facePresenceMinDurationMs: 1000,
        faceAbsenceHysteresisMs: 2000,
        minFaceSizeRatio: 0.10,
        maxFaceMotionVariance: 0.05,
      });
    });

    it('4.1 Declares presence only after face is still for >= 1000ms', () => {
      const faceBox = { x: 0.35, y: 0.25, width: 0.3, height: 0.4 };

      // Frame 1 at t = 1000ms
      const r1 = presence.update(faceBox, 1000);
      expect(r1.isPresent).toBe(false);

      // Frame 2 at t = 1500ms (500ms elapsed)
      const r2 = presence.update(faceBox, 1500);
      expect(r2.isPresent).toBe(false);

      // Frame 3 at t = 2050ms (1050ms elapsed >= 1000ms)
      const r3 = presence.update(faceBox, 2050);
      expect(r3.stateChanged).toBe(true);
      expect(r3.isPresent).toBe(true);
      expect(r3.eventType).toBe('PRESENCE_DETECTED');
    });

    it('4.2 Fast passing person (variance > 0.05) does NOT trigger presence', () => {
      // Fast movement across frames: x moves from 0.1 to 0.4 (delta 0.3 > 0.05)
      presence.update({ x: 0.1, y: 0.3, width: 0.3, height: 0.3 }, 1000);
      const r = presence.update({ x: 0.4, y: 0.3, width: 0.3, height: 0.3 }, 2050);
      expect(r.isPresent).toBe(false);
    });

    it('4.3 Hysteresis: Temporary face loss (<2000ms) does NOT drop presence', () => {
      const faceBox = { x: 0.35, y: 0.25, width: 0.3, height: 0.4 };

      // Establish presence
      presence.update(faceBox, 1000);
      presence.update(faceBox, 2050);
      expect(presence.getStatus(2050).isStablePresent).toBe(true);

      // Temporary drop at t = 2500ms (e.g. looking down for 800ms)
      const rDrop = presence.update(null, 2500);
      expect(rDrop.isPresent).toBe(true); // Still present due to hysteresis!

      // Face returns at t = 3000ms (within 2s window)
      const rReturn = presence.update(faceBox, 3000);
      expect(rReturn.isPresent).toBe(true);
    });

    it('4.4 Absence exceeding 2000ms hysteresis fires PRESENCE_LOST', () => {
      const faceBox = { x: 0.35, y: 0.25, width: 0.3, height: 0.4 };

      presence.update(faceBox, 1000);
      presence.update(faceBox, 2050);

      // Patient walked away at t = 3000ms
      presence.update(null, 3000);
      // t = 4500ms (1500ms absent - still within 2000ms)
      const r1 = presence.update(null, 4500);
      expect(r1.isPresent).toBe(true);

      // t = 5100ms (2100ms absent > 2000ms) -> PRESENCE_LOST!
      const r2 = presence.update(null, 5100);
      expect(r2.stateChanged).toBe(true);
      expect(r2.isPresent).toBe(false);
      expect(r2.eventType).toBe('PRESENCE_LOST');
    });

    it('4.5 PRIVACY INVARIANT: captureImagesDuringIdle is strictly false', () => {
      expect(DEFAULT_KIOSK_INPUT_CONFIG.captureImagesDuringIdle).toBe(false);
    });
  });

  // =========================================================================
  // 5. Always-Available Touch & Staff Call Fallbacks
  // =========================================================================
  describe('5. Always-Available Fallback Triggers (Touch & Staff Call)', () => {
    it('5.1 Manual screen touch fallback fires TOUCH_FALLBACK event', () => {
      const manager = new KioskInputManager();
      const events: KioskInputEvent[] = [];
      manager.subscribe((ev) => events.push(ev));

      manager.triggerTouchFallback('confirm_button');
      expect(events.length).toBe(1);
      expect(events[0].type).toBe('TOUCH_FALLBACK');
      expect((events[0] as { action: string }).action).toBe('confirm_button');
    });

    it('5.2 Emergency staff call fallback fires CALL_STAFF_FALLBACK event', () => {
      const manager = new KioskInputManager();
      const events: KioskInputEvent[] = [];
      manager.subscribe((ev) => events.push(ev));

      manager.triggerStaffCall();
      expect(events.length).toBe(1);
      expect(events[0].type).toBe('CALL_STAFF_FALLBACK');
    });
  });
});
