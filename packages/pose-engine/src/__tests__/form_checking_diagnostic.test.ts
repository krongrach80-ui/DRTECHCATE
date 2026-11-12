import { describe, it, expect } from 'vitest';
import { CLINICAL_EXERCISES_CONFIG } from '../presets/exercises.config';
import { RepStateMachine } from '../engine/repStateMachine';
import { PoseEngineLandmark, RepEvaluationResult } from '../types/exerciseConfig';

function createBaseSkeleton(): PoseEngineLandmark[] {
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
  // Standard anatomical defaults (mirrored kiosk view: left arm at x > 0.5, right arm at x < 0.5)
  landmarks[7] = { x: 0.55, y: 0.20, z: 0.0, visibility: 0.95 }; // L Ear
  landmarks[8] = { x: 0.45, y: 0.20, z: 0.0, visibility: 0.95 }; // R Ear
  landmarks[11] = { x: 0.60, y: 0.35, z: 0.0, visibility: 0.95 }; // L Shoulder
  landmarks[12] = { x: 0.40, y: 0.35, z: 0.0, visibility: 0.95 }; // R Shoulder
  landmarks[13] = { x: 0.60, y: 0.50, z: 0.0, visibility: 0.95 }; // L Elbow (resting down)
  landmarks[14] = { x: 0.40, y: 0.50, z: 0.0, visibility: 0.95 }; // R Elbow
  landmarks[15] = { x: 0.60, y: 0.65, z: 0.0, visibility: 0.95 }; // L Wrist (resting down)
  landmarks[16] = { x: 0.40, y: 0.65, z: 0.0, visibility: 0.95 }; // R Wrist
  landmarks[23] = { x: 0.60, y: 0.65, z: 0.0, visibility: 0.95 }; // L Hip
  landmarks[24] = { x: 0.40, y: 0.65, z: 0.0, visibility: 0.95 }; // R Hip
  return landmarks;
}

