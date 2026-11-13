/**
 * packages/pose-engine/src/__tests__/arm_joint_processor.test.ts
 *
 * Unit tests for arm, elbow (13/14), and wrist (15/16) visibility filtering,
 * null safety, per-side 5-frame angle smoothing, missing-joint Thai coaching
 * debounce, and MIN_STABLE_FRAMES rep stability gating.
 */

import { describe, it, expect } from 'vitest';
import {
  VISIBILITY_THRESHOLD,
  SMOOTHING_WINDOW,
  MIN_STABLE_FRAMES,
  MISSING_ARM_JOINT_MESSAGES_TH,
  isLandmarkConfident,
  calculateVisibleJointAngle,
  calculateArmJointAngle,
  ArmAngleSmoother,
  MissingArmJointTracker,
  ArmPoseProcessor,
} from '../math/armJointProcessor';
import { calcPoseAccuracy } from '../math/sessionProgressAndAccuracy';
import type { ExerciseDetectionConfig, PoseEngineLandmark } from '../types/exerciseConfig';

function makeValidArmSkeleton(elbowAngleDeg: number = 90): PoseEngineLandmark[] {
  const landmarks: PoseEngineLandmark[] = Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.5,
    z: 0,
    visibility: 0.95,
    presence: 0.95,
  }));

  const len = 0.2;
  const rad = (elbowAngleDeg * Math.PI) / 180;

  // Left arm: Shoulder (11), Elbow (13) at (0.6, 0.5), Wrist (15) rotated by elbowAngleDeg
  landmarks[23] = { x: 0.6, y: 0.8, z: 0, visibility: 0.95, presence: 0.95 };
  landmarks[11] = { x: 0.6, y: 0.3, z: 0, visibility: 0.95, presence: 0.95 };
  landmarks[13] = { x: 0.6, y: 0.5, z: 0, visibility: 0.95, presence: 0.95 };
  landmarks[15] = {
    x: 0.6 + len * Math.sin(rad),
    y: 0.5 - len * Math.cos(rad),
    z: 0,
    visibility: 0.95,
    presence: 0.95,
  };
  landmarks[19] = {
    x: landmarks[15].x + 0.05,
    y: landmarks[15].y,
    z: 0,
    visibility: 0.95,
    presence: 0.95,
  };

  // Right arm: Shoulder (12), Elbow (14) at (0.4, 0.5), Wrist (16) rotated by elbowAngleDeg
  landmarks[24] = { x: 0.4, y: 0.8, z: 0, visibility: 0.95, presence: 0.95 };
  landmarks[12] = { x: 0.4, y: 0.3, z: 0, visibility: 0.95, presence: 0.95 };
  landmarks[14] = { x: 0.4, y: 0.5, z: 0, visibility: 0.95, presence: 0.95 };
  landmarks[16] = {
    x: 0.4 - len * Math.sin(rad),
    y: 0.5 - len * Math.cos(rad),
    z: 0,
    visibility: 0.95,
    presence: 0.95,
  };
  landmarks[20] = {
    x: landmarks[16].x - 0.05,
    y: landmarks[16].y,
    z: 0,
    visibility: 0.95,
    presence: 0.95,
  };

  return landmarks;
}

