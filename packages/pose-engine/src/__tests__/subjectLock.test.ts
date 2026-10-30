/**
 * packages/pose-engine/src/__tests__/subjectLock.test.ts
 *
 * Unit tests for Foreground Subject Locking & Occlusion Guard Engine
 */

import { describe, it, expect } from 'vitest';
import {
  calculateCenterOfMass,
  calculateBoundingBox,
  validateFrameIntegrity,
  lockPrimarySubject,
  ForegroundSubjectLocker,
} from '../subjectLock';
import { RepStateMachine } from '../engine/repStateMachine';
import { ExerciseDetectionConfig, PoseEngineLandmark } from '../types/exerciseConfig';

function createDummySkeleton(
  vis: number = 0.99,
  offsetX: number = 0,
  offsetY: number = 0
): PoseEngineLandmark[] {
  const skel: PoseEngineLandmark[] = Array.from({ length: 33 }, () => ({
    x: 0.5 + offsetX,
    y: 0.5 + offsetY,
    z: 0.0,
    visibility: vis,
    presence: vis,
  }));
  // Shoulders: 11, 12
  skel[11] = { x: 0.4 + offsetX, y: 0.3 + offsetY, z: 0.0, visibility: vis, presence: vis };
  skel[12] = { x: 0.6 + offsetX, y: 0.3 + offsetY, z: 0.0, visibility: vis, presence: vis };
  // Elbows: 13, 14
  skel[13] = { x: 0.35 + offsetX, y: 0.45 + offsetY, z: 0.0, visibility: vis, presence: vis };
  skel[14] = { x: 0.65 + offsetX, y: 0.45 + offsetY, z: 0.0, visibility: vis, presence: vis };
  // Wrists: 15, 16
  skel[15] = { x: 0.3 + offsetX, y: 0.6 + offsetY, z: 0.0, visibility: vis, presence: vis };
  skel[16] = { x: 0.7 + offsetX, y: 0.6 + offsetY, z: 0.0, visibility: vis, presence: vis };
  // Hips: 23, 24
  skel[23] = { x: 0.45 + offsetX, y: 0.7 + offsetY, z: 0.0, visibility: vis, presence: vis };
  skel[24] = { x: 0.55 + offsetX, y: 0.7 + offsetY, z: 0.0, visibility: vis, presence: vis };

  return skel;
}

