import { describe, it, expect } from 'vitest';
import { RepStateMachine } from '../engine/repStateMachine';
import { CLINICAL_EXERCISES_CONFIG } from '../presets/exercises.config';
import { PoseEngineLandmark } from '../types/exerciseConfig';

function createMockSkeleton(): PoseEngineLandmark[] {
  const skel: PoseEngineLandmark[] = Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.5,
    z: 0.0,
    visibility: 0.95,
    presence: 0.95,
  }));

  // Patient facing camera / 45 degree:
  // Shoulders
  skel[11] = { x: 0.60, y: 0.35, z: 0.0, visibility: 0.95 };
  skel[12] = { x: 0.40, y: 0.35, z: 0.0, visibility: 0.95 };

  // Left Elbow (13) and Left Wrist (15) - extended arm: angle ~ 160 deg
  skel[13] = { x: 0.62, y: 0.55, z: -0.05, visibility: 0.95 };
  skel[15] = { x: 0.63, y: 0.75, z: -0.08, visibility: 0.95 };

  // Right Arm
  skel[14] = { x: 0.38, y: 0.55, z: -0.05, visibility: 0.95 };
  skel[16] = { x: 0.37, y: 0.75, z: -0.08, visibility: 0.95 };

  // Hips
  skel[23] = { x: 0.56, y: 0.70, z: 0.0, visibility: 0.95 };
  skel[24] = { x: 0.44, y: 0.70, z: 0.0, visibility: 0.95 };

  return skel;
}