describe('armJointProcessor', () => {
  it('1. calculates elbow and shoulder angles accurately when visibility and presence >= VISIBILITY_THRESHOLD (0.5)', () => {
    expect(VISIBILITY_THRESHOLD).toBe(0.5);
    expect(SMOOTHING_WINDOW).toBe(5);
    expect(MIN_STABLE_FRAMES).toBe(3);

    const skel90 = makeValidArmSkeleton(90);
    expect(calculateArmJointAngle(skel90, 'left', 'elbow')).toBeCloseTo(90, 4);
    expect(calculateArmJointAngle(skel90, 'right', 'elbow')).toBeCloseTo(90, 4);

    const skel180 = makeValidArmSkeleton(180);
    expect(calculateArmJointAngle(skel180, 'left', 'elbow')).toBeCloseTo(180, 4);

    const skel45 = makeValidArmSkeleton(45);
    expect(calculateArmJointAngle(skel45, 'right', 'elbow')).toBeCloseTo(45, 4);
  });

  it('2. returns null (never 0 or NaN) and refuses target criteria when visibility or presence < VISIBILITY_THRESHOLD', () => {
    const skelLowElbowVis = makeValidArmSkeleton(45);
    skelLowElbowVis[13] = { ...skelLowElbowVis[13], visibility: 0.49 };
    expect(isLandmarkConfident(skelLowElbowVis[13])).toBe(false);
    expect(calculateArmJointAngle(skelLowElbowVis, 'left', 'elbow')).toBeNull();

    const skelLowWristPresence = makeValidArmSkeleton(45);
    skelLowWristPresence[16] = { ...skelLowWristPresence[16], visibility: 0.9, presence: 0.3 };
    expect(calculateArmJointAngle(skelLowWristPresence, 'right', 'elbow')).toBeNull();

    const processor = new ArmPoseProcessor({
      side: 'left',
      jointType: 'elbow',
      targetMinDeg: 35,
      targetMaxDeg: 55,
      direction: 'decrease',
    });
    const res = processor.processFrame(skelLowElbowVis);
    expect(res.rawAngleDeg).toBeNull();
    expect(res.smoothedAngleDeg).toBeNull();
    expect(res.isInsideTargetZone).toBe(false);
    expect(res.completedReps).toBe(0);

    const cfg: ExerciseDetectionConfig = {
      id: 'elbow-test',
      nameTh: 'ทดสอบงอศอก',
      nameEn: 'Elbow Test',
      evaluationMode: 'angle_rep_hold',
      side: 'left',
      targetJoint: 'elbow',
      framing: 'upper',
      angleMechanics: {
        landmarks: {
          left: { pointA: 11, vertex: 13, pointB: 15 },
          right: { pointA: 12, vertex: 14, pointB: 16 },
        },
        startAngleDeg: 160,
        targetMinDeg: 40,
        targetMaxDeg: 55,
        toleranceDeg: 10,
        holdDurationSec: 1,
        direction: 'decrease',
      },
      defaultPrescription: { repsPerSet: 10, totalSets: 3, restBetweenSetsSec: 30 },
      cameraGuide: {
        recommendedView: 'front',
        recommendedDistanceMeters: [1.5, 2.5],
        instructionTextTh: 'หันหน้าตรงให้เห็นแขนและข้อศอก',
      },
      safetyContraindications: {
        stopOnPainMessageTh: 'หยุดทันทีหากเจ็บ',
        maxSafeAngleCapDeg: 175,
      },
      compensationRules: [],
    };
    const acc = calcPoseAccuracy(skelLowElbowVis, cfg, 'left');
    expect(acc.hasValidJoints).toBe(false);
    expect(acc.score).toBeNull();
    expect(acc.missingJointHintTh).toBe(MISSING_ARM_JOINT_MESSAGES_TH.left.elbow);
  });

  it('3. safely returns null without throwing for incomplete landmarks, NaN coordinates, zero-length vectors, and empty arrays', () => {
    expect(calculateArmJointAngle([], 'left', 'elbow')).toBeNull();
    expect(calculateArmJointAngle(null, 'left', 'elbow')).toBeNull();
    expect(calculateArmJointAngle(undefined, 'right', 'elbow')).toBeNull();

    const partial = makeValidArmSkeleton(90).slice(0, 12);
    expect(calculateArmJointAngle(partial, 'left', 'elbow')).toBeNull();

    const nanSkel = makeValidArmSkeleton(90);
    nanSkel[15] = { x: Number.NaN, y: 0.5, z: 0, visibility: 0.95, presence: 0.95 };
    expect(calculateArmJointAngle(nanSkel, 'left', 'elbow')).toBeNull();

    const coincident = { x: 0.5, y: 0.5, z: 0, visibility: 0.95, presence: 0.95 };
    expect(calculateVisibleJointAngle(coincident, coincident, coincident)).toBeNull();
  });

  it('4. smooths angle spikes with SMOOTHING_WINDOW = 5 per side and resets that side immediately on null or reset()', () => {
    const smoother = new ArmAngleSmoother(SMOOTHING_WINDOW);

    // Warm up left window with stable 90 deg readings
    expect(smoother.smooth('left', 90)).toBe(90);
    expect(smoother.smooth('left', 90)).toBe(90);
    expect(smoother.smooth('left', 90)).toBe(90);
    expect(smoother.smooth('left', 90)).toBe(90);

    // Single-frame 150 deg outlier spike is dampened across the 5-frame window
    const spiked = smoother.smooth('left', 150);
    expect(spiked).toBe(102);
    expect(spiked!).toBeLessThan(150);

    // Right window stays independent from left
    expect(smoother.smooth('right', 60)).toBe(60);

    // Passing null resets left window while preserving right window
    expect(smoother.smooth('left', null)).toBeNull();
    expect(smoother.getWindow('left')).toHaveLength(0);
    expect(smoother.getWindow('right')).toHaveLength(1);
    expect(smoother.smooth('left', 40)).toBe(40);

    // Global reset (e.g., new exercise) clears both sides
    smoother.reset();
    expect(smoother.getWindow('left')).toHaveLength(0);
    expect(smoother.getWindow('right')).toHaveLength(0);
  });

  it('5. emits joint-specific Thai coaching cue only after a joint stays missing for > MIN_STABLE_FRAMES (3) frames', () => {
    const tracker = new MissingArmJointTracker(MIN_STABLE_FRAMES, VISIBILITY_THRESHOLD);

    const missingWristSkel = makeValidArmSkeleton(90);
    missingWristSkel[16] = { ...missingWristSkel[16], visibility: 0.2 };

    // Frames 1..3: suppressed (<= MIN_STABLE_FRAMES)
    for (let f = 1; f <= MIN_STABLE_FRAMES; f++) {
      const evalRes = tracker.update(missingWristSkel, 'right');
      expect(evalRes.missingJoints).toContain('wrist');
      expect(evalRes.reportedMissingJoint).toBeNull();
      expect(evalRes.coachingMessageTh).toBeNull();
    }

    // Frame 4 (> MIN_STABLE_FRAMES): emits right wrist specific Thai message
    const frame4 = tracker.update(missingWristSkel, 'right');
    expect(frame4.reportedMissingJoint).toBe('wrist');
    expect(frame4.coachingMessageTh).toBe(MISSING_ARM_JOINT_MESSAGES_TH.right.wrist);
    expect(frame4.coachingMessageTh).toContain('ข้อมือขวา');

    // Recovery resets missing counter immediately
    const recovered = tracker.update(makeValidArmSkeleton(90), 'right');
    expect(recovered.missingJoints).toHaveLength(0);
    expect(recovered.coachingMessageTh).toBeNull();

    // Missing left elbow > 3 frames emits left elbow specific message
    const missingLeftElbow = makeValidArmSkeleton(90);
    missingLeftElbow[13] = { ...missingLeftElbow[13], presence: 0.1 };
    for (let f = 0; f < MIN_STABLE_FRAMES; f++) {
      expect(tracker.update(missingLeftElbow, 'left').coachingMessageTh).toBeNull();
    }
    const leftElbowMsg = tracker.update(missingLeftElbow, 'left');
    expect(leftElbowMsg.reportedMissingJoint).toBe('elbow');
    expect(leftElbowMsg.coachingMessageTh).toBe(MISSING_ARM_JOINT_MESSAGES_TH.left.elbow);
    expect(leftElbowMsg.coachingMessageTh).toContain('ข้อศอกซ้าย');
  });

  it('6. resets consecutive target counter and blocks rep completion if elbow/wrist disappears mid-rep, requiring MIN_STABLE_FRAMES to count', () => {
    const processor = new ArmPoseProcessor({
      side: 'left',
      jointType: 'elbow',
      targetMinDeg: 35,
      targetMaxDeg: 55,
      returnThresholdDeg: 140,
      direction: 'decrease',
      smoothingWindow: 1, // direct angle check for deterministic phase boundaries
      minStableFrames: MIN_STABLE_FRAMES,
    });

    const flexedTarget = makeValidArmSkeleton(45);
    const extendedStart = makeValidArmSkeleton(160);
    const occludedWrist = makeValidArmSkeleton(45);
    occludedWrist[15] = { ...occludedWrist[15], visibility: 0.25 };

    // 2 frames in target (< MIN_STABLE_FRAMES = 3), then wrist drops out mid-rep
    expect(processor.processFrame(flexedTarget).stableTargetFrames).toBe(1);
    expect(processor.processFrame(flexedTarget).stableTargetFrames).toBe(2);

    const dropped = processor.processFrame(occludedWrist);
    expect(dropped.smoothedAngleDeg).toBeNull();
    expect(dropped.stableTargetFrames).toBe(0);
    expect(dropped.isTargetReached).toBe(false);

    // Returning immediately after dropout does NOT count a rep
    for (let i = 0; i < 4; i++) {
      const retRes = processor.processFrame(extendedStart);
      expect(retRes.completedReps).toBe(0);
      expect(retRes.repCounted).toBe(false);
    }

    // Complete rep validly with >= MIN_STABLE_FRAMES in target and >= MIN_STABLE_FRAMES back at start
    for (let i = 0; i < MIN_STABLE_FRAMES - 1; i++) {
      const r = processor.processFrame(flexedTarget);
      expect(r.isTargetReached).toBe(false);
    }
    const reached = processor.processFrame(flexedTarget);
    expect(reached.isTargetReached).toBe(true);
    expect(reached.completedReps).toBe(0);

    for (let i = 0; i < MIN_STABLE_FRAMES - 1; i++) {
      const r = processor.processFrame(extendedStart);
      expect(r.completedReps).toBe(0);
    }
    const counted = processor.processFrame(extendedStart);
    expect(counted.repCounted).toBe(true);
    expect(counted.completedReps).toBe(1);
  });
});
