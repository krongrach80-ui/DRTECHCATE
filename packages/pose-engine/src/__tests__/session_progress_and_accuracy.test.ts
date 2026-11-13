import { describe, it, expect } from 'vitest';
import {
  calcProgressPercent,
  calcMultiSetProgress,
  calcJointScore,
  calcPoseAccuracy,
  updateSmoothedAccuracyEma,
  DEFAULT_ANGLE_TOLERANCE_DEG,
  DEFAULT_ANGLE_FALLOFF_DEG,
  MIN_JOINT_VISIBILITY,
  ACCURACY_EMA_ALPHA,
} from '../math/sessionProgressAndAccuracy';
import type {
  ExerciseDetectionConfig,
  PoseEngineLandmark,
} from '../types/exerciseConfig';

function makeEmptyLandmarks(count = 33): PoseEngineLandmark[] {
  return Array.from({ length: count }, () => ({
    x: 0.5,
    y: 0.5,
    z: 0,
    visibility: 0.99,
  }));
}

/**
 * Sets pointA, vertex, pointB in 2D so angle(pointA -> vertex -> pointB) == angleDeg.
 */
function setTripletAngle(
  landmarks: PoseEngineLandmark[],
  pointAIdx: number,
  vertexIdx: number,
  pointBIdx: number,
  angleDeg: number,
  visibility = 0.95
): void {
  const vx = 0.5;
  const vy = 0.5;
  const len = 0.2;
  const rad = (angleDeg * Math.PI) / 180;

  landmarks[vertexIdx] = { x: vx, y: vy, z: 0, visibility };
  landmarks[pointAIdx] = { x: vx + len, y: vy, z: 0, visibility };
  landmarks[pointBIdx] = {
    x: vx + len * Math.cos(rad),
    y: vy - len * Math.sin(rad),
    z: 0,
    visibility,
  };
}

function makeShoulderConfig(overrides: Partial<ExerciseDetectionConfig> = {}): ExerciseDetectionConfig {
  return {
    id: 'test-shoulder-flexion',
    nameTh: 'ทดสอบยกแขน',
    nameEn: 'Test Shoulder Flexion',
    evaluationMode: 'angle_rep_hold',
    side: 'both',
    lateralityMode: 'unilateral_or_bilateral',
    targetJoint: 'shoulder',
    defaultPrescription: {
      repsPerSet: 10,
      totalSets: 3,
      restBetweenSetsSec: 30,
      holdDurationSec: 2,
    },
    angleMechanics: {
      landmarks: {
        left: { pointA: 23, vertex: 11, pointB: 13 },
        right: { pointA: 24, vertex: 12, pointB: 14 },
      },
      startAngleDeg: 15,
      targetMinDeg: 140,
      targetMaxDeg: 180,
      toleranceDeg: 10,
      falloffDeg: 30,
      holdDurationSec: 2,
      direction: 'increase',
    },
    compensationRules: [],
    ...overrides,
  } as ExerciseDetectionConfig;
}

describe('calcProgressPercent', () => {
  it('computes normal progress percentages accurately', () => {
    expect(calcProgressPercent(0, 10)).toBe(0);
    expect(calcProgressPercent(5, 10)).toBe(50);
    expect(calcProgressPercent(10, 10)).toBe(100);
    expect(calcProgressPercent(1, 3)).toBeCloseTo(33.3333, 3);
  });

  it('clamps boundary values to [0, 100]', () => {
    expect(calcProgressPercent(15, 10)).toBe(100);
    expect(calcProgressPercent(-4, 10)).toBe(0);
    expect(calcProgressPercent(0.5, 10)).toBe(5);
  });

  it('returns 0 safely for invalid, zero, negative, null, undefined, or NaN inputs', () => {
    expect(calcProgressPercent(5, 0)).toBe(0);
    expect(calcProgressPercent(5, -10)).toBe(0);
    expect(calcProgressPercent(5, undefined)).toBe(0);
    expect(calcProgressPercent(5, null)).toBe(0);
    expect(calcProgressPercent(5, NaN)).toBe(0);
    expect(calcProgressPercent(5, Infinity)).toBe(0);
    expect(calcProgressPercent(undefined, 10)).toBe(0);
    expect(calcProgressPercent(null, 10)).toBe(0);
    expect(calcProgressPercent(NaN, 10)).toBe(0);
    expect(calcProgressPercent(Infinity, 10)).toBe(0);
    expect(calcProgressPercent(false, true)).toBe(0);
  });
});

