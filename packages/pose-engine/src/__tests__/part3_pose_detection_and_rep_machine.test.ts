import { describe, it, expect } from 'vitest';
import { calculateAngle2D, calculateAngle3D } from '../math/geometry3d';
import {
  ClinicalOneEuroLandmarkFilter,
  OneEuroScalarFilter,
  ONE_EURO_MISSING_RESET_MS,
} from '../math/oneEuroFilter';
import {
  RepStateMachine,
  HOLD_MAX_GRACE_FRAMES,
  REP_DEBOUNCE_MS,
  NO_POSE_COACHING_TH,
} from '../engine/repStateMachine';
import { CLINICAL_EXERCISES_CONFIG } from '../presets/exercises.config';
import { PoseEngineLandmark } from '../types/exerciseConfig';

function makeStandingSkeleton(leftShoulderAngleDeg = 15, rightShoulderAngleDeg = 15): PoseEngineLandmark[] {
  const lms: PoseEngineLandmark[] = Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.5,
    z: 0,
    visibility: 0.95,
    presence: 0.95,
  }));

  // Shoulders & hips (upright torso facing camera)
  lms[11] = { x: 0.62, y: 0.35, z: 0, visibility: 0.98, presence: 0.98 };
  lms[12] = { x: 0.38, y: 0.35, z: 0, visibility: 0.98, presence: 0.98 };
  lms[23] = { x: 0.58, y: 0.65, z: 0, visibility: 0.98, presence: 0.98 };
  lms[24] = { x: 0.42, y: 0.65, z: 0, visibility: 0.98, presence: 0.98 };

  // Flexion in sagittal plane: forward (+Z = towards camera -> -z in MediaPipe), upward (-y)
  const radL = (leftShoulderAngleDeg * Math.PI) / 180;
  const upperLen = 0.16;
  const foreLen = 0.16;
  // Left shoulder abduction/flexion approximation (with straight elbow for clean 3D angle around shoulder)
  lms[13] = {
    x: lms[11].x + Math.sin(radL) * upperLen,
    y: lms[11].y + Math.cos(radL) * upperLen,
    z: -0.02,
    visibility: 0.96,
  };
  lms[15] = {
    x: lms[13].x + Math.sin(radL) * foreLen,
    y: lms[13].y + Math.cos(radL) * foreLen,
    z: -0.02,
    visibility: 0.96,
  };

  const radR = (rightShoulderAngleDeg * Math.PI) / 180;
  lms[14] = {
    x: lms[12].x - Math.sin(radR) * upperLen,
    y: lms[12].y + Math.cos(radR) * upperLen,
    z: -0.02,
    visibility: 0.96,
  };
  lms[16] = {
    x: lms[14].x - Math.sin(radR) * foreLen,
    y: lms[14].y + Math.cos(radR) * foreLen,
    z: -0.02,
    visibility: 0.96,
  };

  return lms;
}