describe('Clinical Verification: Elbow Flexion & Extension Biomechanical Rules & FormGate', () => {
  const config = {
    ...CLINICAL_EXERCISES_CONFIG['elbow-flexion-extension'],
    side: 'left' as const,
  };

  it('Case (ก): นั่งนิ่ง ไม่ขยับ แขนห้อยแนบลำตัว - ต้องไม่นับครั้ง และฟอร์มตั้งต้นถูกต้อง (100% readiness ที่ตำแหน่งเริ่มต้น)', () => {
    const sm = new RepStateMachine(config);
    let lastRes: any = null;
    for (let f = 0; f < 60; f++) {
      const skel = createMockSkeleton();
      lastRes = sm.evaluate(skel, f * 33.33);
    }

    expect(lastRes.completedReps).toBe(0);
    expect(lastRes.accuracyPercent).toBe(100);
    expect(lastRes.phase).toBe('IDLE');
  });

  it('Case (ข): แขนอยู่นอกกรอบภาพ / ขยับตัวหายใจ - ต้องไม่นับครั้ง และเตือน missing_arm_landmarks', () => {
    const sm = new RepStateMachine(config);
    let lastRes: any = null;
    let maxReps = 0;

    for (let f = 0; f < 180; f++) {
      const skel = createMockSkeleton();
      // Elbow and wrist are cropped out of frame (y > 1.0 or low vis)
      skel[13] = { x: 0.62, y: 1.05, z: 0, visibility: 0.15 };
      skel[15] = { x: 0.63, y: 1.25, z: 0, visibility: 0.10 };

      // Slight breathing oscillation
      const breath = Math.sin(f * 0.08) * 0.04;
      skel[11] = { x: 0.60, y: 0.35 - breath, z: 0.0, visibility: 0.95 };

      lastRes = sm.evaluate(skel, f * 33.33);
      if (lastRes.completedReps > maxReps) {
        maxReps = lastRes.completedReps;
      }
    }

    expect(maxReps).toBe(0);
    expect(lastRes.completedReps).toBe(0);
    expect(lastRes.readinessStatus).toBe('missing_arm_landmarks');
    expect(lastRes.accuracyPercent).toBe(0);
  });

  it('Case (ข-2): Boundary Clipping (isArmClipping = true) - ต้องระงับการนับทันที', () => {
    const sm = new RepStateMachine(config);
    const skel = createMockSkeleton();
    const res = sm.evaluateFrame(skel, undefined, 1000, { isArmClipping: true });

    expect(res.completedReps).toBe(0);
    expect(res.accuracyPercent).toBe(0);
    expect(res.isArmClipping).toBe(true);
  });

  it('Case (ค): ท่าถูกต้องเต็มวงจร (160° -> 45° -> ค้าง 1.0s -> 160°) - ต้องนับครบ 1 ครั้งสำเร็จ', () => {
    const sm = new RepStateMachine(config);
    let lastRes: any = null;

    // 1. Initial extended state (160 deg)
    for (let f = 0; f < 10; f++) {
      const skel = createMockSkeleton();
      lastRes = sm.evaluate(skel, f * 33.33);
    }
    expect(lastRes.completedReps).toBe(0);

    // 2. Flex elbow into target zone (35-50 deg): wrist moves up to shoulder
    for (let f = 10; f < 40; f++) {
      const skel = createMockSkeleton();
      const progress = (f - 10) / 30;
      skel[15] = {
        x: 0.62,
        y: 0.75 - progress * 0.35,
        z: -0.08,
        visibility: 0.95,
      };
      lastRes = sm.evaluate(skel, f * 33.33);
    }
    expect(lastRes.phase).toBe('HOLDING_TARGET');

    // 3. Hold target for 1.1s (35 frames)
    for (let f = 40; f < 75; f++) {
      const skel = createMockSkeleton();
      skel[15] = { x: 0.62, y: 0.40, z: -0.08, visibility: 0.95 };
      lastRes = sm.evaluate(skel, f * 33.33);
    }

    // 4. Return to extended start zone (160 deg)
    for (let f = 75; f < 105; f++) {
      const skel = createMockSkeleton();
      const progress = (f - 75) / 30;
      skel[15] = {
        x: 0.62,
        y: 0.40 + progress * 0.35,
        z: -0.08,
        visibility: 0.95,
      };
      lastRes = sm.evaluate(skel, f * 33.33);
    }

    expect(lastRes.completedReps).toBe(1);
  });

  it('Case (ง): งอไม่ถึงมุมเป้าหมาย (งอได้เพียง ~95° เทียบกับเป้า 35°-50°) - ต้องไม่นับครั้ง', () => {
    const sm = new RepStateMachine(config);
    let lastRes: any = null;

    for (let f = 0; f < 10; f++) {
      const skel = createMockSkeleton();
      lastRes = sm.evaluate(skel, f * 33.33);
    }
    // Partial flexion: forearm horizontal ~95 deg
    for (let f = 10; f < 60; f++) {
      const skel = createMockSkeleton();
      skel[15] = { x: 0.62, y: 0.55, z: -0.20, visibility: 0.95 };
      lastRes = sm.evaluate(skel, f * 33.33);
    }
    // Return
    for (let f = 60; f < 90; f++) {
      const skel = createMockSkeleton();
      lastRes = sm.evaluate(skel, f * 33.33);
    }

    expect(lastRes.completedReps).toBe(0);
  });

  it('Case (จ): งอแล้วค้างไม่เหยียดกลับ - ต้องไม่นับครั้ง', () => {
    const sm = new RepStateMachine(config);
    let lastRes: any = null;

    for (let f = 0; f < 120; f++) {
      const skel = createMockSkeleton();
      skel[15] = { x: 0.62, y: 0.40, z: -0.08, visibility: 0.95 };
      lastRes = sm.evaluate(skel, f * 33.33);
    }

    expect(lastRes.completedReps).toBe(0);
    expect(lastRes.phase).not.toBe('REP_COMPLETED');
  });

  it('Case (ฉ): งอเร็วแบบสะบัด (< 300ms) - ต้องถูกปฏิเสธด้วย velocity violation', () => {
    const sm = new RepStateMachine(config);
    sm.evaluate(createMockSkeleton(), 0);

    const flexed = createMockSkeleton();
    flexed[15] = { x: 0.62, y: 0.40, z: -0.08, visibility: 0.95 };
    sm.evaluate(flexed, 33);
    sm.evaluate(flexed, 66);
    sm.evaluate(createMockSkeleton(), 100);
    const lastRes = sm.evaluate(createMockSkeleton(), 200);

    expect(lastRes.completedReps).toBe(0);
  });

  it('Case (ช): ยกแขนไปด้านหน้า/ด้านข้างโดยไม่งอศอก (ศอกเหยียดตรง ~170°) - ต้องไม่นับครั้ง', () => {
    const sm = new RepStateMachine(config);
    let lastRes: any = null;

    for (let f = 0; f < 60; f++) {
      const skel = createMockSkeleton();
      skel[13] = { x: 0.65, y: 0.35, z: -0.25, visibility: 0.95 };
      skel[15] = { x: 0.65, y: 0.35, z: -0.50, visibility: 0.95 };
      lastRes = sm.evaluate(skel, f * 33.33);
    }

    expect(lastRes.completedReps).toBe(0);
    expect(lastRes.phase).toBe('IDLE');
  });

  it('Case (ซ): Lateral Elbow Drift (กางข้อศอกออกข้างลำตัวเกินเกณฑ์) - ต้องติด FormGate', () => {
    const sm = new RepStateMachine(config);
    // Start
    sm.evaluate(createMockSkeleton(), 0);

    // Flared elbow: shoulder at x=0.60, elbow flared to x=0.80 (|0.80 - 0.60| = 0.20 > drift tolerance 0.14)
    const flaredSkel = createMockSkeleton();
    flaredSkel[13] = { x: 0.80, y: 0.55, z: -0.05, visibility: 0.95 };
    flaredSkel[15] = { x: 0.70, y: 0.45, z: -0.08, visibility: 0.95 };

    const res = sm.evaluate(flaredSkel, 100);
    expect(res.formRating).toBe('error');
    expect(res.coachingMessageTh).toContain('แนบข้อศอก');
    expect(res.isInsideTargetZone).toBe(false);
  });

  it('Zero Regression Check: Wall Pushup (targetJoint: elbow) retains pushup kinematics', () => {
    const wallPushupConfig = {
      ...CLINICAL_EXERCISES_CONFIG['wall-pushup'],
      side: 'left' as const,
    };
    const sm = new RepStateMachine(wallPushupConfig);
    const skel = createMockSkeleton();
    const res = sm.evaluate(skel, 100);

    expect(res).toBeDefined();
    expect(res.completedReps).toBe(0);
  });
});
