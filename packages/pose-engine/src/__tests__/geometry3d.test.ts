/**
 * packages/pose-engine/src/__tests__/geometry3d.test.ts
 *
 * Unit tests for 3D/2D joint angles, trunk forward tilt, and bone-length sanity.
 */

import { describe, it, expect } from 'vitest';
import {
  calculateAngle2D,
  calculateAngle3D,
  calculateTrunkForwardTilt,
  calculateBoneLengthSanity,
  distance2D,
  distance3D,
} from '../math/geometry3d';

describe('Biomechanical Geometry & Kinematics Math', () => {
  it('1. calculates exact 2D planar angles (0°, 90°, 180°)', () => {
    // 90 degrees right angle: (1, 0) -> (0, 0) -> (0, 1)
    const pA = { x: 1, y: 0 };
    const vertex = { x: 0, y: 0 };
    const pB = { x: 0, y: 1 };
    const angle90 = calculateAngle2D(pA, vertex, pB);
    expect(Math.round(angle90)).toBe(90);

    // 180 degrees straight line: (-1, 0) -> (0, 0) -> (1, 0)
    const pStraightA = { x: -1, y: 0 };
    const pStraightB = { x: 1, y: 0 };
    const angle180 = calculateAngle2D(pStraightA, vertex, pStraightB);
    expect(Math.round(angle180)).toBe(180);

    // 0 degrees folded ray: (1, 0) -> (0, 0) -> (1, 0)
    const angle0 = calculateAngle2D(pA, vertex, pA);
    expect(Math.round(angle0)).toBe(0);

    // 45 degrees angle: (1, 0) -> (0, 0) -> (1, 1)
    const p45 = { x: 1, y: 1 };
    const angle45 = calculateAngle2D(pA, vertex, p45);
    expect(Math.round(angle45)).toBe(45);
  });

  it('2. calculates exact 3D spatial angles with depth z', () => {
    const pA = { x: 0, y: 1, z: 0 };
    const vertex = { x: 0, y: 0, z: 0 };
    const pB = { x: 0, y: 0, z: 1 };

    const angle3D = calculateAngle3D(pA, vertex, pB);
    expect(Math.round(angle3D)).toBe(90);

    // 45 degrees in 3D
    const pC = { x: 0, y: 1, z: 1 };
    const angle3D45 = calculateAngle3D(pA, vertex, pC);
    expect(Math.round(angle3D45)).toBe(45);
  });

  it('3. calculates forward trunk tilt relative to vertical gravity axis', () => {
    // Upright posture: shoulder directly above hip (0° tilt)
    const uprightHip = { x: 0.5, y: 0.6, z: 0.0 };
    const uprightShoulder = { x: 0.5, y: 0.2, z: 0.0 };
    const uprightTilt = calculateTrunkForwardTilt(uprightShoulder, uprightHip);
    expect(Math.round(uprightTilt)).toBe(0);

    // Leaning forward at ~30° tilt (shoulder displaced horizontally by ~0.23 with dy=0.4)
    // tan(30°) ≈ 0.577; dx = 0.4 * 0.577 ≈ 0.231
    const leaningHip = { x: 0.5, y: 0.6, z: 0.0 };
    const leaningShoulder = { x: 0.5 + 0.231, y: 0.2, z: 0.0 };
    const leaningTilt = calculateTrunkForwardTilt(leaningShoulder, leaningHip);
    expect(Math.round(leaningTilt)).toBe(30);

    // 45° trunk lean: dx = dy = 0.4
    const lean45Shoulder = { x: 0.5 + 0.4, y: 0.2, z: 0.0 };
    const tilt45 = calculateTrunkForwardTilt(lean45Shoulder, leaningHip);
    expect(Math.round(tilt45)).toBe(45);
  });

  it('4. verifies bone-length sanity check against tracking spikes', () => {
    const pA = { x: 0, y: 0, z: 0 };
    const pB = { x: 0.3, y: 0, z: 0 };
    const expectedLength = 0.3;

    // Normal natural movement
    expect(calculateBoneLengthSanity(pA, pB, expectedLength, 0.2)).toBe(true);

    // Tracking glitch: arm suddenly doubles in length
    const glitchPoint = { x: 0.65, y: 0, z: 0 };
    expect(calculateBoneLengthSanity(pA, glitchPoint, expectedLength, 0.2)).toBe(false);
  });

  it('5. computes accurate Euclidean 2D and 3D distances', () => {
    const a = { x: 0, y: 0, z: 0 };
    const b = { x: 3, y: 4, z: 0 };
    expect(distance2D(a, b)).toBe(5);

    const c = { x: 0, y: 0, z: 12 };
    expect(distance3D(a, c)).toBe(12);

    const d = { x: 3, y: 4, z: 12 };
    expect(distance3D(a, d)).toBe(13);
  });
});