describe('Active Shoulder Flexion Clinical Diagnostics (Step 1)', () => {
  const config = CLINICAL_EXERCISES_CONFIG['active-shoulder-flexion'];

  it('(ก) ท่าในภาพ: ศอกพับ ข้อมือสองข้างไขว้กันอยู่หน้าคาง', () => {
    const sm = new RepStateMachine(config);
    sm.setSide('left');
    let time = 1000;

    // 1. Resting at lap
    const skelRest = createBaseSkeleton();
    let res = sm.evaluate(skelRest, time);
    expect(res.phase).toBe('IDLE');

    // 2. Patient bends elbows, lifts both wrists crossed in front of chin
    // Chin is at (0.50, 0.22).
    // Left wrist at (0.54, 0.18, -0.16). Right wrist at (0.52, 0.18, -0.16).
    // Left elbow is bent at side/chest (0.58, 0.42, -0.05).
    const skelCrossed = createBaseSkeleton();
    skelCrossed[13] = { x: 0.58, y: 0.42, z: -0.05, visibility: 0.95 }; // L Elbow bent
    skelCrossed[14] = { x: 0.42, y: 0.42, z: -0.05, visibility: 0.95 }; // R Elbow bent
    skelCrossed[15] = { x: 0.54, y: 0.18, z: -0.16, visibility: 0.95 }; // L Wrist at chin
    skelCrossed[16] = { x: 0.52, y: 0.18, z: -0.16, visibility: 0.95 }; // R Wrist crossed at chin

    // Move to crossed pose over 300ms
    for (let i = 0; i < 8; i++) {
      time += 40;
      res = sm.evaluate(skelCrossed, time);
    }
    console.log('Case (ก) at crossed peak:', {
      phase: res.phase,
      currentAngleDeg: res.currentAngleDeg,
      accuracyPercent: res.accuracyPercent,
      coachingMessage: res.coachingMessage,
      isInsideTargetZone: res.isInsideTargetZone,
    });

    // Hold for 1.1s
    for (let i = 0; i < 28; i++) {
      time += 40;
      res = sm.evaluate(skelCrossed, time);
    }
    console.log('Case (ก) after hold:', {
      phase: res.phase,
      completedReps: res.completedReps,
    });

    // Return to lap
    for (let i = 0; i < 15; i++) {
      time += 40;
      res = sm.evaluate(skelRest, time);
    }
    console.log('Case (ก) after return to lap:', {
      phase: res.phase,
      completedReps: res.completedReps,
      accuracyPercent: res.accuracyPercent,
      coachingMessage: res.coachingMessage,
    });
  });

  it('(ข) ยกไปด้านข้าง (Lateral Abduction instead of Flexion)', () => {
    const sm = new RepStateMachine(config);
    sm.setSide('left');
    let time = 1000;
    const skelRest = createBaseSkeleton();
    sm.evaluate(skelRest, time);

    const skelAbd = createBaseSkeleton();
    // Arm lifts out laterally: Left elbow at x=0.75, y=0.35, wrist at x=0.90, y=0.35
    skelAbd[13] = { x: 0.75, y: 0.35, z: 0.0, visibility: 0.95 };
    skelAbd[15] = { x: 0.90, y: 0.35, z: 0.0, visibility: 0.95 };

    let res = sm.evaluate(skelRest, time);
    for (let i = 0; i < 35; i++) {
      time += 40;
      res = sm.evaluate(skelAbd, time);
    }
    console.log('Case (ข) Lateral Abduction peak:', {
      phase: res.phase,
      currentAngleDeg: res.currentAngleDeg,
      accuracyPercent: res.accuracyPercent,
      coachingMessage: res.coachingMessage,
      completedReps: res.completedReps,
    });
  });

  it('(ค) ศอกงอยกขึ้น (Elbow flexed 90° while humerus lifts forward)', () => {
    const sm = new RepStateMachine(config);
    sm.setSide('left');
    let time = 1000;
    const skelRest = createBaseSkeleton();
    sm.evaluate(skelRest, time);

    const skelElbowBent = createBaseSkeleton();
    // Humerus forward to horizontal, forearm bent upward at 90°
    skelElbowBent[13] = { x: 0.60, y: 0.35, z: -0.20, visibility: 0.95 }; // L Elbow lifted forward
    skelElbowBent[15] = { x: 0.60, y: 0.15, z: -0.20, visibility: 0.95 }; // L Wrist pointing up, elbow 90°
    let res = sm.evaluate(skelRest, time);
    for (let i = 0; i < 35; i++) {
      time += 40;
      res = sm.evaluate(skelElbowBent, time);
    }
    console.log('Case (ค) Elbow bent 90° peak:', {
      phase: res.phase,
      currentAngleDeg: res.currentAngleDeg,
      accuracyPercent: res.accuracyPercent,
      coachingMessage: res.coachingMessage,
      completedReps: res.completedReps,
    });
    // Return to lap
    for (let i = 0; i < 15; i++) {
      time += 40;
      res = sm.evaluate(skelRest, time);
    }
    console.log('Case (ค) after return to lap:', {
      completedReps: res.completedReps,
    });
  });

  it('(ง) เอนหลังยกแขน (Trunk Lean Backward)', () => {
    const sm = new RepStateMachine(config);
    sm.setSide('left');
    let time = 1000;
    const skelRest = createBaseSkeleton();
    sm.evaluate(skelRest, time);

    const skelTrunkLean = createBaseSkeleton();
    // Shoulders moved backward or tilted
    skelTrunkLean[11] = { x: 0.60, y: 0.35, z: 0.20, visibility: 0.95 };
    skelTrunkLean[12] = { x: 0.40, y: 0.35, z: 0.20, visibility: 0.95 };
    // Arm lifts forward
    skelTrunkLean[13] = { x: 0.60, y: 0.20, z: -0.15, visibility: 0.95 };
    skelTrunkLean[15] = { x: 0.60, y: 0.05, z: -0.30, visibility: 0.95 };

    let res = sm.evaluate(skelRest, time);
    for (let i = 0; i < 35; i++) {
      time += 40;
      res = sm.evaluate(skelTrunkLean, time);
    }
    console.log('Case (ง) Trunk lean peak:', {
      phase: res.phase,
      currentAngleDeg: res.currentAngleDeg,
      accuracyPercent: res.accuracyPercent,
      coachingMessage: res.coachingMessage,
      completedReps: res.completedReps,
    });
  });

  it('(จ) ยกแขนข้างที่ไม่ได้สั่ง (Prescribed Left, raised Right arm)', () => {
    const sm = new RepStateMachine(config);
    sm.setSide('left');
    let time = 1000;
    const skelRest = createBaseSkeleton();
    sm.evaluate(skelRest, time);

    const skelRightArm = createBaseSkeleton();
    // Left arm remains resting at (0.60, 0.65)
    // Right arm lifts forward to 150°
    skelRightArm[14] = { x: 0.40, y: 0.20, z: -0.20, visibility: 0.95 };
    skelRightArm[16] = { x: 0.40, y: 0.05, z: -0.35, visibility: 0.95 };

    let res = sm.evaluate(skelRest, time);
    for (let i = 0; i < 35; i++) {
      time += 40;
      res = sm.evaluate(skelRightArm, time);
    }
    console.log('Case (จ) Wrong side peak:', {
      phase: res.phase,
      currentAngleDeg: res.currentAngleDeg,
      accuracyPercent: res.accuracyPercent,
      coachingMessage: res.coachingMessage,
      completedReps: res.completedReps,
    });
  });

  it('(ฉ) ยกครึ่งทาง (Partial lift: 85° vs 140°)', () => {
    const sm = new RepStateMachine(config);
    sm.setSide('left');
    let time = 1000;
    const skelRest = createBaseSkeleton();
    sm.evaluate(skelRest, time);

    const skelPartial = createBaseSkeleton();
    // Arm lifts forward horizontally ~90°
    skelPartial[13] = { x: 0.60, y: 0.35, z: -0.15, visibility: 0.95 };
    skelPartial[15] = { x: 0.60, y: 0.35, z: -0.30, visibility: 0.95 };

    let res = sm.evaluate(skelRest, time);
    for (let i = 0; i < 35; i++) {
      time += 40;
      res = sm.evaluate(skelPartial, time);
    }
    console.log('Case (ฉ) Partial lift peak:', {
      phase: res.phase,
      currentAngleDeg: res.currentAngleDeg,
      accuracyPercent: res.accuracyPercent,
      coachingMessage: res.coachingMessage,
      completedReps: res.completedReps,
    });
  });

  it('(ช) ยกเร็วแบบสะบัด (Jerky/whipping movement)', () => {
    const sm = new RepStateMachine(config);
    sm.setSide('left');
    let time = 1000;
    const skelRest = createBaseSkeleton();
    sm.evaluate(skelRest, time);

    const skelTarget = createBaseSkeleton();
    skelTarget[13] = { x: 0.60, y: 0.20, z: -0.20, visibility: 0.95 };
    skelTarget[15] = { x: 0.60, y: 0.05, z: -0.35, visibility: 0.95 };

    // Jump to target in 40ms (2500 deg/s)
    time += 40;
    let res = sm.evaluate(skelTarget, time);
    // Return to lap in 40ms
    time += 40;
    res = sm.evaluate(skelRest, time);

    // In all incorrect cases, completed reps MUST BE 0!
    expect(res.completedReps).toBe(0);
    expect(res.phase).toBe('IDLE');
  });

  it('8. Valid Left Arm Shoulder Flexion: Straight elbow, forward plane, full hold completes 1 rep with high accuracy', () => {
    const sm = new RepStateMachine(config);
    sm.setSide('left');
    let time = 1000;

    // 1. Neutral starting pose
    const skelRest = createBaseSkeleton();
    let res = sm.evaluate(skelRest, time);
    expect(res.phase).toBe('IDLE');
    expect(res.accuracyPercent).toBe(100);

    // 2. Legitimate forward flexion: Left arm straight (Shoulder at 0.60, 0.35, 0; Elbow at 0.60, 0.20, -0.20; Wrist at 0.60, 0.05, -0.35)
    // Left elbow is extended ~180°
    // Left wrist is separated from right wrist (~0.45 >= 0.14)
    // Elevation plane is flexion (~90° forward)
    const skelFlex = createBaseSkeleton();
    skelFlex[13] = { x: 0.60, y: 0.20, z: -0.20, visibility: 0.95 }; // L Elbow straight forward
    skelFlex[15] = { x: 0.60, y: 0.05, z: -0.35, visibility: 0.95 }; // L Wrist extended near ear/target

    // Move to target smoothly over 600ms (15 frames)
    for (let i = 0; i < 15; i++) {
      time += 40;
      res = sm.evaluate(skelFlex, time);
    }
    expect(res.phase).toBe('HOLDING_TARGET');
    expect(res.isInsideTargetZone).toBe(true);
    expect(res.formRating).toBe('good');
    expect(res.accuracyPercent).toBeGreaterThanOrEqual(85);

    // Hold for 1.1s (28 frames)
    for (let i = 0; i < 28; i++) {
      time += 40;
      res = sm.evaluate(skelFlex, time);
    }
    expect(res.phase).toBe('RETURNING_TO_START');

    // Return to lap smoothly over 600ms (15 frames)
    for (let i = 0; i < 15; i++) {
      time += 40;
      res = sm.evaluate(skelRest, time);
    }

    expect(res.completedReps).toBe(1);
    expect(res.incorrectReps).toBe(0);
  });

  it('9. Valid Right Arm Shoulder Flexion: Straight elbow, forward plane, full hold completes 1 rep', () => {
    const sm = new RepStateMachine(config);
    sm.setSide('right');
    let time = 1000;

    const skelRest = createBaseSkeleton();
    let res = sm.evaluate(skelRest, time);
    expect(res.phase).toBe('IDLE');

    // Right arm straight forward: Right shoulder at (0.40, 0.35, 0), Elbow at (0.40, 0.20, -0.20), Wrist at (0.40, 0.05, -0.35)
    const skelFlexRight = createBaseSkeleton();
    skelFlexRight[14] = { x: 0.40, y: 0.20, z: -0.20, visibility: 0.95 };
    skelFlexRight[16] = { x: 0.40, y: 0.05, z: -0.35, visibility: 0.95 };

    // Move to target
    for (let i = 0; i < 15; i++) {
      time += 40;
      res = sm.evaluate(skelFlexRight, time);
    }
    expect(res.phase).toBe('HOLDING_TARGET');
    expect(res.isInsideTargetZone).toBe(true);

    // Hold 1.1s
    for (let i = 0; i < 28; i++) {
      time += 40;
      res = sm.evaluate(skelFlexRight, time);
    }
    expect(res.phase).toBe('RETURNING_TO_START');

    // Return to lap
    for (let i = 0; i < 15; i++) {
      time += 40;
      res = sm.evaluate(skelRest, time);
    }

    expect(res.completedReps).toBe(1);
    expect(res.incorrectReps).toBe(0);
  });

  it('10. Fail Closed: Low visibility landmark (<0.50) blocks target zone', () => {
    const sm = new RepStateMachine(config);
    sm.setSide('left');
    let time = 1000;

    const skelRest = createBaseSkeleton();
    sm.evaluate(skelRest, time);

    const skelOccluded = createBaseSkeleton();
    skelOccluded[13] = { x: 0.60, y: 0.20, z: -0.20, visibility: 0.30 }; // Low visibility elbow
    skelOccluded[15] = { x: 0.60, y: 0.05, z: -0.35, visibility: 0.95 };

    time += 40;
    const res = sm.evaluate(skelOccluded, time);
    expect(res.isInsideTargetZone).toBe(false);
    expect(res.accuracyPercent).toBe(0);
  });
});