describe('calcMultiSetProgress', () => {
  it('computes cumulative progress across sets accurately', () => {
    const mid = calcMultiSetProgress({
      completedSets: 1,
      currentSetReps: 5,
      totalSets: 3,
      repsPerSet: 10,
    });
    expect(mid.doneReps).toBe(15);
    expect(mid.totalTargetReps).toBe(30);
    expect(mid.progressPercent).toBe(50);
    expect(mid.displayPercent).toBe(50);
    expect(mid.isCompleted).toBe(false);

    const completed = calcMultiSetProgress({
      completedSets: 2,
      currentSetReps: 10,
      totalSets: 3,
      repsPerSet: 10,
    });
    expect(completed.doneReps).toBe(30);
    expect(completed.progressPercent).toBe(100);
    expect(completed.isCompleted).toBe(true);
  });

  it('returns 0% safely when totalSets or repsPerSet is zero or invalid', () => {
    const res = calcMultiSetProgress({
      completedSets: 1,
      currentSetReps: 5,
      totalSets: 0,
      repsPerSet: NaN,
    });
    expect(res.progressPercent).toBe(0);
    expect(res.displayPercent).toBe(0);
    expect(res.isCompleted).toBe(false);
  });
});

describe('calcJointScore', () => {
  it('returns 100 inside and at the edge of tolerance', () => {
    expect(calcJointScore(140, 140, 10, 30)).toBe(100);
    expect(calcJointScore(145, 140, 10, 30)).toBe(100);
    expect(calcJointScore(130, 140, 10, 30)).toBe(100);
    expect(calcJointScore(150, 140, 10, 30)).toBe(100);
  });

  it('decays linearly across the falloff zone and clamps at 0', () => {
    // error = 25 -> 1 - (25 - 10)/30 = 0.5 -> 50
    expect(calcJointScore(115, 140, 10, 30)).toBe(50);
    // error = 40 -> 1 - (40 - 10)/30 = 0 -> 0
    expect(calcJointScore(100, 140, 10, 30)).toBe(0);
    // beyond falloff -> clamped to 0
    expect(calcJointScore(50, 140, 10, 30)).toBe(0);
  });

  it('uses default tolerance/falloff when omitted or invalid and returns 0 on NaN/null angles', () => {
    expect(calcJointScore(140 - DEFAULT_ANGLE_TOLERANCE_DEG, 140)).toBe(100);
    expect(
      calcJointScore(140 - DEFAULT_ANGLE_TOLERANCE_DEG - DEFAULT_ANGLE_FALLOFF_DEG / 2, 140)
    ).toBe(50);

    expect(calcJointScore(NaN, 140)).toBe(0);
    expect(calcJointScore(null, 140)).toBe(0);
    expect(calcJointScore(undefined, 140)).toBe(0);
    expect(calcJointScore(140, NaN)).toBe(0);
    expect(calcJointScore(140, undefined)).toBe(0);
    expect(calcJointScore(Infinity, 140)).toBe(0);
  });
});