describe('Foreground Subject Locking & Occlusion Guard', () => {
  it('1. calculates Center of Mass (CoM) and Bounding Box accurately', () => {
    const skel = createDummySkeleton(0.95);
    const com = calculateCenterOfMass(skel);

    // Mid-shoulder is (0.5, 0.3), Mid-hip is (0.5, 0.7) -> CoM = (0.5, 0.5)
    expect(com.x).toBeCloseTo(0.5, 2);
    expect(com.y).toBeCloseTo(0.5, 2);

    const bbox = calculateBoundingBox(skel);
    expect(bbox.minX).toBeCloseTo(0.3, 2);
    expect(bbox.maxX).toBeCloseTo(0.7, 2);
    expect(bbox.area).toBeGreaterThan(0.05);
  });

  it('2. validates frame integrity and rejects rapid lateral jumps (anti-hijack)', () => {
    const patientSkel = createDummySkeleton(0.95, 0, 0); // CoM.x ≈ 0.5
    // Bystander enters abruptly on right side: CoM.x ≈ 0.9 (jump = 0.4 > 0.35)
    const bystanderSkel = createDummySkeleton(0.95, 0.4, 0);

    // Normal smooth delta
    const validRes = validateFrameIntegrity(patientSkel, patientSkel, 33);
    expect(validRes.isValid).toBe(true);

    // Sudden jump within 40ms (< 50ms)
    const invalidRes = validateFrameIntegrity(bystanderSkel, patientSkel, 40);
    expect(invalidRes.isValid).toBe(false);
    expect(invalidRes.reason).toContain('hijack_detected');
  });

  it('3. lockPrimarySubject evaluates visibility and locks primary patient', () => {
    const highVisSkel = createDummySkeleton(0.92);
    const lockedRes = lockPrimarySubject(highVisSkel);
    expect(lockedRes.isSubjectLocked).toBe(true);
    expect(lockedRes.isOccluded).toBe(false);
    expect(lockedRes.averageVisibility).toBeGreaterThan(0.65);

    // Occluded / backlit patient (visibility = 0.40 < 0.65)
    const occludedSkel = createDummySkeleton(0.40);
    const occludedRes = lockPrimarySubject(occludedSkel);
    expect(occludedRes.isOccluded).toBe(true);
    expect(occludedRes.occlusionReasonTh).toBe('กรุณาขยับให้อยู่ในกรอบกล้องอย่างชัดเจน');
  });

  it('4. ForegroundSubjectLocker flags occlusion after 45 consecutive low-visibility frames', () => {
    const locker = new ForegroundSubjectLocker({ maxOcclusionFrames: 45, minKeypointVisibility: 0.65 });
    const lowVisSkel = createDummySkeleton(0.50);

    let res = locker.processFrame(lowVisSkel, 1000);
    // Frame 1: not yet 45 frames
    expect(res.isOccluded).toBe(false);
    expect(res.consecutiveOccludedFrames).toBe(1);

    // Simulate 44 more low-visibility frames
    for (let f = 2; f <= 45; f++) {
      res = locker.processFrame(lowVisSkel, 1000 + f * 33);
    }

    // At frame 45: occlusion triggers!
    expect(res.isOccluded).toBe(true);
    expect(res.consecutiveOccludedFrames).toBe(45);
    expect(res.occlusionReasonTh).toBe('กรุณาขยับให้อยู่ในกรอบกล้องอย่างชัดเจน');

    // Re-entering frame clears occlusion immediately
    const goodSkel = createDummySkeleton(0.95);
    res = locker.processFrame(goodSkel, 2600);
    expect(res.isOccluded).toBe(false);
    expect(res.consecutiveOccludedFrames).toBe(0);
  });

  it('5. ForegroundSubjectLocker drops frame when CoM jumps > 35% screen width in < 50ms', () => {
    const locker = new ForegroundSubjectLocker({
      maxJumpThresholdPercent: 0.35,
      maxJumpDeltaTimeMs: 50,
    });

    const skel1 = createDummySkeleton(0.95, 0, 0); // CoM = 0.5
    const r1 = locker.processFrame(skel1, 1000);
    expect(r1.isFrameDropped).toBe(false);

    // Bystander crosses frame rapidly at t = 1030ms (Δt = 30ms, Δx = 0.40 > 0.35)
    const skelBystander = createDummySkeleton(0.95, 0.40, 0); // CoM = 0.90
    const r2 = locker.processFrame(skelBystander, 1030);
    expect(r2.isFrameDropped).toBe(true);
    expect(r2.frameDropReason).toContain('hijack_detected');
  });

  it('6. RepStateMachine pauses hold progress timer when subject is occluded', () => {
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
          left: { pointA: 23, vertex: 11, pointB: 15, use3DWorld: false },
          right: { pointA: 24, vertex: 12, pointB: 16, use3DWorld: false },
        },
        startAngleDeg: 20,
        targetMinDeg: 80,
        targetMaxDeg: 100,
        toleranceDeg: 10,
        holdDurationSec: 2.0,
      },
      compensationRules: [],
      safetyContraindications: {
        stopOnPainMessageTh: 'หยุดทันทีหากเจ็บ',
        maxSafeAngleCapDeg: 120,
        maxSafeVelocityDegPerSec: 180,
      },
      defaultPrescription: { repsPerSet: 5, totalSets: 1, restBetweenSetsSec: 30 },
    };

    const sm = new RepStateMachine(config);

    // 1. Start position (angle ~ 20°)
    const skelResting = createDummySkeleton(0.95);
    skelResting[16] = { x: 0.63, y: 0.6, z: 0 };
    sm.evaluate(skelResting, 1000);

    // 2. Move to target zone (90° horizontal)
    const skelTarget = createDummySkeleton(0.95);
    skelTarget[16] = { x: 0.95, y: 0.3, z: 0 }; // 90°

    let res = sm.evaluate(skelTarget, 1100);
    for (let t = 1200; t <= 1500; t += 100) {
      res = sm.evaluate(skelTarget, t);
    }
    expect(res.phase).toBe('HOLDING_TARGET');

    // 3. Occlusion occurs during hold: simulate 45 low visibility frames
    const occludedTarget = createDummySkeleton(0.40);
    occludedTarget[16] = { x: 0.95, y: 0.3, z: 0, visibility: 0.4 };

    let occludedRes = res;
    for (let t = 1600; t <= 3200; t += 33) {
      occludedRes = sm.evaluate(occludedTarget, t);
    }

    // Hold progress must be paused while occluded
    expect(occludedRes.isOccluded).toBe(true);
    expect(occludedRes.coachingMessageTh).toContain('กรุณาขยับให้อยู่ในกรอบกล้องอย่างชัดเจน');
    // Even though 1.6s elapsed, holdProgressRatio did NOT finish because hold was paused!
    expect(occludedRes.phase).toBe('HOLDING_TARGET');
    expect(occludedRes.holdProgressRatio).toBeLessThan(1.0);
  });
});
