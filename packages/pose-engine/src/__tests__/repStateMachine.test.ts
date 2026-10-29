/**
 * packages/pose-engine/src/__tests__/repStateMachine.test.ts
 *
 * RepStateMachine & Shoulder Pendulum Unit Tests
 * Verifies:
 * 1. Exact 10-rep counting for standard angle-hold exercises
 * 2. Exact 10-rep circular counting for Shoulder Pendulum
 * 3. Biomechanical compensation & safety cap rejections
 */

import { describe, it, expect } from 'vitest';
import { RepStateMachine } from '../engine/repStateMachine';
import {
  SHOULDER_ABDUCTION_PRESET,
  SHOULDER_PENDULUM_PRESET,
} from '../presets/shoulderPendulumPreset';
import { PoseEngineLandmark } from '../types/exerciseConfig';

function createMockSkeleton(): PoseEngineLandmark[] {
  return Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.5,
    z: 0.0,
    visibility: 0.99,
    presence: 0.99,
  }));
}

describe('RepStateMachine Clinical Evaluation Suite', () => {
  it('1. simulates 10 valid consecutive repetitions for angle_rep_hold exercise', () => {
    const config = {
      ...SHOULDER_ABDUCTION_PRESET,
      defaultPrescription: { repsPerSet: 10, totalSets: 1, restBetweenSetsSec: 30 },
      angleMechanics: {
        ...SHOULDER_ABDUCTION_PRESET.angleMechanics!,
        holdDurationSec: 0.5, // 0.5s for fast simulation
      },
    };

    const machine = new RepStateMachine(config);
    let currentTime = 1000;

    for (let rep = 1; rep <= 10; rep++) {
      // Step A: At start zone (20° abduction: hip 24 at (0.4, 0.6), shoulder 12 at (0.4, 0.3), wrist 16 down at (0.43, 0.6))
      const skelResting = createMockSkeleton();
      skelResting[24] = { x: 0.4, y: 0.6, z: 0.0 }; // Right hip
      skelResting[12] = { x: 0.4, y: 0.3, z: 0.0 }; // Right shoulder
      skelResting[16] = { x: 0.43, y: 0.6, z: 0.0 }; // Right wrist hanging down (~20°)

      let res = machine.evaluate(skelResting, currentTime);
      currentTime += 100;

      // Step B: Move into target zone (90° abduction: wrist raised horizontally to x=0.7, y=0.3)
      const skelTarget = createMockSkeleton();
      skelTarget[23] = { x: 0.6, y: 0.6, z: 0.0 }; // Left hip
      skelTarget[24] = { x: 0.4, y: 0.6, z: 0.0 }; // Right hip
      skelTarget[11] = { x: 0.6, y: 0.3, z: 0.0 }; // Left shoulder
      skelTarget[12] = { x: 0.4, y: 0.3, z: 0.0 }; // Right shoulder
      skelTarget[16] = { x: 0.7, y: 0.3, z: 0.0 }; // Right wrist (90° abduction)

      // Move into target over 400ms (4 x 100ms)
      for (let f = 0; f < 4; f++) {
        currentTime += 100;
        res = machine.evaluate(skelTarget, currentTime);
      }
      expect(res.phase).toBe('HOLDING_TARGET');

      // Hold target for >= 0.5s (simulate 600ms)
      currentTime += 600;
      res = machine.evaluate(skelTarget, currentTime);
      expect(res.phase).toBe('RETURNING_TO_START');

      // Step C: Return to start zone
      for (let f = 0; f < 4; f++) {
        currentTime += 100;
        res = machine.evaluate(skelResting, currentTime);
      }
      expect(res.completedReps).toBe(rep);
    }

    const finalRes = machine.evaluate(createMockSkeleton(), currentTime);
    expect(finalRes.completedReps).toBe(10);
    expect(finalRes.isSetCompleted).toBe(true);
    expect(finalRes.isExerciseCompleted).toBe(true);
  });

  it('2. simulates 10 valid circular repetitions for Shoulder Pendulum (pendulum_circular)', () => {
    const config = {
      ...SHOULDER_PENDULUM_PRESET,
      defaultPrescription: { repsPerSet: 10, totalSets: 1, restBetweenSetsSec: 30 },
      pendulumMechanics: {
        ...SHOULDER_PENDULUM_PRESET.pendulumMechanics!,
        minCycleDurationSec: 0.4, // fast simulation
        maxCycleDurationSec: 5.0,
      },
    };

    const machine = new RepStateMachine(config);
    let currentTime = 1000;

    // Fixed landmarks:
    // Right hip (24): (0.5, 0.7, 0.0)
    // Right shoulder (12): (0.68, 0.35, 0.0) -> forward tilt ~27° relative to vertical
    // Right elbow (14): (0.68, 0.55, 0.0) -> hanging relaxed
    const hip = { x: 0.5, y: 0.7, z: 0.0 };
    const shoulder = { x: 0.68, y: 0.35, z: 0.0 };
    const elbow = { x: 0.68, y: 0.55, z: 0.0 };

    // Circular motion center around (0.68, 0.75) with radius 0.08
    const centerX = 0.68;
    const centerY = 0.75;
    const radius = 0.08;

    for (let rep = 1; rep <= 10; rep++) {
      const steps = 16;
      for (let s = 0; s <= steps; s++) {
        const theta = (2 * Math.PI * s) / steps;
        const wristX = centerX + radius * Math.cos(theta);
        const wristY = centerY + radius * Math.sin(theta);

        const skel = createMockSkeleton();
        skel[24] = hip;
        skel[12] = shoulder;
        skel[14] = elbow;
        skel[16] = { x: wristX, y: wristY, z: 0.0 };

        machine.evaluate(skel, currentTime);
        currentTime += 40; // 40ms * 16 steps = 640ms per circle (>= 0.4s min duration)
      }
    }

    const finalRes = machine.evaluate(createMockSkeleton(), currentTime);
    expect(finalRes.completedReps).toBe(10);
    expect(finalRes.isSetCompleted).toBe(true);
  });

  it('3. rejects Shoulder Pendulum when trunk is too upright and emits warning', () => {
    const config = { ...SHOULDER_PENDULUM_PRESET };
    const machine = new RepStateMachine(config);

    // Trunk upright: shoulder directly above hip (tilt = 0° < 18°)
    const skel = createMockSkeleton();
    skel[24] = { x: 0.5, y: 0.7, z: 0.0 }; // hip
    skel[12] = { x: 0.5, y: 0.3, z: 0.0 }; // shoulder directly above hip
    skel[14] = { x: 0.5, y: 0.5, z: 0.0 }; // elbow
    skel[16] = { x: 0.5, y: 0.7, z: 0.0 }; // wrist

    const res = machine.evaluate(skel, 1000);
    expect(res.completedReps).toBe(0);
    expect(res.formRating).toBe('warning');
    expect(res.coachingMessageTh).toContain('โน้มลำตัวไปข้างหน้า');
  });

  it('4. rejects Shoulder Pendulum when elbow is actively flexed (< 145°)', () => {
    const config = { ...SHOULDER_PENDULUM_PRESET };
    const machine = new RepStateMachine(config);

    // Trunk leaned forward (tilt ~30°)
    const skel = createMockSkeleton();
    skel[24] = { x: 0.5, y: 0.7, z: 0.0 };
    skel[12] = { x: 0.7, y: 0.35, z: 0.0 };
    skel[14] = { x: 0.7, y: 0.55, z: 0.0 };
    // Elbow bent 90°: wrist points up/forward at (0.9, 0.55)
    skel[16] = { x: 0.9, y: 0.55, z: 0.0 };

    const res = machine.evaluate(skel, 1000);
    expect(res.completedReps).toBe(0);
    expect(res.formRating).toBe('warning');
    expect(res.coachingMessageTh).toContain('อย่าเกร็งหรืองอข้อศอก');
  });

  it('5. triggers safety cap warning when joint angle exceeds maximum safe limit', () => {
    const config = {
      ...SHOULDER_ABDUCTION_PRESET,
      safetyContraindications: {
        stopOnPainMessageTh: 'อันตราย',
        maxSafeAngleCapDeg: 120,
      },
    };
    const machine = new RepStateMachine(config);

    // Angle raised way too high (150°)
    const skel = createMockSkeleton();
    skel[24] = { x: 0.4, y: 0.6, z: 0.0 }; // Hip
    skel[12] = { x: 0.4, y: 0.3, z: 0.0 }; // Shoulder
    skel[16] = { x: 0.2, y: 0.1, z: 0.0 }; // Wrist high above head

    const res = machine.evaluate(skel, 1000);
    expect(res.isExceedingSafetyCap).toBe(true);
    expect(res.formRating).toBe('error');
    expect(res.coachingMessageTh).toContain('สูงเกินไปแล้ว');
  });
});