describe('calcPoseAccuracy', () => {
  it('returns no-pose status (null score, never 0%) when landmarks are missing or empty', () => {
    const cfg = makeShoulderConfig();
    const resNull = calcPoseAccuracy(null, cfg);
    expect(resNull.hasValidJoints).toBe(false);
    expect(resNull.score).toBeNull();
    expect(resNull.statusTextTh).toBe('ไม่พบท่าทาง ขยับให้เห็นทั้งตัว');

    const resEmpty = calcPoseAccuracy([], cfg);
    expect(resEmpty.hasValidJoints).toBe(false);
    expect(resEmpty.score).toBeNull();
  });

  it('returns no-pose status when all required joints are below MIN_JOINT_VISIBILITY', () => {
    const cfg = makeShoulderConfig({ side: 'left' });
    const lms = makeEmptyLandmarks();
    setTripletAngle(lms, 23, 11, 13, 140, MIN_JOINT_VISIBILITY - 0.1);

    const res = calcPoseAccuracy(lms, cfg);
    expect(res.hasValidJoints).toBe(false);
    expect(res.score).toBeNull();
    expect(res.statusTextTh).toBe('ไม่พบท่าทาง ขยับให้เห็นทั้งตัว');
  });

  it('computes 100% accuracy and high level badge when joints match target angles', () => {
    const cfg = makeShoulderConfig({ side: 'both' });
    const lms = makeEmptyLandmarks();
    setTripletAngle(lms, 23, 11, 13, 145, 0.95);
    setTripletAngle(lms, 24, 12, 14, 150, 0.95);

    const res = calcPoseAccuracy(lms, cfg);
    expect(res.hasValidJoints).toBe(true);
    expect(res.score).toBe(100);
    expect(res.displayPercent).toBe(100);
    expect(res.level).toBe('high');
    expect(res.worstJointHintTh).toBeNull();
  });

  it('averages valid bilateral sides with weights and skips low-visibility sides', () => {
    const cfg = makeShoulderConfig({
      side: 'both',
      angleMechanics: {
        landmarks: {
          left: { pointA: 23, vertex: 11, pointB: 13, weight: 2 },
          right: { pointA: 24, vertex: 12, pointB: 14, weight: 1 },
        },
        startAngleDeg: 15,
        targetMinDeg: 140,
        targetMaxDeg: 140,
        toleranceDeg: 10,
        falloffDeg: 30,
        holdDurationSec: 2,
      },
    });

    const bothValid = makeEmptyLandmarks();
    // left = 140° -> score 100 (weight 2)
    setTripletAngle(bothValid, 23, 11, 13, 140, 0.9);
    // right = 115° -> error 25° -> score 50 (weight 1)
    setTripletAngle(bothValid, 24, 12, 14, 115, 0.9);

    const weightedRes = calcPoseAccuracy(bothValid, cfg);
    expect(weightedRes.hasValidJoints).toBe(true);
    // (100*2 + 50*1) / 3 = 83.333...
    expect(weightedRes.score).toBeCloseTo(83.3333, 2);
    expect(weightedRes.level).toBe('medium');
    expect(weightedRes.worstJointHintTh).toBe('ยกแขนให้สูงขึ้นอีกเล็กน้อย');

    // Now make right joint low-visibility (< 0.5) -> skipped, only left counted -> 100%
    bothValid[14] = { ...bothValid[14], visibility: 0.3 };
    const filteredRes = calcPoseAccuracy(bothValid, cfg);
    expect(filteredRes.hasValidJoints).toBe(true);
    expect(filteredRes.jointScores.length).toBe(1);
    expect(filteredRes.score).toBe(100);
  });

  it('evaluates only the selected side when side is left or right', () => {
    const lms = makeEmptyLandmarks();
    setTripletAngle(lms, 23, 11, 13, 140, 0.9); // left = 100%
    setTripletAngle(lms, 24, 12, 14, 100, 0.9); // right = 0%

    const leftCfg = makeShoulderConfig({ side: 'left' });
    const rightCfg = makeShoulderConfig({ side: 'right' });

    expect(calcPoseAccuracy(lms, leftCfg).score).toBe(100);
    expect(calcPoseAccuracy(lms, rightCfg).score).toBe(0);
  });

  it('guards against zero-length vectors (coincident landmarks) without producing NaN', () => {
    const cfg = makeShoulderConfig({ side: 'left' });
    const lms = makeEmptyLandmarks();
    // PointA == Vertex (zero-length vector)
    lms[11] = { x: 0.5, y: 0.5, z: 0, visibility: 0.95 };
    lms[23] = { x: 0.5, y: 0.5, z: 0, visibility: 0.95 };
    lms[13] = { x: 0.6, y: 0.5, z: 0, visibility: 0.95 };

    const res = calcPoseAccuracy(lms, cfg);
    expect(res.hasValidJoints).toBe(false);
    expect(res.score).toBeNull();
    expect(res.score).not.toBeNaN();
  });
});

describe('updateSmoothedAccuracyEma', () => {
  it('smooths scores with EMA alpha and clears to null when rawScore is null', () => {
    expect(updateSmoothedAccuracyEma(null, 80, ACCURACY_EMA_ALPHA)).toBe(80);
    expect(updateSmoothedAccuracyEma(80, 100, 0.3)).toBeCloseTo(86, 5);
    expect(updateSmoothedAccuracyEma(86, null, 0.3)).toBeNull();
    expect(updateSmoothedAccuracyEma(86, NaN, 0.3)).toBeNull();
  });
});

