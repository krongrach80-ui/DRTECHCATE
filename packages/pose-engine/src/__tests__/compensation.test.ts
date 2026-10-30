/**
 * packages/pose-engine/src/__tests__/compensation.test.ts
 *
 * Unit tests for SaMD Class II Biomechanical Compensation & Velocity Guard
 * 1. Scapular Hiking & Shoulder Elevation vs Ear Level
 * 2. Trunk Lateral Flexion (> 12°) & Posture Warnings
 * 3. Tempo & Angular Velocity Guard (ω = Δθ/Δt) & Rep Rejection
 * 4. Monocular Depth Normalization via Bi-Acromial Width
 */

import { describe, it, expect } from 'vitest';
import {
  ScapularHikingDetector,
  TrunkCompensationDetector,
  VelocityGuard,
  calculateTrunkLateralTilt,
  calculateBiAcromialWidth,
  normalizeLandmarksDepth,
  RepStateMachine,
  ExerciseDetectionConfig,
  PoseEngineLandmark,
} from '../index';

describe('Biomechanical Compensation & Velocity Guard Engine', () => {
  it('1. calculates bi-acromial width and lateral trunk tilt accurately', () => {
    const ls = { x: 0.4, y: 0.3, z: 0 };
    const rs = { x: 0.6, y: 0.3, z: 0 };
    const width = calculateBiAcromialWidth(ls, rs);
    expect(width).toBeCloseTo(0.2, 3);

    // Perfectly upright posture (mid-shoulder directly above mid-hip)
    const midShoulder = { x: 0.5, y: 0.3, z: 0 };
    const midHip = { x: 0.5, y: 0.7, z: 0 };
    const uprightTilt = calculateTrunkLateralTilt(midShoulder, midHip);
    expect(Math.round(uprightTilt)).toBe(0);

    // Lateral tilt of ~15° (tan(15°) ≈ 0.268; dx = 0.4 * 0.268 ≈ 0.107)
    const tiltedShoulder = { x: 0.5 + 0.107, y: 0.3, z: 0 };
    const tiltedDeg = calculateTrunkLateralTilt(tiltedShoulder, midHip);
    expect(Math.round(tiltedDeg)).toBe(15);
  });

  it('2. detects trunk lateral flexion exceeding 12° threshold', () => {
    const detector = new TrunkCompensationDetector(12.0);

    // Generate dummy skeleton with 33 landmarks
    const uprightLandmarks: PoseEngineLandmark[] = Array.from({ length: 33 }, () => ({
      x: 0.5,
      y: 0.5,
      z: 0,
    }));

    // Upright: Shoulders (11, 12) at y=0.3, Hips (23, 24) at y=0.7
    uprightLandmarks[11] = { x: 0.4, y: 0.3, z: 0 };
    uprightLandmarks[12] = { x: 0.6, y: 0.3, z: 0 };
    uprightLandmarks[23] = { x: 0.45, y: 0.7, z: 0 };
    uprightLandmarks[24] = { x: 0.55, y: 0.7, z: 0 };

    const uprightRes = detector.evaluate(uprightLandmarks);
    expect(uprightRes.isCompensating).toBe(false);

    // Tilted skeleton (> 12° lateral lean)
    const tiltedLandmarks: PoseEngineLandmark[] = JSON.parse(JSON.stringify(uprightLandmarks));
    tiltedLandmarks[11].x += 0.15;
    tiltedLandmarks[12].x += 0.15;

    const tiltedRes = detector.evaluate(tiltedLandmarks);
    expect(tiltedRes.isCompensating).toBe(true);
    expect(tiltedRes.lateralTiltDeg).toBeGreaterThan(12.0);
    expect(tiltedRes.messageTh).toBe('รักษาลำตัวให้ตั้งตรง อย่าเอียงตัวช่วยยก');
  });

  it('3. detects scapular hiking when shoulders elevate towards ear level', () => {
    const detector = new ScapularHikingDetector();

    const landmarks: PoseEngineLandmark[] = Array.from({ length: 33 }, () => ({
      x: 0.5,
      y: 0.5,
      z: 0,
    }));

    // Normal posture: Ears at y=0.15, Shoulders at y=0.35 (distance = 0.20)
    landmarks[7] = { x: 0.42, y: 0.15, z: 0 }; // Left ear
    landmarks[8] = { x: 0.58, y: 0.15, z: 0 }; // Right ear
    landmarks[11] = { x: 0.4, y: 0.35, z: 0 }; // Left shoulder
    landmarks[12] = { x: 0.6, y: 0.35, z: 0 }; // Right shoulder

    const normalRes = detector.evaluate(landmarks);
    expect(normalRes.isHiked).toBe(false);

    // Hiked posture: Left shoulder elevated to y=0.17 (ear-shoulder dist = 0.02)
    const hikedLandmarks: PoseEngineLandmark[] = JSON.parse(JSON.stringify(landmarks));
    hikedLandmarks[11].y = 0.17;

    const hikedRes = detector.evaluate(hikedLandmarks);
    expect(hikedRes.isHiked).toBe(true);
    expect(hikedRes.messageTh).toBe('ผ่อนคลายหัวไหล่ลง อย่าเกร็งหรือยักไหล่ขึ้น');
  });

  it('4. velocity guard calculates angular speed and flags tempo violations', () => {
    const guard = new VelocityGuard(180.0); // max 180°/s

    // First frame at t = 1000ms, angle = 20°
    const r1 = guard.update(20, 1000);
    expect(r1.isViolated).toBe(false);

    // Smooth movement: 30° at t = 1100ms (10° in 100ms = 100°/s < 180°/s)
    const r2 = guard.update(30, 1100);
    expect(r2.angularVelocityDegPerSec).toBeCloseTo(100, 0);
    expect(r2.isViolated).toBe(false);

    // Violent jerk: 90° at t = 1200ms (60° in 100ms = 600°/s > 180°/s)
    const r3 = guard.update(90, 1200);
    expect(r3.angularVelocityDegPerSec).toBeGreaterThan(180);
    expect(r3.isViolated).toBe(true);
    expect(r3.messageTh).toBe('เคลื่อนไหวช้าลง ควบคุมจังหวะให้สม่ำเสมอ');
    expect(guard.hasRepViolation()).toBe(true);
  });

  it('5. normalizes landmark coordinates to eliminate camera depth drift', () => {
    const landmarks: PoseEngineLandmark[] = Array.from({ length: 33 }, () => ({
      x: 0.5,
      y: 0.5,
      z: 0.8,
    }));

    // Patient close to camera (bi-acromial width = 0.40)
    landmarks[11] = { x: 0.3, y: 0.3, z: 0.8 };
    landmarks[12] = { x: 0.7, y: 0.3, z: 0.8 };

    const normalized = normalizeLandmarksDepth(landmarks, 0.25);
    const normalizedWidth = calculateBiAcromialWidth(normalized[11], normalized[12]);
    expect(normalizedWidth).toBeCloseTo(0.25, 2);
  });

  it('6. rejects rep when velocity guard records a tempo violation during repetition', () => {
    const config: ExerciseDetectionConfig = {
      nameTh: 'ทดสอบกางแขน',
      nameEn: 'Shoulder Abduction Test',
      evaluationMode: 'angle_rep_hold',
      side: 'right',
      targetJoint: 'shoulder',
      cameraGuide: {
        recommendedView: 'front',
        recommendedDistanceMeters: [1.5, 2.5],
        instructionTextTh: 'ยืนตรงหน้ากล้อง',
      },
      angleMechanics: {
        landmarks: {
          left: { pointA: 23, vertex: 11, pointB: 13, use3DWorld: false },
          right: { pointA: 24, vertex: 12, pointB: 14, use3DWorld: false },
        },
        startAngleDeg: 15,
        targetMinDeg: 80,
        targetMaxDeg: 100,
        toleranceDeg: 10,
        holdDurationSec: 0.4,
      },
      safetyContraindications: {
        stopOnPainMessageTh: 'หยุดทันทีหากเจ็บ',
        maxSafeAngleCapDeg: 170,
        maxSafeVelocityDegPerSec: 150.0,
      },
      compensationRules: [],
      defaultPrescription: {
        repsPerSet: 5,
        totalSets: 1,
        restBetweenSetsSec: 30,
      },
    };

    const sm = new RepStateMachine(config);

    // Build base landmark skeleton
    const skeleton: PoseEngineLandmark[] = Array.from({ length: 33 }, () => ({
      x: 0.5,
      y: 0.5,
      z: 0,
    }));
    skeleton[7] = { x: 0.45, y: 0.2, z: 0 };
    skeleton[8] = { x: 0.55, y: 0.2, z: 0 };
    skeleton[11] = { x: 0.4, y: 0.35, z: 0 };
    skeleton[12] = { x: 0.6, y: 0.35, z: 0 };
    skeleton[23] = { x: 0.45, y: 0.7, z: 0 };
    skeleton[24] = { x: 0.55, y: 0.7, z: 0 };

    // 1. Start position (angle ~ 15°)
    skeleton[14] = { x: 0.62, y: 0.55, z: 0 }; // Arm resting alongside torso
    sm.evaluate(skeleton, 1000);

    // 2. Jerk upwards rapidly (> 300°/s) to target zone (90°)
    skeleton[14] = { x: 0.85, y: 0.35, z: 0 }; // 90° horizontal
    const jerkResult = sm.evaluate(skeleton, 1100); // 100ms delta
    expect(jerkResult.angularVelocityDegPerSec).toBeGreaterThan(150);
    expect(jerkResult.formRating).toBe('error');

    // 3. Reach target and hold until RETURNING_TO_START
    let holdResult = sm.evaluate(skeleton, 1200);
    for (let t = 1300; t <= 2200; t += 100) {
      holdResult = sm.evaluate(skeleton, t);
      if (holdResult.phase === 'RETURNING_TO_START') break;
    }
    expect(holdResult.phase).toBe('RETURNING_TO_START');

    // 4. Return to start position over multiple frames
    skeleton[14] = { x: 0.62, y: 0.55, z: 0 };
    let rejectionResult;
    for (let t = 2300; t <= 3500; t += 100) {
      const res = sm.evaluate(skeleton, t);
      if (res.isRepRejected) {
        rejectionResult = res;
        break;
      }
    }

    // The rep should be rejected!
    expect(rejectionResult).toBeDefined();
    expect(rejectionResult?.isRepRejected).toBe(true);
    expect(rejectionResult?.completedReps).toBe(0);
    expect(rejectionResult?.incorrectReps).toBe(1);
    expect(rejectionResult?.coachingMessageTh).toContain('เคลื่อนไหวช้าลง ควบคุมจังหวะให้สม่ำเสมอ');
  });
});
