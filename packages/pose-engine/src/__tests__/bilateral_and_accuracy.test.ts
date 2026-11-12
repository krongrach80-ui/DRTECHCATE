/**
 * packages/pose-engine/src/__tests__/bilateral_and_accuracy.test.ts
 *
 * Comprehensive Test Suite for Pose Engine Biomechanics & Laterality Upgrade:
 * 1. Strict Bilateral AND Logic: Both limbs must reach target simultaneously (1 side = 0 reps + cue).
 * 2. Unilateral Mirror Alignment: Correct anatomical side resolves deterministically.
 * 3. Holding Target Hysteresis Buffer: Micro-jitter (±3°–±4°) does not reset hold timer.
 * 4. Seated Upper-Body Mode: Missing hips (vis=0) uses vertical gravity fallback without false plane warnings.
 * 5. Full 26 Clinical Exercises laterality mode regression check.
 */

import { describe, it, expect } from 'vitest';
import { RepStateMachine } from '../engine/repStateMachine';
import { SHOULDER_ABDUCTION_PRESET } from '../presets/shoulderPendulumPreset';
import { CLINICAL_EXERCISES_CONFIG } from '../presets/exercises.config';
import { PoseEngineLandmark, ExerciseConfig } from '../types/exerciseConfig';

function createMockSkeleton(): PoseEngineLandmark[] {
  return Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.5,
    z: 0.0,
    visibility: 0.95,
    presence: 0.95,
  }));
}

function buildRestingSkeleton(): PoseEngineLandmark[] {
  const skel = createMockSkeleton();
  // Left arm resting down: Shoulder 11 (0.6, 0.3), Elbow 13 (0.61, 0.45), Wrist 15 (0.62, 0.6)
  // Left hip 23 (0.6, 0.6)
  skel[11] = { x: 0.6, y: 0.3, z: 0.0, visibility: 0.95 };
  skel[13] = { x: 0.61, y: 0.45, z: 0.0, visibility: 0.95 };
  skel[15] = { x: 0.62, y: 0.6, z: 0.0, visibility: 0.95 };
  skel[23] = { x: 0.6, y: 0.6, z: 0.0, visibility: 0.95 };

  // Right arm resting down: Shoulder 12 (0.4, 0.3), Elbow 14 (0.39, 0.45), Wrist 16 (0.38, 0.6)
  // Right hip 24 (0.4, 0.6)
  skel[12] = { x: 0.4, y: 0.3, z: 0.0, visibility: 0.95 };
  skel[14] = { x: 0.39, y: 0.45, z: 0.0, visibility: 0.95 };
  skel[16] = { x: 0.38, y: 0.6, z: 0.0, visibility: 0.95 };
  skel[24] = { x: 0.4, y: 0.6, z: 0.0, visibility: 0.95 };

  return skel;
}

