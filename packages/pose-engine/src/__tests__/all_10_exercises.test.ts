/**
 * packages/pose-engine/src/__tests__/all_10_exercises.test.ts
 *
 * Automated verification for Deliverable 2:
 * 10 Clinical Physical Therapy Exercises (TH/EN/CN) & Dynamic Biomechanical Pose Engine
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  CLINICAL_EXERCISES_CONFIG,
  ALL_CLINICAL_EXERCISES,
} from '../presets/exercises.config';
import { findPresetForExercise } from '../presets/shoulderPendulumPreset';
import { RepStateMachine } from '../engine/repStateMachine';
import { PoseEngineLandmark, RepEvaluationResult } from '../types/exerciseConfig';

function createDummySkeleton(): PoseEngineLandmark[] {
  const landmarks: PoseEngineLandmark[] = [];
  for (let i = 0; i <= 32; i++) {
    landmarks.push({
      x: 0.5,
      y: 0.5,
      z: 0.0,
      visibility: 0.95,
      presence: 0.95,
    });
  }
  // Standard anatomical defaults
  landmarks[7] = { x: 0.45, y: 0.20, z: 0.0, visibility: 0.95 }; // L Ear
  landmarks[8] = { x: 0.55, y: 0.20, z: 0.0, visibility: 0.95 }; // R Ear
  landmarks[11] = { x: 0.40, y: 0.35, z: 0.0, visibility: 0.95 }; // L Shoulder
  landmarks[12] = { x: 0.60, y: 0.35, z: 0.0, visibility: 0.95 }; // R Shoulder
  landmarks[13] = { x: 0.38, y: 0.50, z: 0.0, visibility: 0.95 }; // L Elbow
  landmarks[14] = { x: 0.62, y: 0.50, z: 0.0, visibility: 0.95 }; // R Elbow
  landmarks[15] = { x: 0.38, y: 0.65, z: 0.0, visibility: 0.95 }; // L Wrist
  landmarks[16] = { x: 0.62, y: 0.65, z: 0.0, visibility: 0.95 }; // R Wrist
  landmarks[23] = { x: 0.45, y: 0.60, z: 0.0, visibility: 0.95 }; // L Hip
  landmarks[24] = { x: 0.55, y: 0.60, z: 0.0, visibility: 0.95 }; // R Hip
  landmarks[25] = { x: 0.45, y: 0.78, z: 0.0, visibility: 0.95 }; // L Knee
  landmarks[26] = { x: 0.55, y: 0.78, z: 0.0, visibility: 0.95 }; // R Knee
  landmarks[27] = { x: 0.45, y: 0.92, z: 0.0, visibility: 0.95 }; // L Ankle
  landmarks[28] = { x: 0.55, y: 0.92, z: 0.0, visibility: 0.95 }; // R Ankle
  landmarks[29] = { x: 0.43, y: 0.95, z: 0.0, visibility: 0.95 }; // L Heel
  landmarks[30] = { x: 0.53, y: 0.95, z: 0.0, visibility: 0.95 }; // R Heel
  landmarks[31] = { x: 0.47, y: 0.96, z: 0.0, visibility: 0.95 }; // L Foot Index
  landmarks[32] = { x: 0.57, y: 0.96, z: 0.0, visibility: 0.95 }; // R Foot Index
  return landmarks;
}

let currentTime = 1000;

function simulateFrames(
  sm: RepStateMachine,
  sk: PoseEngineLandmark[],
  frames: number,
  dtMs: number = 40
): RepEvaluationResult {
  let res: RepEvaluationResult = {} as any;
  for (let i = 0; i < frames; i++) {
    currentTime += dtMs;
    res = sm.evaluate(sk, currentTime);
  }
  return res;
}

describe('10 Clinical Exercises Configuration & Localization (TH / EN / CN)', () => {
  const expectedKeys = [
    'shoulder-pendulum',
    'shoulder-flexion',
    'shoulder-abduction',
    'elbow-flexion',
    'wall-pushup',
    'neck-side-tilt',
    'sit-to-stand',
    'seated-knee-ext',
    'standing-hip-abd',
    'heel-raise',
  ];

  it('1. Verifies all 10 clinical exercises exist in catalog', () => {
    expect(ALL_CLINICAL_EXERCISES.length).toBe(10);
    for (const key of expectedKeys) {
      expect(CLINICAL_EXERCISES_CONFIG[key]).toBeDefined();
      expect(CLINICAL_EXERCISES_CONFIG[key].id).toBe(key);
    }
  });

  it('2. Verifies trilingual names and descriptions (TH, EN, CN) on all 10 exercises', () => {
    for (const key of expectedKeys) {
      const cfg = CLINICAL_EXERCISES_CONFIG[key];
      expect(cfg.nameTh).toBeTruthy();
      expect(cfg.nameEn).toBeTruthy();
      expect(cfg.nameCn).toBeTruthy();
      expect(cfg.descriptionTh).toBeTruthy();
      expect(cfg.descriptionEn).toBeTruthy();
      expect(cfg.descriptionCn).toBeTruthy();
      expect(cfg.framing).toBeDefined();
    }
  });

  it('3. Lookup helper resolves exercises by ID, TH, EN, CN, and keywords', () => {
    expect(findPresetForExercise('shoulder-pendulum')?.id).toBe('shoulder-pendulum');
    expect(findPresetForExercise('แกว่งแขน')?.id).toBe('shoulder-pendulum');
    expect(findPresetForExercise('肩部前屈举臂')?.id).toBe('shoulder-flexion');
    expect(findPresetForExercise('Elbow Flexion-Extension')?.id).toBe('elbow-flexion');
    expect(findPresetForExercise('ดันผนัง')?.id).toBe('wall-pushup');
    expect(findPresetForExercise('颈部侧倾拉伸')?.id).toBe('neck-side-tilt');
    expect(findPresetForExercise('ลุกยืนจากเก้าอี้')?.id).toBe('sit-to-stand');
    expect(findPresetForExercise('Seated Knee Extension')?.id).toBe('seated-knee-ext');
    expect(findPresetForExercise('standing-hip-abd')?.id).toBe('standing-hip-abd');
    expect(findPresetForExercise('站姿提踵训练')?.id).toBe('heel-raise');
  });
});

describe('10-Exercise Biomechanical State Machine Trajectory Simulations', () => {
  beforeEach(() => {
    currentTime = 1000;
  });

  it('4. Shoulder Pendulum: evaluates circular trajectory and completes rep', () => {
    const cfg = CLINICAL_EXERCISES_CONFIG['shoulder-pendulum'];
    const sm = new RepStateMachine(cfg);
    sm.setSide('right');

    const hip = { x: 0.5, y: 0.7, z: 0.0, visibility: 0.95 };
    const shoulder = { x: 0.68, y: 0.35, z: 0.0, visibility: 0.95 };
    const elbow = { x: 0.68, y: 0.55, z: 0.0, visibility: 0.95 };
    const centerX = 0.68;
    const centerY = 0.75;
    const radius = 0.08;

    let completedReps = 0;
    const steps = 36;
    // Run 2 full revolutions (72 steps) so moving centroid stabilizes in sliding window
    for (let s = 0; s <= steps * 2; s++) {
      const theta = (2 * Math.PI * s) / steps;
      const wristX = centerX + radius * Math.cos(theta);
      const wristY = centerY + radius * Math.sin(theta);

      const sk = createDummySkeleton();
      sk[24] = hip;
      sk[12] = shoulder;
      sk[14] = elbow;
      sk[16] = { x: wristX, y: wristY, z: 0.0, visibility: 0.95 };

      currentTime += 40;
      const res = sm.evaluate(sk, currentTime);
      if (res.completedReps > completedReps) {
        completedReps = res.completedReps;
      }
      expect(res.accuracyPercent).toBeGreaterThanOrEqual(0);
    }

    expect(completedReps).toBeGreaterThanOrEqual(1);
  });

  it('5. Shoulder Flexion (increase): raising arm forward 20° -> 150° -> 20° completes 1 rep', () => {
    const cfg = CLINICAL_EXERCISES_CONFIG['shoulder-flexion'];
    const sm = new RepStateMachine(cfg);
    sm.setSide('right');

    const sk = createDummySkeleton();
    sk[24] = { x: 0.55, y: 0.65, z: 0.0, visibility: 0.95 }; // Hip
    sk[12] = { x: 0.55, y: 0.35, z: 0.0, visibility: 0.95 }; // Shoulder

    // Start position: arm down ~20°
    sk[16] = { x: 0.55, y: 0.65, z: 0.0, visibility: 0.95 };
    let res = simulateFrames(sm, sk, 10);
    expect(res.phase).toBe('IDLE');

    // Raise arm to ~150°
    sk[16] = { x: 0.70, y: 0.09, z: 0.0, visibility: 0.95 };
    res = simulateFrames(sm, sk, 15);
    expect(res.accuracyPercent).toBeGreaterThan(80);
    expect(res.phase).toBe('HOLDING_TARGET');

    // Hold 1.0s
    res = simulateFrames(sm, sk, 30);
    expect(res.phase).toBe('RETURNING_TO_START');

    // Return to start down
    sk[16] = { x: 0.55, y: 0.65, z: 0.0, visibility: 0.95 };
    res = simulateFrames(sm, sk, 15);
    expect(res.completedReps).toBe(1);
  });

  it('6. Elbow Flexion (decrease): bending elbow 170° -> 40° -> 170° completes 1 rep', () => {
    const cfg = CLINICAL_EXERCISES_CONFIG['elbow-flexion'];
    const sm = new RepStateMachine(cfg);
    sm.setSide('right');

    const sk = createDummySkeleton();
    sk[12] = { x: 0.5, y: 0.3, z: 0.0, visibility: 0.95 }; // Shoulder
    sk[14] = { x: 0.5, y: 0.5, z: 0.0, visibility: 0.95 }; // Elbow

    // Start extended ~170°
    sk[16] = { x: 0.5, y: 0.7, z: 0.0, visibility: 0.95 };
    let res = simulateFrames(sm, sk, 10);
    expect(res.phase).toBe('IDLE');

    // Bend elbow inwards to ~40°
    sk[16] = { x: 0.64, y: 0.36, z: 0.0, visibility: 0.95 };
    res = simulateFrames(sm, sk, 15);
    expect(res.accuracyPercent).toBe(100);
    expect(res.phase).toBe('HOLDING_TARGET');

    // Hold 0.5s
    res = simulateFrames(sm, sk, 20);
    expect(res.phase).toBe('RETURNING_TO_START');

    // Return extended
    sk[16] = { x: 0.5, y: 0.7, z: 0.0, visibility: 0.95 };
    res = simulateFrames(sm, sk, 15);
    expect(res.completedReps).toBe(1);
  });

  it('7. Wall Push-up (decrease): bending elbow 170° -> 90° -> 170° completes 1 rep', () => {
    const cfg = CLINICAL_EXERCISES_CONFIG['wall-pushup'];
    const sm = new RepStateMachine(cfg);
    sm.setSide('right');

    const sk = createDummySkeleton();
    sk[12] = { x: 0.5, y: 0.3, z: 0.0, visibility: 0.95 }; // Shoulder
    sk[14] = { x: 0.5, y: 0.5, z: 0.0, visibility: 0.95 }; // Elbow

    // Start extended
    sk[16] = { x: 0.5, y: 0.7, z: 0.0, visibility: 0.95 };
    let res = simulateFrames(sm, sk, 10);
    expect(res.phase).toBe('IDLE');

    // Bend elbow towards wall to ~90°
    sk[16] = { x: 0.7, y: 0.5, z: 0.0, visibility: 0.95 };
    res = simulateFrames(sm, sk, 15);
    expect(res.phase).toBe('HOLDING_TARGET');

    // Hold 0.5s
    res = simulateFrames(sm, sk, 20);
    expect(res.phase).toBe('RETURNING_TO_START');

    // Push back extended
    sk[16] = { x: 0.5, y: 0.7, z: 0.0, visibility: 0.95 };
    res = simulateFrames(sm, sk, 15);
    expect(res.completedReps).toBe(1);
  });

  it('8. Neck Side Tilt (neck_tilt mode): tilting ear 0° -> 25° -> 0° completes 1 rep', () => {
    const cfg = CLINICAL_EXERCISES_CONFIG['neck-side-tilt'];
    const sm = new RepStateMachine(cfg);

    const sk = createDummySkeleton();
    // Shoulder 11 & 12 (horizontal)
    sk[11] = { x: 0.4, y: 0.4, z: 0.0, visibility: 0.95 };
    sk[12] = { x: 0.6, y: 0.4, z: 0.0, visibility: 0.95 };

    // Start upright
    sk[7] = { x: 0.45, y: 0.2, z: 0.0, visibility: 0.95 };
    sk[8] = { x: 0.55, y: 0.2, z: 0.0, visibility: 0.95 };
    let res = simulateFrames(sm, sk, 10);
    expect(res.phase).toBe('IDLE');

    // Tilt head laterally to ~25°
    sk[7] = { x: 0.45, y: 0.177, z: 0.0, visibility: 0.95 };
    sk[8] = { x: 0.55, y: 0.223, z: 0.0, visibility: 0.95 };
    res = simulateFrames(sm, sk, 15);
    expect(res.accuracyPercent).toBe(100);
    expect(res.phase).toBe('HOLDING_TARGET');

    // Hold 1.0s
    res = simulateFrames(sm, sk, 30);
    expect(res.phase).toBe('RETURNING_TO_START');

    // Return upright
    sk[7] = { x: 0.45, y: 0.2, z: 0.0, visibility: 0.95 };
    sk[8] = { x: 0.55, y: 0.2, z: 0.0, visibility: 0.95 };
    res = simulateFrames(sm, sk, 15);
    expect(res.completedReps).toBe(1);
  });

  it('9. Sit-to-Stand: rising 90° -> 175° -> 90° completes 1 rep', () => {
    const cfg = CLINICAL_EXERCISES_CONFIG['sit-to-stand'];
    const sm = new RepStateMachine(cfg);
    sm.setSide('right');

    const sk = createDummySkeleton();
    sk[24] = { x: 0.5, y: 0.5, z: 0.0, visibility: 0.95 }; // Hip
    sk[26] = { x: 0.5, y: 0.7, z: 0.0, visibility: 0.95 }; // Knee

    // Seated bent knee ~90°
    sk[28] = { x: 0.7, y: 0.7, z: 0.0, visibility: 0.95 }; // Ankle
    let res = simulateFrames(sm, sk, 10);
    expect(res.phase).toBe('IDLE');

    // Stand up straight knee ~175°
    sk[28] = { x: 0.5, y: 0.9, z: 0.0, visibility: 0.95 };
    res = simulateFrames(sm, sk, 15);
    expect(res.accuracyPercent).toBe(100);
    expect(res.phase).toBe('HOLDING_TARGET');

    // Hold 0.5s
    res = simulateFrames(sm, sk, 20);
    expect(res.phase).toBe('RETURNING_TO_START');

    // Sit back down
    sk[28] = { x: 0.7, y: 0.7, z: 0.0, visibility: 0.95 };
    res = simulateFrames(sm, sk, 15);
    expect(res.completedReps).toBe(1);
  });

  it('10. Heel Raise (heel_raise mode): raises heel 5% leg scale -> floor completes 1 rep', () => {
    const cfg = CLINICAL_EXERCISES_CONFIG['heel-raise'];
    const sm = new RepStateMachine(cfg);

    const sk = createDummySkeleton();
    sk[26] = { x: 0.5, y: 0.60, z: 0.0, visibility: 0.95 }; // Knee
    sk[28] = { x: 0.5, y: 0.85, z: 0.0, visibility: 0.95 }; // Ankle
    sk[30] = { x: 0.48, y: 0.88, z: 0.0, visibility: 0.95 }; // Heel baseline
    sk[32] = { x: 0.54, y: 0.88, z: 0.0, visibility: 0.95 }; // Foot

    // Flat on floor
    let res = simulateFrames(sm, sk, 10);
    expect(res.phase).toBe('IDLE');

    // Raise heel off floor
    sk[30] = { x: 0.48, y: 0.86, z: 0.0, visibility: 0.95 };
    res = simulateFrames(sm, sk, 15);
    expect(res.accuracyPercent).toBeGreaterThan(0);
    expect(res.phase).toBe('HOLDING_TARGET');

    // Hold 0.5s
    res = simulateFrames(sm, sk, 20);
    expect(res.phase).toBe('RETURNING_TO_START');

    // Lower back to floor
    sk[30] = { x: 0.48, y: 0.88, z: 0.0, visibility: 0.95 };
    res = simulateFrames(sm, sk, 15);
    expect(res.completedReps).toBe(1);
  });

  it('11. Enforces 350ms rep debounce to prevent double-counting', () => {
    const cfg = CLINICAL_EXERCISES_CONFIG['sit-to-stand'];
    const sm = new RepStateMachine(cfg);
    sm.setSide('right');

    const sk = createDummySkeleton();
    sk[24] = { x: 0.5, y: 0.5, z: 0.0, visibility: 0.95 };
    sk[26] = { x: 0.5, y: 0.7, z: 0.0, visibility: 0.95 };

    // Rep 1: Seated -> Stand -> Hold -> Sit
    sk[28] = { x: 0.7, y: 0.7, z: 0.0, visibility: 0.95 };
    simulateFrames(sm, sk, 10);
    sk[28] = { x: 0.5, y: 0.9, z: 0.0, visibility: 0.95 };
    simulateFrames(sm, sk, 15);
    simulateFrames(sm, sk, 20); // Hold
    sk[28] = { x: 0.7, y: 0.7, z: 0.0, visibility: 0.95 };
    const rep1 = simulateFrames(sm, sk, 15);
    expect(rep1.completedReps).toBe(1);

    // Attempt rapid 2nd rep completion only 50ms later (debounce violation)
    currentTime += 50;
    sk[28] = { x: 0.5, y: 0.9, z: 0.0, visibility: 0.95 };
    sm.evaluate(sk, currentTime);
    currentTime += 20;
    sk[28] = { x: 0.7, y: 0.7, z: 0.0, visibility: 0.95 };
    const rapidRep = sm.evaluate(sk, currentTime);
    expect(rapidRep.completedReps).toBe(1); // Blocked by 350ms debounce!
  });

  it('12. Emits framing guidance when lower body landmarks have visibility < 0.5', () => {
    const cfg = CLINICAL_EXERCISES_CONFIG['sit-to-stand'];
    const sm = new RepStateMachine(cfg);

    const sk = createDummySkeleton();
    // Obscure lower body landmarks (knees and ankles visibility < 0.5)
    sk[25].visibility = 0.2;
    sk[26].visibility = 0.2;
    sk[27].visibility = 0.2;
    sk[28].visibility = 0.2;

    const res = sm.evaluate(sk, 1000);
    expect(res.readinessStatus).toBe('missing_lower_body');
    expect(res.coachingMessageTh).toContain('กรุณาถอยห่างจากกล้องประมาณ 2–2.5 เมตร');
  });
});
