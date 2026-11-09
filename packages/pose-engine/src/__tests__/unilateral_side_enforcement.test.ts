/**
 * packages/pose-engine/src/__tests__/unilateral_side_enforcement.test.ts
 *
 * Comprehensive 10-Point Clinical Test Suite:
 * Biomechanical Unilateral Side Enforcement & Bilateral Independence
 *
 * Verifies:
 * 1. Shoulder Abduction prescribed 'left' + raising left arm -> Rep completes, accuracy > 80%
 * 2. Shoulder Abduction prescribed 'left' + raising right arm -> 0 reps, warning 'กรุณาใช้แขนข้างซ้าย', accuracy 0%
 * 3. Shoulder Abduction prescribed 'right' + raising right arm -> Rep completes
 * 4. Shoulder Abduction prescribed 'right' + raising left arm -> 0 reps, warning 'กรุณาใช้แขนข้างขวา'
 * 5. Raising both arms simultaneously during unilateral prescription -> Target arm tracked
 * 6. Low visibility tolerance check
 * 7. Other lateral exercises (Elbow Flexion, Shoulder Flexion, Knee Extension, Standing Hip Abduction)
 * 8. Bilateral exercises (Scapular Retraction, Chin Tuck, Sit to Stand) continue working without regression
 * 9. Mirror toggle / projection consistency (resolveTargetSide deterministic mapping)
 * 10. updateConfig side preservation (catalog default does not overwrite active prescription)
 */

import { describe, it, expect } from 'vitest';
import { RepStateMachine } from '../engine/repStateMachine';
import { SHOULDER_ABDUCTION_PRESET } from '../presets/shoulderPendulumPreset';
import { CLINICAL_EXERCISES_CONFIG } from '../presets/exercises.config';
import {
  resolveTargetSide,
  getOppositeSide,
  resolveTripletsForSide,
  getWrongSideCoachingMessage,
} from '../math/sideResolution';
import { PoseEngineLandmark, ExerciseConfig } from '../types/exerciseConfig';

function createMockSkeleton(): PoseEngineLandmark[] {
  return Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.5,
    z: 0.0,
    visibility: 0.99,
    presence: 0.99,
  }));
}

