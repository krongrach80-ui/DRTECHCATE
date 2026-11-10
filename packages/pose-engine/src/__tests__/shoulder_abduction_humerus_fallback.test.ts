import { describe, it, expect } from 'vitest';
import { RepStateMachine } from '../engine/repStateMachine';
import { CLINICAL_EXERCISES_CONFIG } from '../presets/exercises.config';
import { PoseEngineLandmark } from '../types/exerciseConfig';

function createMockLandmarks(elbowX: number, elbowY: number, elbowVis: number = 0.85): PoseEngineLandmark[] {
  const landmarks: PoseEngineLandmark[] = [];
  for (let i = 0; i < 33; i++) {
    landmarks.push({ x: 0.5, y: 0.5, z: 0, visibility: 0.9 });
  }
  // Head / Ears / Eyes (above shoulders)
  landmarks[0] = { x: 0.5, y: 0.2, z: 0, visibility: 0.95 };
  landmarks[7] = { x: 0.45, y: 0.25, z: 0, visibility: 0.95 };
  landmarks[8] = { x: 0.55, y: 0.25, z: 0, visibility: 0.95 };

  // Left Shoulder (11) and Right Shoulder (12)
  landmarks[11] = { x: 0.4, y: 0.4, z: 0, visibility: 0.9 };
  landmarks[12] = { x: 0.6, y: 0.4, z: 0, visibility: 0.9 };

  // Right Elbow (14) - user's right arm (testing lateral abduction)
  landmarks[14] = { x: elbowX, y: elbowY, z: 0, visibility: elbowVis };

  // Left Elbow (13) - resting at side
  landmarks[13] = { x: 0.4, y: 0.65, z: 0, visibility: 0.85 };

  // Hips
  landmarks[23] = { x: 0.45, y: 0.75, z: 0, visibility: 0.8 };
  landmarks[24] = { x: 0.55, y: 0.75, z: 0, visibility: 0.8 };
  return landmarks;
}

describe('Shoulder Abduction Humerus Vector Fallback & Elevation Plane Leniency', () => {
  it('1. Calculates abduction angle via lateral humerus vector when elbow touches boundary', () => {
    const config = { ...CLINICAL_EXERCISES_CONFIG['shoulder-abduction'], side: 'right' as const };
    const sm = new RepStateMachine(config);

    // Initial resting posture: right arm down (x: 0.61, y: 0.65)
    const restLandmarks = createMockLandmarks(0.61, 0.65);
    const restRes = sm.evaluate(restLandmarks, 1000);
    expect(restRes.phase).toBe('IDLE');
    expect(restRes.currentAngleDeg).toBeLessThanOrEqual(35);

    // User raises arm laterally to 90 degrees horizontal, clipping frame boundary (x: 1.02, vis: 0.30):
    // Right shoulder is at (0.6, 0.4). Elbow moves outward to (1.02, 0.4) touching edge.
    // Feed frames so the OneEuroFilter settles
    const abductedLandmarks = createMockLandmarks(1.02, 0.4, 0.3);
    sm.evaluate(abductedLandmarks, 1100);
    sm.evaluate(abductedLandmarks, 1200);
    const abductedRes = sm.evaluate(abductedLandmarks, 1300);

    expect(abductedRes.readinessStatus).toBe('partial_upper_body');
    expect(abductedRes.currentAngleDeg).toBeGreaterThanOrEqual(80);
    expect(abductedRes.phase).toBe('HOLDING_TARGET');
    expect(abductedRes.isInsideTargetZone).toBe(true);
  });

  it('2. Supports Dynamic Clinical Prescription Override for targetMinDeg', () => {
    const configWithOverride = {
      ...CLINICAL_EXERCISES_CONFIG['shoulder-abduction'],
      targetMinDegOverride: 60, // e.g. for Frozen Shoulder patient
      side: 'right' as const,
    };
    const sm = new RepStateMachine(configWithOverride);

    // Raise arm partially to ~65 degrees: dx = 0.3, dy = 0.15
    const partialLandmarks = createMockLandmarks(0.9, 0.55);
    const res = sm.evaluate(partialLandmarks, 1000);

    expect(res.targetAngleDeg).toBe(60);
    expect(res.currentAngleDeg).toBeGreaterThanOrEqual(55);
  });

  it('3. Successfully counts 1 complete rep after 1.0s hold and return to start', () => {
    const config = { ...CLINICAL_EXERCISES_CONFIG['shoulder-abduction'], side: 'right' as const };
    const sm = new RepStateMachine(config);

    // 1. Start in IDLE
    sm.evaluate(createMockLandmarks(0.61, 0.65), 1000);

    // 2. Abduct arm to 90 degrees touching edge (feed settling frames)
    const abducted = createMockLandmarks(1.02, 0.4, 0.3);
    sm.evaluate(abducted, 1100);
    sm.evaluate(abducted, 1200);
    const holdStart = sm.evaluate(abducted, 1300);
    expect(holdStart.phase).toBe('HOLDING_TARGET');

    // 3. Hold for 1.1s in target zone
    sm.evaluate(abducted, 1800);
    const holdEnd = sm.evaluate(abducted, 2450);
    expect(holdEnd.phase).toBe('RETURNING_TO_START');

    // 4. Return to start position (feed settling frames)
    const rest = createMockLandmarks(0.61, 0.65);
    sm.evaluate(rest, 2600);
    sm.evaluate(rest, 2700);
    const returned = sm.evaluate(rest, 2900);
    expect(returned.completedReps).toBe(1);
  });

  it('4. [ข้อจำกัดที่ทราบแล้ว] Out-of-frame elbow clamp yields a finite angle below the raw geometric angle', () => {
    const config = { ...CLINICAL_EXERCISES_CONFIG['shoulder-abduction'], side: 'right' as const };
    const sm = new RepStateMachine(config);

    // Elbow past the right and bottom frame edges. x > 0.99 and y > 0.99 make it unusable,
    // so the desk-mode humerus fallback runs with coordinates clamped to [0, 1].
    // Shoulder (0.6, 0.4). Raw elbow (1.2, 1.1) gives about 40.6 deg from straight down.
    // Clamped elbow (1.0, 1.0) gives about 33.7 deg.
    // This documents a known limitation of clamping, not a precision guarantee.
    const shoulder = { x: 0.6, y: 0.4 };
    const rawElbow = { x: 1.2, y: 1.1 };
    const rawDx = rawElbow.x - shoulder.x;
    const rawDy = rawElbow.y - shoulder.y;
    const rawGeometricDeg = (Math.acos(rawDy / Math.hypot(rawDx, rawDy)) * 180) / Math.PI;

    const clampedX = Math.min(1.0, rawElbow.x);
    const clampedY = Math.min(1.0, rawElbow.y);
    const clampedDx = clampedX - shoulder.x;
    const clampedDy = clampedY - shoulder.y;
    const clampedDeg = (Math.acos(clampedDy / Math.hypot(clampedDx, clampedDy)) * 180) / Math.PI;

    const frame = createMockLandmarks(rawElbow.x, rawElbow.y, 0.3);
    sm.evaluate(frame, 1000);
    sm.evaluate(frame, 1100);
    const res = sm.evaluate(frame, 1200);

    expect(Number.isFinite(res.currentAngleDeg)).toBe(true);
    expect(res.currentAngleDeg).toBeLessThan(rawGeometricDeg);
    expect(res.currentAngleDeg).toBeCloseTo(clampedDeg, 0);
  });
});