describe('Part 3 Verification: Geometry, One Euro Filter & Robust RepStateMachine', () => {
  describe('1. Angle Geometry (2D & 3D + Edge Cases)', () => {
    it('calculates exact 90° and 180° in 2D and 3D', () => {
      const a90 = { x: 0, y: 1, z: 0 };
      const v90 = { x: 0, y: 0, z: 0 };
      const b90 = { x: 1, y: 0, z: 0 };
      expect(calculateAngle2D(a90, v90, b90)).toBeCloseTo(90, 5);
      expect(calculateAngle3D(a90, v90, b90)).toBeCloseTo(90, 5);

      const a180 = { x: -1, y: 0, z: 0 };
      const b180 = { x: 1, y: 0, z: 0 };
      expect(calculateAngle2D(a180, v90, b180)).toBeCloseTo(180, 5);
      expect(calculateAngle3D(a180, v90, b180)).toBeCloseTo(180, 5);
    });

    it('handles zero-length vectors, NaN, and null/undefined without throwing or returning NaN', () => {
      const zero = { x: 0.5, y: 0.5, z: 0.5 };
      expect(calculateAngle2D(zero, zero, zero)).toBe(0);
      expect(calculateAngle3D(zero, zero, zero)).toBe(0);

      expect(calculateAngle2D(null as any, zero, zero)).toBe(0);
      expect(calculateAngle3D(undefined as any, zero, zero)).toBe(0);

      const nanPt = { x: Number.NaN, y: 0, z: 0 };
      const res2 = calculateAngle2D(nanPt, zero, { x: 1, y: 0, z: 0 });
      const res3 = calculateAngle3D(nanPt, zero, { x: 1, y: 0, z: 0 });
      expect(Number.isNaN(res2)).toBe(false);
      expect(Number.isNaN(res3)).toBe(false);
      expect(res2).toBe(0);
      expect(res3).toBe(0);
    });
  });

  describe('2. One Euro Filter (Stability, Variance Reduction, Reset)', () => {
    it('preserves constant signal accurately', () => {
      const filter = new OneEuroScalarFilter(1.0, 0.04, 1.0);
      let out = 0;
      for (let i = 0; i < 20; i++) {
        out = filter.filter(42.5, i * 33);
      }
      expect(out).toBeCloseTo(42.5, 5);
    });

    it('reduces variance of high-frequency noisy signal', () => {
      const filter = new OneEuroScalarFilter(1.0, 0.04, 1.0);
      const raw: number[] = [];
      const filtered: number[] = [];

      for (let i = 0; i < 60; i++) {
        const val = 0.5 + (i % 2 === 0 ? 0.05 : -0.05);
        raw.push(val);
        filtered.push(filter.filter(val, i * 33));
      }

      const calcVar = (arr: number[]) => {
        const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
        return arr.reduce((sum, x) => sum + (x - mean) ** 2, 0) / arr.length;
      };

      expect(calcVar(filtered.slice(10))).toBeLessThan(calcVar(raw.slice(10)) * 0.35);
    });

    it('reset() clears stale filter memory completely', () => {
      const filter = new OneEuroScalarFilter(1.0, 0.04, 1.0);
      for (let i = 0; i < 10; i++) {
        filter.filter(100, i * 33);
      }
      filter.reset();
      const firstAfterReset = filter.filter(10, 1000);
      expect(firstAfterReset).toBe(10);
    });

    it('ClinicalOneEuroLandmarkFilter auto-resets after missing gap and supports 3D world coordinates', () => {
      const worldFilter = new ClinicalOneEuroLandmarkFilter({
        coordinateSpace: 'world',
      });
      const world1: PoseEngineLandmark[] = Array.from({ length: 33 }, () => ({
        x: -0.35,
        y: 1.45,
        z: -0.22,
        visibility: 0.9,
      }));
      const out1 = worldFilter.filter(world1, 100);
      // Should NOT clamp negative / > 1 world meters to [0.01, 0.99]
      expect(out1[0].x).toBeCloseTo(-0.35, 3);
      expect(out1[0].y).toBeCloseTo(1.45, 3);

      // Simulate person leaving and returning after ONE_EURO_MISSING_RESET_MS
      const world2: PoseEngineLandmark[] = Array.from({ length: 33 }, () => ({
        x: 0.5,
        y: -0.8,
        z: 0.4,
        visibility: 0.9,
      }));
      const out2 = worldFilter.filter(world2, 100 + ONE_EURO_MISSING_RESET_MS + 100);
      expect(out2[0].x).toBeCloseTo(0.5, 4);
      expect(out2[0].y).toBeCloseTo(-0.8, 4);
    });
  });

  describe('3. RepStateMachine (Full Rep, Dynamic Unilateral, Grace Frames, Hysteresis, Debounce)', () => {
    it('counts 1 rep when performing a valid unilateral movement even when config side is bilateral', () => {
      const cfg = {
        ...CLINICAL_EXERCISES_CONFIG['shoulder-abduction'],
        side: 'bilateral' as const,
        allowDynamicUnilateral: true,
        elevationPlane: undefined,
      };
      const sm = new RepStateMachine(cfg);

      // Start neutral
      for (let t = 0; t < 300; t += 33) {
        sm.evaluate(makeStandingSkeleton(10, 10), t);
      }

      // Lift ONLY right arm to target ~120 deg (left stays down)
      let peakRes: any = null;
      for (let t = 330; t < 2000; t += 33) {
        peakRes = sm.evaluate(makeStandingSkeleton(10, 125), t);
      }
      expect(['HOLDING_TARGET', 'RETURNING_TO_START']).toContain(peakRes.phase);
      expect(peakRes.debugInfo?.resolvedSide).toBe('right');

      // Return right arm to start
      let endRes: any = null;
      for (let t = 2033; t < 2600; t += 33) {
        endRes = sm.evaluate(makeStandingSkeleton(10, 10), t);
      }
      expect(endRes.completedReps).toBe(1);
    });

    it('does not count below-target movement', () => {
      const cfg = {
        ...CLINICAL_EXERCISES_CONFIG['shoulder-abduction'],
        side: 'left' as const,
        elevationPlane: undefined,
      };
      const sm = new RepStateMachine(cfg);

      for (let t = 0; t < 200; t += 33) {
        sm.evaluate(makeStandingSkeleton(10, 10), t);
      }
      // Partial lift (~50 deg vs target 95-100+)
      for (let t = 233; t < 1800; t += 33) {
        sm.evaluate(makeStandingSkeleton(50, 10), t);
      }
      let endRes: any = null;
      for (let t = 1833; t < 2400; t += 33) {
        endRes = sm.evaluate(makeStandingSkeleton(10, 10), t);
      }
      expect(endRes.completedReps).toBe(0);
    });

    it('maintains HOLDING_TARGET across brief landmark dropout <= 5 grace frames and completes rep + next rep after debounce', () => {
      const cfg = {
        ...CLINICAL_EXERCISES_CONFIG['shoulder-abduction'],
        side: 'left' as const,
        elevationPlane: undefined,
        angleMechanics: {
          ...CLINICAL_EXERCISES_CONFIG['shoulder-abduction'].angleMechanics!,
          holdDurationSec: 0.6,
        },
      };
      const sm = new RepStateMachine(cfg);

      let t = 0;
      const step = 40;
      const runFrames = (count: number, angleDeg: number, vis = 0.96) => {
        let last: any;
        for (let i = 0; i < count; i++) {
          const skel = makeStandingSkeleton(angleDeg, 10);
          skel[15] = { ...skel[15], visibility: vis };
          last = sm.evaluate(skel, t);
          t += step;
        }
        return last;
      };

      // Neutral
      runFrames(6, 10);
      // Enter target (110 deg) and hold briefly
      const inHold = runFrames(6, 115);
      expect(inHold.phase).toBe('HOLDING_TARGET');

      // Transient visibility dropout for 3 frames (<= HOLD_MAX_GRACE_FRAMES = 5)
      const duringDropout = runFrames(Math.min(3, HOLD_MAX_GRACE_FRAMES), 75, 0.15);
      expect(duringDropout.phase).toBe('HOLDING_TARGET');

      // Finish hold in target zone
      runFrames(12, 115);
      // Return to start -> rep 1
      const afterRep1 = runFrames(8, 10);
      expect(afterRep1.completedReps).toBe(1);

      // Advance past REP_DEBOUNCE_MS and perform rep 2 with slight jitter inside hysteresis buffer
      t += REP_DEBOUNCE_MS + 50;
      runFrames(4, 10);
      runFrames(18, 115);
      const afterRep2 = runFrames(8, 10);
      expect(afterRep2.completedReps).toBe(2);
    });

    it('detects shoulder-er-band external rotation in 3D world coordinates when elbow stays ~90°', () => {
      const cfg = {
        ...CLINICAL_EXERCISES_CONFIG['shoulder-er-band'],
        side: 'left' as const,
      };
      const sm = new RepStateMachine(cfg);

      const makeErWorldFrame = (forearmOutwardX: number, forearmForwardZ: number) => {
        const norm = makeStandingSkeleton(15, 15);
        norm[13] = { x: 0.63, y: 0.51, z: 0, visibility: 0.96 };
        norm[15] = { x: 0.63 + forearmOutwardX * 0.5, y: 0.51, z: forearmForwardZ * 0.5, visibility: 0.96 };
        const world: PoseEngineLandmark[] = Array.from({ length: 33 }, () => ({
          x: 0,
          y: 0,
          z: 0,
          visibility: 0.96,
        }));
        world[11] = { x: 0.18, y: -0.25, z: 0, visibility: 0.96 };
        world[12] = { x: -0.18, y: -0.25, z: 0, visibility: 0.96 };
        // Elbow straight down beside torso (-0.25 -> 0.03)
        world[13] = { x: 0.18, y: 0.03, z: 0, visibility: 0.96 };
        // Forearm horizontal: elbow flexion = 90° regardless of rotation!
        world[15] = { x: 0.18 + forearmOutwardX, y: 0.03, z: forearmForwardZ, visibility: 0.96 };
        world[23] = { x: 0.12, y: 0.25, z: 0, visibility: 0.96 };
        world[24] = { x: -0.12, y: 0.25, z: 0, visibility: 0.96 };
        return { norm, world };
      };

      let t = 0;
      // Start neutral: forearm pointing straight forward (-z = -0.24, outwardX = 0.02)
      for (let i = 0; i < 8; i++) {
        const f = makeErWorldFrame(0.02, -0.24);
        sm.evaluate(f.norm, t, f.world);
        t += 40;
      }

      // Externally rotate forearm ~55 deg outward and hold >= 2.0s (60 frames * 40ms = 2.4s)
      let peak: any = null;
      for (let i = 0; i < 65; i++) {
        const f = makeErWorldFrame(0.20, -0.13);
        peak = sm.evaluate(f.norm, t, f.world);
        t += 40;
      }
      expect(peak.debugInfo?.used3DWorld).toBe(true);
      expect(peak.currentAngleDeg).toBeGreaterThanOrEqual(35);

      // Return to neutral start
      let end: any = null;
      for (let i = 0; i < 15; i++) {
        const f = makeErWorldFrame(0.02, -0.24);
        end = sm.evaluate(f.norm, t, f.world);
        t += 40;
      }
      expect(end.completedReps).toBe(1);
    });
  });

  describe('4. Missing / Low-Visibility Failure Cases & Diagnostics', () => {
    it('handles null, undefined, and empty landmarks gracefully without throwing and returns "ไม่พบท่าทาง"', () => {
      const cfg = CLINICAL_EXERCISES_CONFIG['active-shoulder-flexion'];
      const sm = new RepStateMachine(cfg);

      for (const badInput of [null, undefined, []] as any[]) {
        const res = sm.evaluate(badInput, 100);
        expect(res).toBeDefined();
        expect(res.completedReps).toBe(0);
        expect(res.coachingMessageTh).toContain(NO_POSE_COACHING_TH);
        expect(res.debugInfo?.failReasonTh).toContain(NO_POSE_COACHING_TH);
      }
    });

    it('handles all-low-visibility landmarks without throwing or false rep counting', () => {
      const cfg = CLINICAL_EXERCISES_CONFIG['active-shoulder-flexion'];
      const sm = new RepStateMachine(cfg);

      const invisible = makeStandingSkeleton(140, 140).map((lm) => ({
        ...lm,
        visibility: 0.05,
        presence: 0.05,
      }));
      const res = sm.evaluate(invisible, 100);
      expect(res.completedReps).toBe(0);
      expect(res.coachingMessageTh).toContain(NO_POSE_COACHING_TH);
      expect(res.debugInfo?.minLandmarkVisibility).toBe(0);
    });
  });
});