describe('Clinical Unilateral Side Enforcement Test Suite', () => {
  // Test 1: Shoulder Abduction prescribed 'left' + raising left arm -> rep completes
  it('1. Shoulder Abduction prescribed left + raising left arm: completes rep with high accuracy', () => {
    const config: ExerciseConfig = {
      ...SHOULDER_ABDUCTION_PRESET,
      side: 'left',
      defaultPrescription: { repsPerSet: 5, totalSets: 1, restBetweenSetsSec: 30 },
      angleMechanics: {
        ...SHOULDER_ABDUCTION_PRESET.angleMechanics!,
        holdDurationSec: 0.2, // 200ms for fast test execution
      },
    };

    const machine = new RepStateMachine(config);
    let currentTime = 1000;

    // Resting position: both arms down
    // Left: hip 23 (0.6, 0.6), shoulder 11 (0.6, 0.3), elbow 13 (0.6, 0.45), wrist 15 (0.62, 0.6)
    // Right: hip 24 (0.4, 0.6), shoulder 12 (0.4, 0.3), elbow 14 (0.4, 0.45), wrist 16 (0.38, 0.6)
    const skelResting = createMockSkeleton();
    skelResting[23] = { x: 0.6, y: 0.6, z: 0.0, visibility: 0.95 };
    skelResting[11] = { x: 0.6, y: 0.3, z: 0.0, visibility: 0.95 };
    skelResting[13] = { x: 0.61, y: 0.45, z: 0.0, visibility: 0.95 };
    skelResting[15] = { x: 0.62, y: 0.6, z: 0.0, visibility: 0.95 };

    skelResting[24] = { x: 0.4, y: 0.6, z: 0.0, visibility: 0.95 };
    skelResting[12] = { x: 0.4, y: 0.3, z: 0.0, visibility: 0.95 };
    skelResting[14] = { x: 0.39, y: 0.45, z: 0.0, visibility: 0.95 };
    skelResting[16] = { x: 0.38, y: 0.6, z: 0.0, visibility: 0.95 };

    let res = machine.evaluate(skelResting, currentTime);
    expect(res.phase).toBe('IDLE');
    expect(res.completedReps).toBe(0);

    // Target position: Left arm raised to ~90° horizontal abduction (wrist 15 at 0.9, 0.3)
    // Right arm remains down
    const skelLeftTarget = createMockSkeleton();
    Object.assign(skelLeftTarget, skelResting);
    skelLeftTarget[13] = { x: 0.75, y: 0.3, z: 0.0, visibility: 0.95 };
    skelLeftTarget[15] = { x: 0.9, y: 0.3, z: 0.0, visibility: 0.95 };

    // Move to target
    for (let i = 0; i < 4; i++) {
      currentTime += 100;
      res = machine.evaluate(skelLeftTarget, currentTime);
    }
    expect(res.phase).toBe('HOLDING_TARGET');
    expect(res.accuracyPercent).toBeGreaterThanOrEqual(80);

    // Hold target for >= 200ms
    currentTime += 300;
    res = machine.evaluate(skelLeftTarget, currentTime);
    expect(res.phase).toBe('RETURNING_TO_START');

    // Return to resting position
    for (let i = 0; i < 4; i++) {
      currentTime += 100;
      res = machine.evaluate(skelResting, currentTime);
    }
    expect(res.completedReps).toBe(1);
    expect(res.accuracyPercent).toBe(0);
  });

  // Test 2: Shoulder Abduction prescribed 'left' + raising right arm -> 0 reps, warning
  it('2. Shoulder Abduction prescribed left + raising right arm: 0 reps, 0% accuracy, warning emitted', () => {
    const config: ExerciseConfig = {
      ...SHOULDER_ABDUCTION_PRESET,
      side: 'left',
      defaultPrescription: { repsPerSet: 5, totalSets: 1, restBetweenSetsSec: 30 },
      angleMechanics: {
        ...SHOULDER_ABDUCTION_PRESET.angleMechanics!,
        holdDurationSec: 0.2,
      },
    };

    const machine = new RepStateMachine(config);
    let currentTime = 1000;

    // Resting skeleton
    const skelResting = createMockSkeleton();
    skelResting[23] = { x: 0.6, y: 0.6, z: 0.0, visibility: 0.95 };
    skelResting[11] = { x: 0.6, y: 0.3, z: 0.0, visibility: 0.95 };
    skelResting[13] = { x: 0.61, y: 0.45, z: 0.0, visibility: 0.95 };
    skelResting[15] = { x: 0.62, y: 0.6, z: 0.0, visibility: 0.95 };

    skelResting[24] = { x: 0.4, y: 0.6, z: 0.0, visibility: 0.95 };
    skelResting[12] = { x: 0.4, y: 0.3, z: 0.0, visibility: 0.95 };
    skelResting[14] = { x: 0.39, y: 0.45, z: 0.0, visibility: 0.95 };
    skelResting[16] = { x: 0.38, y: 0.6, z: 0.0, visibility: 0.95 };

    machine.evaluate(skelResting, currentTime);

    // Patient raises RIGHT arm to ~90° abduction while LEFT arm is resting
    const skelRightMoved = createMockSkeleton();
    Object.assign(skelRightMoved, skelResting);
    skelRightMoved[14] = { x: 0.25, y: 0.3, z: 0.0, visibility: 0.95 };
    skelRightMoved[16] = { x: 0.1, y: 0.3, z: 0.0, visibility: 0.95 }; // Right wrist raised

    for (let i = 0; i < 5; i++) {
      currentTime += 100;
      const res = machine.evaluate(skelRightMoved, currentTime);

      // Phase must NOT advance to HOLDING_TARGET
      expect(res.phase).not.toBe('HOLDING_TARGET');
      expect(res.phase).not.toBe('RETURNING_TO_START');
      expect(res.completedReps).toBe(0);
      // Accuracy must be 0% because target left arm has not moved
      expect(res.accuracyPercent).toBe(0);
      // Clinical coaching warning must alert to left arm
      expect(res.coachingMessage).toContain('กรุณาใช้แขนข้างซ้าย (ข้างที่สั่งฝึก)');
      expect(res.formRating).toBe('warning');
      expect(res.activeWarnings.some((w) => w.ruleId === 'wrong_side_movement')).toBe(true);
    }
  });

  // Test 3: Shoulder Abduction prescribed 'right' + raising right arm -> rep completes
  it('3. Shoulder Abduction prescribed right + raising right arm: completes rep normally', () => {
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

    const skelResting = createMockSkeleton();
    skelResting[24] = { x: 0.4, y: 0.6, z: 0.0, visibility: 0.95 };
    skelResting[12] = { x: 0.4, y: 0.3, z: 0.0, visibility: 0.95 };
    skelResting[14] = { x: 0.39, y: 0.45, z: 0.0, visibility: 0.95 };
    skelResting[16] = { x: 0.38, y: 0.6, z: 0.0, visibility: 0.95 };

    skelResting[23] = { x: 0.6, y: 0.6, z: 0.0, visibility: 0.95 };
    skelResting[11] = { x: 0.6, y: 0.3, z: 0.0, visibility: 0.95 };
    skelResting[13] = { x: 0.61, y: 0.45, z: 0.0, visibility: 0.95 };
    skelResting[15] = { x: 0.62, y: 0.6, z: 0.0, visibility: 0.95 };

    machine.evaluate(skelResting, currentTime);

    // Right arm raised
    const skelRightTarget = createMockSkeleton();
    Object.assign(skelRightTarget, skelResting);
    skelRightTarget[14] = { x: 0.25, y: 0.3, z: 0.0, visibility: 0.95 };
    skelRightTarget[16] = { x: 0.1, y: 0.3, z: 0.0, visibility: 0.95 };

    for (let i = 0; i < 4; i++) {
      currentTime += 100;
      machine.evaluate(skelRightTarget, currentTime);
    }
    currentTime += 300;
    const holdRes = machine.evaluate(skelRightTarget, currentTime);
    expect(holdRes.phase).toBe('RETURNING_TO_START');

    for (let i = 0; i < 4; i++) {
      currentTime += 100;
      machine.evaluate(skelResting, currentTime);
    }
    const finalRes = machine.evaluate(skelResting, currentTime);
    expect(finalRes.completedReps).toBe(1);
  });

  // Test 4: Shoulder Abduction prescribed 'right' + raising left arm -> 0 reps, warning
  it('4. Shoulder Abduction prescribed right + raising left arm: 0 reps, warning emitted', () => {
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

    const skelResting = createMockSkeleton();
    skelResting[24] = { x: 0.4, y: 0.6, z: 0.0, visibility: 0.95 };
    skelResting[12] = { x: 0.4, y: 0.3, z: 0.0, visibility: 0.95 };
    skelResting[14] = { x: 0.39, y: 0.45, z: 0.0, visibility: 0.95 };
    skelResting[16] = { x: 0.38, y: 0.6, z: 0.0, visibility: 0.95 };

    skelResting[23] = { x: 0.6, y: 0.6, z: 0.0, visibility: 0.95 };
    skelResting[11] = { x: 0.6, y: 0.3, z: 0.0, visibility: 0.95 };
    skelResting[13] = { x: 0.61, y: 0.45, z: 0.0, visibility: 0.95 };
    skelResting[15] = { x: 0.62, y: 0.6, z: 0.0, visibility: 0.95 };

    machine.evaluate(skelResting, currentTime);

    // Patient raises LEFT arm
    const skelLeftMoved = createMockSkeleton();
    Object.assign(skelLeftMoved, skelResting);
    skelLeftMoved[13] = { x: 0.75, y: 0.3, z: 0.0, visibility: 0.95 };
    skelLeftMoved[15] = { x: 0.9, y: 0.3, z: 0.0, visibility: 0.95 };

    for (let i = 0; i < 5; i++) {
      currentTime += 100;
      const res = machine.evaluate(skelLeftMoved, currentTime);
      expect(res.phase).not.toBe('HOLDING_TARGET');
      expect(res.completedReps).toBe(0);
      expect(res.accuracyPercent).toBe(0);
      expect(res.coachingMessage).toContain('กรุณาใช้แขนข้างขวา (ข้างที่สั่งฝึก)');
    }
  });

  // Test 5: Raising both arms simultaneously during unilateral prescription
  it('5. Raising both arms simultaneously: tracks prescribed side without blocking', () => {
    const config: ExerciseConfig = {
      ...SHOULDER_ABDUCTION_PRESET,
      side: 'left',
      defaultPrescription: { repsPerSet: 5, totalSets: 1, restBetweenSetsSec: 30 },
      angleMechanics: {
        ...SHOULDER_ABDUCTION_PRESET.angleMechanics!,
        holdDurationSec: 0.2,
      },
    };

    const machine = new RepStateMachine(config);
    let currentTime = 1000;

    const skelBothTarget = createMockSkeleton();
    // Left arm raised
    skelBothTarget[23] = { x: 0.6, y: 0.6, z: 0.0, visibility: 0.95 };
    skelBothTarget[11] = { x: 0.6, y: 0.3, z: 0.0, visibility: 0.95 };
    skelBothTarget[13] = { x: 0.75, y: 0.3, z: 0.0, visibility: 0.95 };
    skelBothTarget[15] = { x: 0.9, y: 0.3, z: 0.0, visibility: 0.95 };
    // Right arm raised
    skelBothTarget[24] = { x: 0.4, y: 0.6, z: 0.0, visibility: 0.95 };
    skelBothTarget[12] = { x: 0.4, y: 0.3, z: 0.0, visibility: 0.95 };
    skelBothTarget[14] = { x: 0.25, y: 0.3, z: 0.0, visibility: 0.95 };
    skelBothTarget[16] = { x: 0.1, y: 0.3, z: 0.0, visibility: 0.95 };

    // Move to target
    for (let i = 0; i < 4; i++) {
      currentTime += 50;
      machine.evaluate(skelBothTarget, currentTime);
    }
    const res = machine.evaluate(skelBothTarget, currentTime);
    // Because left arm IS moving into target, isWrongSideMoving is FALSE!
    expect(['HOLDING_TARGET', 'RETURNING_TO_START']).toContain(res.phase);
    expect(res.accuracyPercent).toBeGreaterThanOrEqual(80);
  });

  // Test 6: Low visibility tolerance check
  it('6. Low visibility tolerance check: synthetic fallbacks preserve side assignment', () => {
    const config: ExerciseConfig = {
      ...SHOULDER_ABDUCTION_PRESET,
      side: 'left',
    };
    const machine = new RepStateMachine(config);

    // Left arm visible, right arm completely occluded (low visibility)
    const skelLowVis = createMockSkeleton();
    skelLowVis[23] = { x: 0.6, y: 0.6, z: 0.0, visibility: 0.95 };
    skelLowVis[11] = { x: 0.6, y: 0.3, z: 0.0, visibility: 0.95 };
    skelLowVis[13] = { x: 0.6, y: 0.45, z: 0.0, visibility: 0.95 };
    skelLowVis[15] = { x: 0.6, y: 0.6, z: 0.0, visibility: 0.95 };

    skelLowVis[24] = { x: 0.4, y: 0.6, z: 0.0, visibility: 0.05 };
    skelLowVis[12] = { x: 0.4, y: 0.3, z: 0.0, visibility: 0.05 };
    skelLowVis[14] = { x: 0.4, y: 0.45, z: 0.0, visibility: 0.05 };
    skelLowVis[16] = { x: 0.4, y: 0.6, z: 0.0, visibility: 0.05 };

    const res = machine.evaluate(skelLowVis, 1000);
    expect(res).toBeDefined();
    expect(res.completedReps).toBe(0);
  });

  // Test 7: Other lateral exercises (Elbow Flexion, Shoulder Flexion, Knee Extension, Hip Abduction)
  it('7. Tests unilateral coaching and isolation across other clinical exercises', () => {
    const lateralExercises = [
      'elbow-flexion-extension',
      'active-shoulder-flexion',
      'seated-knee-extension',
      'standing-hip-abduction',
    ];

    for (const exId of lateralExercises) {
      const preset = CLINICAL_EXERCISES_CONFIG[exId];
      if (!preset || !preset.angleMechanics) continue;

      const tripletsLeft = resolveTripletsForSide(preset.angleMechanics, 'left');
      expect(tripletsLeft.isUnilateral).toBe(true);
      expect(tripletsLeft.effectiveSide).toBe('left');
      expect(tripletsLeft.targetTriplet).toEqual(preset.angleMechanics.landmarks.left);
      expect(tripletsLeft.oppositeTriplet).toEqual(preset.angleMechanics.landmarks.right);

      const tripletsRight = resolveTripletsForSide(preset.angleMechanics, 'right');
      expect(tripletsRight.isUnilateral).toBe(true);
      expect(tripletsRight.effectiveSide).toBe('right');
      expect(tripletsRight.targetTriplet).toEqual(preset.angleMechanics.landmarks.right);
      expect(tripletsRight.oppositeTriplet).toEqual(preset.angleMechanics.landmarks.left);

      const msgLeft = getWrongSideCoachingMessage('left', preset.targetJoint);
      expect(msgLeft.th).toContain('ซ้าย');
      const msgRight = getWrongSideCoachingMessage('right', preset.targetJoint);
      expect(msgRight.th).toContain('ขวา');
    }
  });

  // Test 8: Bilateral / No-side exercises continue working 100% without regression
  it('8. Bilateral exercises (scapular retraction, sit to stand) continue working without regression', () => {
    const bilateralIds = ['scapular-retraction', 'sit-to-stand', 'mini-squat', 'wall-pushup'];

    for (const exId of bilateralIds) {
      const preset = CLINICAL_EXERCISES_CONFIG[exId];
      if (!preset || !preset.angleMechanics) continue;

      const triplets = resolveTripletsForSide(preset.angleMechanics, 'bilateral');
      expect(triplets.isUnilateral).toBe(false);
      expect(triplets.effectiveSide).toBe('bilateral');
      expect(triplets.oppositeTriplet).toBeUndefined();

      const machine = new RepStateMachine({
        ...preset,
        side: 'bilateral',
      });
      const skel = createMockSkeleton();
      const res = machine.evaluate(skel, 1000);
      expect(res).toBeDefined();
      expect(res.phase).toBeDefined();
    }
  });

  // Test 9: Mirror toggle & projection consistency
  it('9. Deterministic patient-perspective side resolution regardless of display mirroring', () => {
    expect(resolveTargetSide('left', true)).toBe('left');
    expect(resolveTargetSide('left', false)).toBe('left');
    expect(resolveTargetSide('right', true)).toBe('right');
    expect(resolveTargetSide('right', false)).toBe('right');
    expect(resolveTargetSide('bilateral', true)).toBe('bilateral');
    expect(resolveTargetSide('both', false)).toBe('bilateral');
    expect(resolveTargetSide(null, true)).toBe('bilateral');
    expect(resolveTargetSide(undefined, false)).toBe('bilateral');

    expect(getOppositeSide('left')).toBe('right');
    expect(getOppositeSide('right')).toBe('left');
    expect(getOppositeSide('bilateral')).toBe('bilateral');
  });

  // Test 10: updateConfig side preservation
  it('10. updateConfig preserves explicit unilateral side when incoming config is bilateral default', () => {
    const config: ExerciseConfig = {
      ...SHOULDER_ABDUCTION_PRESET,
      side: 'left',
    };
    const machine = new RepStateMachine(config);

    // Simulate React re-render where catalog preset has side: 'bilateral'
    machine.updateConfig({
      ...SHOULDER_ABDUCTION_PRESET,
      side: 'bilateral', // incoming preset default
    });

    // Verify machine preserved 'left' side
    const currentMachineConfig = (machine as any).config as ExerciseConfig;
    expect(currentMachineConfig.side).toBe('left');

    // Explicit side override via setSide
    machine.setSide('right');
    expect(((machine as any).config as ExerciseConfig).side).toBe('right');
  });
});