describe('Pose Engine Biomechanics & Laterality Upgrade Test Suite', () => {
  // =========================================================================
  // 1. Strict Bilateral AND Logic
  // =========================================================================
  describe('1. Strict Bilateral AND Logic Enforcement', () => {
    it('1.1 Moving ONLY Left arm during bilateral mode counts 0 reps and shows sync coaching cue', () => {
      const config: ExerciseConfig = {
        ...SHOULDER_ABDUCTION_PRESET,
        side: 'bilateral',
        lateralityMode: 'unilateral_or_bilateral',
        defaultPrescription: { repsPerSet: 5, totalSets: 1, restBetweenSetsSec: 30 },
        angleMechanics: {
          ...SHOULDER_ABDUCTION_PRESET.angleMechanics!,
          holdDurationSec: 0.3,
        },
      };

      const machine = new RepStateMachine(config);
      let currentTime = 1000;

      const skelResting = buildRestingSkeleton();
      machine.evaluate(skelResting, currentTime);

      // Left arm moves to 90° abduction (lateral lift)
      // Right arm stays resting down
      const skelLeftOnly = buildRestingSkeleton();
      skelLeftOnly[13] = { x: 0.75, y: 0.3, z: 0.0, visibility: 0.95 };
      skelLeftOnly[15] = { x: 0.9, y: 0.3, z: 0.0, visibility: 0.95 };

      let lastRes = machine.evaluate(skelLeftOnly, currentTime);
      for (let i = 0; i < 5; i++) {
        currentTime += 100;
        lastRes = machine.evaluate(skelLeftOnly, currentTime);
      }

      // Must NOT enter HOLDING_TARGET because right arm is stationary
      expect(lastRes.phase).not.toBe('HOLDING_TARGET');
      expect(lastRes.completedReps).toBe(0);
      expect(lastRes.coachingMessageTh).toContain('กรุณาทำพร้อมกันทั้งสองข้าง');
    });

    it('1.2 Moving ONLY Right arm during bilateral mode counts 0 reps and shows sync coaching cue', () => {
      const config: ExerciseConfig = {
        ...SHOULDER_ABDUCTION_PRESET,
        side: 'bilateral',
        lateralityMode: 'unilateral_or_bilateral',
        defaultPrescription: { repsPerSet: 5, totalSets: 1, restBetweenSetsSec: 30 },
        angleMechanics: {
          ...SHOULDER_ABDUCTION_PRESET.angleMechanics!,
          holdDurationSec: 0.3,
        },
      };

      const machine = new RepStateMachine(config);
      let currentTime = 1000;

      const skelResting = buildRestingSkeleton();
      machine.evaluate(skelResting, currentTime);

      // Right arm moves to 90° abduction (lateral lift)
      // Left arm stays resting down
      const skelRightOnly = buildRestingSkeleton();
      skelRightOnly[14] = { x: 0.25, y: 0.3, z: 0.0, visibility: 0.95 };
      skelRightOnly[16] = { x: 0.1, y: 0.3, z: 0.0, visibility: 0.95 };

      let lastRes = machine.evaluate(skelRightOnly, currentTime);
      for (let i = 0; i < 5; i++) {
        currentTime += 100;
        lastRes = machine.evaluate(skelRightOnly, currentTime);
      }

      // Must NOT enter HOLDING_TARGET because left arm is stationary
      expect(lastRes.phase).not.toBe('HOLDING_TARGET');
      expect(lastRes.completedReps).toBe(0);
      expect(lastRes.coachingMessageTh).toContain('กรุณาทำพร้อมกันทั้งสองข้าง');
    });

    it('1.3 Moving BOTH arms simultaneously to target zone holds and completes repetition', () => {
      const config: ExerciseConfig = {
        ...SHOULDER_ABDUCTION_PRESET,
        side: 'bilateral',
        lateralityMode: 'unilateral_or_bilateral',
        defaultPrescription: { repsPerSet: 5, totalSets: 1, restBetweenSetsSec: 30 },
        angleMechanics: {
          ...SHOULDER_ABDUCTION_PRESET.angleMechanics!,
          holdDurationSec: 0.2,
        },
      };

      const machine = new RepStateMachine(config);
      let currentTime = 1000;

      const skelResting = buildRestingSkeleton();
      machine.evaluate(skelResting, currentTime);

      // Both arms move to 90° abduction simultaneously
      const skelBothTarget = buildRestingSkeleton();
      skelBothTarget[13] = { x: 0.75, y: 0.3, z: 0.0, visibility: 0.95 };
      skelBothTarget[15] = { x: 0.9, y: 0.3, z: 0.0, visibility: 0.95 };
      skelBothTarget[14] = { x: 0.25, y: 0.3, z: 0.0, visibility: 0.95 };
      skelBothTarget[16] = { x: 0.1, y: 0.3, z: 0.0, visibility: 0.95 };

      // Transition to target
      let res = machine.evaluate(skelBothTarget, currentTime);
      for (let i = 0; i < 4; i++) {
        currentTime += 80;
        res = machine.evaluate(skelBothTarget, currentTime);
      }

      expect(res.phase).toBe('HOLDING_TARGET');

      // Hold for >= holdDurationSec (200ms)
      currentTime += 250;
      res = machine.evaluate(skelBothTarget, currentTime);
      expect(res.phase).toBe('RETURNING_TO_START');

      // Return both arms to start
      for (let i = 0; i < 4; i++) {
        currentTime += 80;
        res = machine.evaluate(skelResting, currentTime);
      }

      expect(res.completedReps).toBe(1);
      expect(res.accuracyPercent).toBeGreaterThanOrEqual(80);
    });
  });

  // =========================================================================
  // 2. Unilateral Mirror Alignment
  // =========================================================================
  describe('2. Unilateral Mirror Alignment', () => {
    it('2.1 Prescribed Right arm: raising right arm completes rep, raising left arm blocks rep', () => {
      const config: ExerciseConfig = {
        ...SHOULDER_ABDUCTION_PRESET,
        side: 'right',
        lateralityMode: 'unilateral_or_bilateral',
        defaultPrescription: { repsPerSet: 5, totalSets: 1, restBetweenSetsSec: 30 },
        angleMechanics: {
          ...SHOULDER_ABDUCTION_PRESET.angleMechanics!,
          holdDurationSec: 0.2,
        },
      };

      const machine = new RepStateMachine(config);
      let currentTime = 1000;

      const skelResting = buildRestingSkeleton();
      machine.evaluate(skelResting, currentTime);

      // Test Left arm movement (Wrong side)
      const skelLeftOnly = buildRestingSkeleton();
      skelLeftOnly[13] = { x: 0.75, y: 0.3, z: 0.0, visibility: 0.95 };
      skelLeftOnly[15] = { x: 0.9, y: 0.3, z: 0.0, visibility: 0.95 };

      let lastResWrong = machine.evaluate(skelLeftOnly, currentTime);
      for (let i = 0; i < 4; i++) {
        currentTime += 80;
        lastResWrong = machine.evaluate(skelLeftOnly, currentTime);
        expect(lastResWrong.completedReps).toBe(0);
        expect(lastResWrong.phase).not.toBe('HOLDING_TARGET');
      }
      expect(lastResWrong.coachingMessageTh).toContain('กรุณาใช้แขนข้างขวา');

      // Now reset and perform with Right arm (Correct side)
      machine.reset();
      currentTime = 5000;
      machine.evaluate(skelResting, currentTime);

      const skelRightOnly = buildRestingSkeleton();
      skelRightOnly[14] = { x: 0.25, y: 0.3, z: 0.0, visibility: 0.95 };
      skelRightOnly[16] = { x: 0.1, y: 0.3, z: 0.0, visibility: 0.95 };

      for (let i = 0; i < 4; i++) {
        currentTime += 80;
        machine.evaluate(skelRightOnly, currentTime);
      }

      currentTime += 250; // Hold satisfied
      let resCorrect = machine.evaluate(skelRightOnly, currentTime);
      expect(resCorrect.phase).toBe('RETURNING_TO_START');

      for (let i = 0; i < 4; i++) {
        currentTime += 80;
        resCorrect = machine.evaluate(skelResting, currentTime);
      }

      expect(resCorrect.completedReps).toBe(1);
    });
  });

  // =========================================================================
  // 3. Holding Target Hysteresis Buffer & Micro-Jitter
  // =========================================================================
  describe('3. Holding Target Hysteresis Buffer & Micro-Jitter', () => {
    it('3.1 Wobble of ±3°–±4° during HOLDING_TARGET does not drop hold state', () => {
      const config: ExerciseConfig = {
        ...SHOULDER_ABDUCTION_PRESET,
        side: 'right',
        defaultPrescription: { repsPerSet: 5, totalSets: 1, restBetweenSetsSec: 30 },
        angleMechanics: {
          ...SHOULDER_ABDUCTION_PRESET.angleMechanics!,
          targetMinDeg: 80,
          targetMaxDeg: 100,
          toleranceDeg: 5,
          holdDurationSec: 0.5,
        },
      };

      const machine = new RepStateMachine(config);
      let currentTime = 1000;

      const skelResting = buildRestingSkeleton();
      machine.evaluate(skelResting, currentTime);

      // Right arm at 85° (inside target zone)
      const skelTarget = buildRestingSkeleton();
      skelTarget[14] = { x: 0.25, y: 0.3, z: 0.0, visibility: 0.95 };
      skelTarget[16] = { x: 0.1, y: 0.3, z: 0.0, visibility: 0.95 };

      for (let i = 0; i < 4; i++) {
        currentTime += 80;
        machine.evaluate(skelTarget, currentTime);
      }

      let res = machine.evaluate(skelTarget, currentTime);
      expect(res.phase).toBe('HOLDING_TARGET');

      // Introduce micro-jitter slightly below target zone: 72° (outside 75° standard tolerance but within 4° hysteresis)
      // Shoulder (0.4, 0.3), wrist lowered slightly
      const skelJitter = buildRestingSkeleton();
      skelJitter[14] = { x: 0.27, y: 0.34, z: 0.0, visibility: 0.95 };
      skelJitter[16] = { x: 0.14, y: 0.38, z: 0.0, visibility: 0.95 };

      // Apply jitter for 2 frames
      currentTime += 60;
      res = machine.evaluate(skelJitter, currentTime);
      expect(res.phase).toBe('HOLDING_TARGET');

      currentTime += 60;
      res = machine.evaluate(skelJitter, currentTime);
      expect(res.phase).toBe('HOLDING_TARGET');

      // Return into exact target zone and complete hold
      currentTime += 400;
      res = machine.evaluate(skelTarget, currentTime);
      expect(res.phase).toBe('RETURNING_TO_START');
    });
  });

  // =========================================================================
  // 4. Seated Upper-Body Mode (Missing Hips)
  // =========================================================================
  describe('4. Seated Upper-Body Mode (Vertical Gravity Vector Fallback)', () => {
    it('4.1 Completes repetition when hips are not visible (vis=0) without false plane warnings', () => {
      const config: ExerciseConfig = {
        ...SHOULDER_ABDUCTION_PRESET,
        side: 'right',
        defaultPrescription: { repsPerSet: 5, totalSets: 1, restBetweenSetsSec: 30 },
        angleMechanics: {
          ...SHOULDER_ABDUCTION_PRESET.angleMechanics!,
          holdDurationSec: 0.2,
        },
      };

      const machine = new RepStateMachine(config);
      let currentTime = 1000;

      // Seated skeleton: hips completely cut off below frame
      const skelSeatedRest = buildRestingSkeleton();
      skelSeatedRest[23] = { x: 0.6, y: 1.1, z: 0.0, visibility: 0.0 };
      skelSeatedRest[24] = { x: 0.4, y: 1.1, z: 0.0, visibility: 0.0 };

      let res = machine.evaluate(skelSeatedRest, currentTime);
      // In IDLE/START with missing hips, must NOT trigger false wrong plane warnings
      expect(res.activeWarnings.some((w) => w.ruleId === 'wrong_elevation_plane')).toBe(false);
      expect(res.coachingMessageTh).not.toContain('ทำผิดท่า: ให้กางแขนออกด้านข้าง');

      // Right arm raises laterally to 90°
      const skelSeatedTarget = buildRestingSkeleton();
      skelSeatedTarget[23] = { x: 0.6, y: 1.1, z: 0.0, visibility: 0.0 };
      skelSeatedTarget[24] = { x: 0.4, y: 1.1, z: 0.0, visibility: 0.0 };
      skelSeatedTarget[14] = { x: 0.25, y: 0.3, z: 0.0, visibility: 0.95 };
      skelSeatedTarget[16] = { x: 0.1, y: 0.3, z: 0.0, visibility: 0.95 };

      for (let i = 0; i < 4; i++) {
        currentTime += 80;
        res = machine.evaluate(skelSeatedTarget, currentTime);
      }

      expect(res.phase).toBe('HOLDING_TARGET');
      expect(res.activeWarnings.some((w) => w.ruleId === 'wrong_elevation_plane')).toBe(false);

      currentTime += 250;
      res = machine.evaluate(skelSeatedTarget, currentTime);
      expect(res.phase).toBe('RETURNING_TO_START');

      for (let i = 0; i < 4; i++) {
        currentTime += 80;
        res = machine.evaluate(skelSeatedRest, currentTime);
      }

      expect(res.completedReps).toBe(1);
    });
  });

  // =========================================================================
  // 5. All 26 Clinical Exercises Laterality Mode Regression
  // =========================================================================
  describe('5. All 26 Exercises Laterality Mode Coverage', () => {
    it('5.1 Every exercise in CLINICAL_EXERCISES_CONFIG has an explicit valid lateralityMode', () => {
      const keys = Object.keys(CLINICAL_EXERCISES_CONFIG);
      expect(keys.length).toBeGreaterThanOrEqual(26);

      const validModes = new Set([
        'unilateral_or_bilateral',
        'inherently_bilateral',
        'bilateral_alternating',
      ]);

      const inherentlyBilateralIds = [
        'mini-squat',
        'sit-to-stand',
        'wall-pushup',
        'chin-tuck',
        'scapular-retraction',
        'shoulder-shrug',
      ];

      for (const id of inherentlyBilateralIds) {
        const cfg = CLINICAL_EXERCISES_CONFIG[id];
        expect(cfg).toBeDefined();
        expect(cfg.lateralityMode).toBe('inherently_bilateral');
      }

      const alternatingIds = [
        'cervical-rotation',
        'cervical-lateral-flexion',
        'seated-cervical-rotation',
        'cervical-side-bend',
        'trunk-rotation',
        'trunk-lateral-flexion',
      ];

      for (const id of alternatingIds) {
        const cfg = CLINICAL_EXERCISES_CONFIG[id];
        if (cfg) {
          expect(cfg.lateralityMode).toBe('bilateral_alternating');
        }
      }

      for (const [id, cfg] of Object.entries(CLINICAL_EXERCISES_CONFIG)) {
        expect(
          validModes.has(cfg.lateralityMode || ''),
          `Exercise "${id}" must have a valid lateralityMode, got: ${cfg.lateralityMode}`
        ).toBe(true);
      }
    });
  });
});
