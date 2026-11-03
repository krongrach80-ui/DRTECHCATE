/**
 * packages/pose-engine/src/__tests__/all_15_clinical_exercises.test.ts
 *
 * Automated verification for Deliverable:
 * 15 Standard Clinical Physical Therapy Exercises (Single Source of Truth)
 * - 13 Camera-Mode Exercises + 2 Timer-Mode Exercises
 * - Clinical MediaPipe Biomechanical Rules, AAOS Standards, and Anti-Cheat Guards
 * - Sit-to-Stand: Knee extension > 160° AND vertical hip elevation (blocks seated leg kicking)
 * - Standing Hip Abduction: Leg abduction 25°–45° with trunk lateral tilt <= 10° (blocks trunk lean cheat)
 * - Chin Tuck & Shoulder Pendulum: Timer-mode pacing and countdown
 * - Single-Leg Stance Balance & Calf Stretch: Hold balance evaluation
 * - Contraindication Evaluation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  CLINICAL_EXERCISES_CONFIG,
  ALL_CLINICAL_EXERCISES,
  getClinicalExerciseConfig,
  evaluateContraindications,
} from '../presets/exercises.config';
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

describe('15 Standard Clinical Exercises Single Source of Truth', () => {
  const CANONICAL_15_KEYS = [
    'active-shoulder-flexion',
    'shoulder-abduction',
    'shoulder-er-band',
    'scapular-retraction',
    'elbow-flexion-extension',
    'seated-knee-extension',
    'mini-squat',
    'sit-to-stand',
    'straight-leg-raise',
    'standing-hip-abduction',
    'calf-raise',
    'single-leg-balance',
    'calf-stretch',
    'chin-tuck',
    'shoulder-pendulum',
  ];

  it('1. Exactly 15 Canonical Clinical Exercises in ALL_CLINICAL_EXERCISES catalog', () => {
    expect(ALL_CLINICAL_EXERCISES.length).toBe(15);
    const ids = ALL_CLINICAL_EXERCISES.map((ex) => ex.id);
    for (const key of CANONICAL_15_KEYS) {
      expect(ids).toContain(key);
      expect(CLINICAL_EXERCISES_CONFIG[key]).toBeDefined();
    }
  });

  it('2. Verifies trilingual names, descriptions, and verified clinical sources on all 15', () => {
    for (const key of CANONICAL_15_KEYS) {
      const ex = CLINICAL_EXERCISES_CONFIG[key];
      expect(ex.nameTh).toBeTruthy();
      expect(ex.nameEn).toBeTruthy();
      expect(ex.nameCn).toBeTruthy();
      expect(ex.descriptionTh).toBeTruthy();
      expect(ex.descriptionEn).toBeTruthy();
      expect(ex.descriptionCn).toBeTruthy();
      expect(ex.clinicalSource).toBeTruthy();
      expect(ex.clinicalDisclaimerTh).toContain('ค่าเริ่มต้นแนะนำ');
      expect(ex.mediaUrl).toMatch(/\.svg$/);
    }
  });

  it('3. Verifies separation of 13 camera mode vs 2 timer mode exercises', () => {
    const timerExercises = ALL_CLINICAL_EXERCISES.filter(
      (e) => e.mode === 'timer' || e.evaluationMode === 'timer'
    );
    expect(timerExercises.length).toBe(2);
    const timerIds = timerExercises.map((e) => e.id);
    expect(timerIds).toContain('chin-tuck');
    expect(timerIds).toContain('shoulder-pendulum');

    const cameraExercises = ALL_CLINICAL_EXERCISES.filter((e) => e.mode === 'camera');
    expect(cameraExercises.length).toBe(13);
  });

  it('4. Backwards-compatibility aliases resolve seamlessly to canonical exercises', () => {
    expect(CLINICAL_EXERCISES_CONFIG['shoulder-flexion']).toBeDefined();
    expect(CLINICAL_EXERCISES_CONFIG['elbow-flexion']).toBeDefined();
    expect(CLINICAL_EXERCISES_CONFIG['seated-knee-ext']).toBeDefined();
    expect(CLINICAL_EXERCISES_CONFIG['standing-hip-abd']).toBeDefined();
    expect(CLINICAL_EXERCISES_CONFIG['heel-raise']).toBeDefined();

    expect(getClinicalExerciseConfig('active-shoulder-flexion')?.id).toBe('active-shoulder-flexion');
    expect(getClinicalExerciseConfig('shoulder-flexion')?.nameEn).toBe('Active Shoulder Flexion');
    expect(getClinicalExerciseConfig('e1000000-0000-0000-0000-000000000008')?.id).toBe('sit-to-stand');
  });
});

describe('Clinical Anti-Cheat Biomechanical Rules & Validation', () => {
  beforeEach(() => {
    currentTime = 1000;
  });

  it('5. Sit-to-Stand: Legitimate standing up (vertical shank & hip lift) completes rep', () => {
    const cfg = CLINICAL_EXERCISES_CONFIG['sit-to-stand'];
    const sm = new RepStateMachine(cfg);
    sm.setSide('right');

    const sk = createDummySkeleton();
    sk[24] = { x: 0.5, y: 0.5, z: 0.0, visibility: 0.95 }; // Hip
    sk[26] = { x: 0.5, y: 0.7, z: 0.0, visibility: 0.95 }; // Knee
    sk[28] = { x: 0.7, y: 0.7, z: 0.0, visibility: 0.95 }; // Ankle seated ~90°

    let res = simulateFrames(sm, sk, 10);
    expect(res.phase).toBe('IDLE');

    // Stand up straight: ankle on floor (Y=0.9), knee (Y=0.7) -> vertical shank (diff = 0.20 >= 0.08)
    sk[28] = { x: 0.5, y: 0.9, z: 0.0, visibility: 0.95 };
    res = simulateFrames(sm, sk, 15);
    expect(res.phase).toBe('HOLDING_TARGET');
    expect(res.formRating).toBe('good');

    // Hold 1.0s
    res = simulateFrames(sm, sk, 30);
    expect(res.phase).toBe('RETURNING_TO_START');

    // Sit back down
    sk[28] = { x: 0.7, y: 0.7, z: 0.0, visibility: 0.95 };
    res = simulateFrames(sm, sk, 15);
    expect(res.completedReps).toBe(1);
    expect(res.incorrectReps).toBe(0);
  });

  it('6. Sit-to-Stand ANTI-CHEAT: Seated leg kicking (horizontal shank ankle≈knee) is rejected', () => {
    const cfg = CLINICAL_EXERCISES_CONFIG['sit-to-stand'];
    const sm = new RepStateMachine(cfg);
    sm.setSide('right');

    const sk = createDummySkeleton();
    sk[24] = { x: 0.35, y: 0.65, z: 0.0, visibility: 0.95 }; // Hip seated
    sk[26] = { x: 0.55, y: 0.65, z: 0.0, visibility: 0.95 }; // Knee
    sk[28] = { x: 0.55, y: 0.85, z: 0.0, visibility: 0.95 }; // Ankle on floor ~90° knee flexion

    simulateFrames(sm, sk, 10);

    // Cheat: Patient stays seated and extends knee straight out horizontally (ankle at Y=0.65, knee at Y=0.65)
    // Knee angle is 180° (straight), but shank is horizontal!
    sk[28] = { x: 0.75, y: 0.65, z: 0.0, visibility: 0.95 };
    const res = simulateFrames(sm, sk, 15);

    // Anti-cheat must flag error and block entering target zone!
    expect(res.formRating).toBe('error');
    expect(res.coachingMessageTh).toContain('กรุณาลุกขึ้นยืนจากเก้าอี้จริง');
    expect(res.activeWarnings.some((w) => w.ruleId === 'stand_anti_cheat_hip_lift')).toBe(true);
    expect(res.isInsideTargetZone).toBe(false);
  });

  it('7. Standing Hip Abduction: Legitimate abduction with upright trunk completes rep', () => {
    const cfg = CLINICAL_EXERCISES_CONFIG['standing-hip-abduction'];
    const sm = new RepStateMachine(cfg);
    sm.setSide('right');

    const sk = createDummySkeleton();
    // Spine perfectly upright: mid-shoulder x=0.5, mid-hip x=0.5
    sk[11] = { x: 0.45, y: 0.35, z: 0.0, visibility: 0.95 };
    sk[12] = { x: 0.55, y: 0.35, z: 0.0, visibility: 0.95 };
    sk[23] = { x: 0.45, y: 0.60, z: 0.0, visibility: 0.95 };
    sk[24] = { x: 0.55, y: 0.60, z: 0.0, visibility: 0.95 };
    sk[28] = { x: 0.55, y: 0.92, z: 0.0, visibility: 0.95 };

    simulateFrames(sm, sk, 10);

    // Abduct right leg outward (angle Shoulder 12 -> Hip 24 -> Ankle 28 decreases from 180° to ~145°)
    sk[28] = { x: 0.72, y: 0.88, z: 0.0, visibility: 0.95 };
    let res = simulateFrames(sm, sk, 15);
    expect(res.phase).toBe('HOLDING_TARGET');
    expect(res.formRating).toBe('good');

    // Hold 1.0s
    res = simulateFrames(sm, sk, 30);
    expect(res.phase).toBe('RETURNING_TO_START');

    // Return to start
    sk[28] = { x: 0.55, y: 0.92, z: 0.0, visibility: 0.95 };
    res = simulateFrames(sm, sk, 15);
    expect(res.completedReps).toBe(1);
  });

  it('8. Standing Hip Abduction ANTI-CHEAT: Trunk lateral tilt > 10° is flagged and rejected', () => {
    const cfg = CLINICAL_EXERCISES_CONFIG['standing-hip-abduction'];
    const sm = new RepStateMachine(cfg);
    sm.setSide('right');

    const sk = createDummySkeleton();
    // Start upright
    simulateFrames(sm, sk, 10);

    // Patient tilts torso severely to the left (shoulder shifts left from x=0.5 to x=0.30)
    sk[11] = { x: 0.20, y: 0.35, z: 0.0, visibility: 0.95 };
    sk[12] = { x: 0.30, y: 0.35, z: 0.0, visibility: 0.95 };
    sk[23] = { x: 0.45, y: 0.60, z: 0.0, visibility: 0.95 };
    sk[24] = { x: 0.55, y: 0.60, z: 0.0, visibility: 0.95 };
    sk[28] = { x: 0.72, y: 0.88, z: 0.0, visibility: 0.95 }; // Abducted leg

    const res = simulateFrames(sm, sk, 15);
    expect(res.formRating).toBe('error');
    expect(res.coachingMessageTh).toContain('รักษาลำตัวให้ตรง');
    expect(res.activeWarnings.some((w) => w.ruleId === 'hip_anti_cheat_trunk_lean')).toBe(true);
  });
});

describe('Timer-Mode & Hold-Balance Kinematics', () => {
  beforeEach(() => {
    currentTime = 1000;
  });

  it('9. Chin Tuck (Timer Mode): Pacing cycles (Prep -> Hold 5s -> Relax) advance reps reliably', () => {
    const cfg = CLINICAL_EXERCISES_CONFIG['chin-tuck'];
    const sm = new RepStateMachine(cfg);
    const sk = createDummySkeleton();

    // Frame at t=0: in preparation phase
    let res = sm.evaluate(sk, 1000);
    expect(res.phase).toBe('MOVING_TO_TARGET');
    expect(res.coachingMessageTh).toContain('เตรียมตัว');

    // Frame at t=2.5s (within 5s hold)
    res = sm.evaluate(sk, 3500);
    expect(res.phase).toBe('HOLDING_TARGET');
    expect(res.holdProgressRatio).toBeGreaterThan(0);
    expect(res.coachingMessageTh).toContain('ค้างท่าเก็บเหนียงไว้');

    // Frame at t=7.5s (within relax phase)
    res = sm.evaluate(sk, 8500);
    expect(res.phase).toBe('RETURNING_TO_START');
    expect(res.coachingMessageTh).toContain('ผ่อนคลาย');

    // Frame at t=9.5s (completes cycle 1)
    res = sm.evaluate(sk, 10500);
    expect(res.completedReps).toBe(1);
    expect(res.accuracyPercent).toBe(100);
  });

  it('10. Codman Shoulder Pendulum (Timer Mode): 45-second duration countdown completes set', () => {
    const cfg = CLINICAL_EXERCISES_CONFIG['shoulder-pendulum'];
    const sm = new RepStateMachine(cfg);
    const sk = createDummySkeleton();

    // Start at t=1000ms
    let res = sm.evaluate(sk, 1000);
    expect(res.phase).toBe('HOLDING_TARGET');
    expect(res.pendulumCircleProgressRatio).toBe(0);

    // Midway at t=23,500ms (22.5s elapsed = 50%)
    res = sm.evaluate(sk, 23500);
    expect(res.phase).toBe('HOLDING_TARGET');
    expect(res.pendulumCircleProgressRatio).toBeCloseTo(0.5, 1);
    expect(res.coachingMessageTh).toContain('เหลืออีก');

    // Completed at t=46,500ms (45.5s elapsed)
    res = sm.evaluate(sk, 46500);
    expect(res.phase).toBe('REP_COMPLETED');
    expect(res.isSetCompleted).toBe(true);
    expect(res.completedReps).toBe(1);
  });

  it('11. Single-Leg Stance Balance: Holding on one leg advances hold progress and completes rep', () => {
    const cfg = CLINICAL_EXERCISES_CONFIG['single-leg-balance'];
    const sm = new RepStateMachine(cfg);
    const sk = createDummySkeleton();

    // Lift left leg: left ankle Y=0.80, right stance ankle Y=0.92 (diff=0.12 > 0.035)
    sk[27] = { x: 0.45, y: 0.80, z: 0.0, visibility: 0.95 };
    sk[28] = { x: 0.55, y: 0.92, z: 0.0, visibility: 0.95 };

    // Start holding
    let res = sm.evaluate(sk, 1000);
    expect(res.phase).toBe('HOLDING_TARGET');

    // 10 seconds into 20s hold
    res = sm.evaluate(sk, 11000);
    expect(res.phase).toBe('HOLDING_TARGET');
    expect(res.holdProgressRatio).toBeCloseTo(0.5, 1);

    // Full 20 seconds hold
    res = sm.evaluate(sk, 21500);
    expect(res.completedReps).toBe(1);
  });
});

describe('Clinical Contraindications Guard System', () => {
  it('12. Flags shoulder abduction contraindication when patient has rotator cuff tear / post-op', () => {
    const res = evaluateContraindications('shoulder-abduction', 'shoulder', {
      contraindications: 'ห้ามกางแขนเกิน 90 องศา (Rotator cuff repair)',
      target_joint: 'ข้อต่อหัวไหล่',
    });
    expect(res.hasWarning).toBe(true);
    expect(res.warningMessage).toContain('คำเตือนทางคลินิก');
    expect(res.reason).toBe('shoulder_contraindication');
  });

  it('13. Flags fall risk / weight bearing warning on sit-to-stand for high fall risk patient', () => {
    const res = evaluateContraindications('sit-to-stand', 'knee', {
      contraindications: 'เสี่ยงหกล้มสูง ห้ามลงน้ำหนักข้างซ้าย',
      target_joint: 'ข้อเข่า',
    });
    expect(res.hasWarning).toBe(true);
    expect(res.warningMessage).toContain('ความเสี่ยงล้ม');
    expect(res.reason).toBe('fall_risk_weight_bearing');
  });

  it('14. Flags cervical caution on chin-tuck when patient has severe cervical spondylosis / vertigo', () => {
    const res = evaluateContraindications('chin-tuck', 'neck', {
      underlying_diseases: 'กระดูกคอเสื่อม มึนงงศีรษะ',
      target_joint: 'กระดูกต้นคอ',
    });
    expect(res.hasWarning).toBe(true);
    expect(res.warningMessage).toContain('กระดูกสันหลังระดับคอ');
    expect(res.reason).toBe('cervical_spine_warning');
  });

  it('15. Passes with no warnings when patient has no matching contraindications', () => {
    const res = evaluateContraindications('elbow-flexion-extension', 'elbow', {
      contraindications: '',
      target_joint: 'ข้อศอก',
    });
    expect(res.hasWarning).toBe(false);
  });
});
