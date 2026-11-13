import { describe, it, expect, vi } from 'vitest';
import {
  MATCH_THRESHOLD,
  MIN_MARGIN,
  REQUIRED_CONSECUTIVE_FRAMES,
  CONSECUTIVE_FRAME_WINDOW,
  isValidDescriptor,
  matchFace,
  evaluateConsecutiveFaceFrames,
  ConsecutiveFrameTracker,
  canAccessStaffRegistration,
  l2Normalize,
} from '../src/index';

function makeUnitBasis(dim: number, index: number, secondaryIndex?: number, secondaryWeight = 0): number[] {
  const vec = new Array(dim).fill(0);
  vec[index] = 1;
  if (secondaryIndex !== undefined && secondaryWeight !== 0) {
    vec[secondaryIndex] = secondaryWeight;
  }
  return l2Normalize(vec);
}

describe('Face Login Security & Biometric Gate (MATCH_THRESHOLD / MIN_MARGIN / Consecutive Frames)', () => {
  it('exposes configured constants with strict defaults', () => {
    expect(MATCH_THRESHOLD).toBe(0.45);
    expect(MIN_MARGIN).toBe(0.08);
    expect(REQUIRED_CONSECUTIVE_FRAMES).toBe(3);
    expect(CONSECUTIVE_FRAME_WINDOW).toBe(5);
  });

  it('matches exact registered User A (distance <= 0.45, margin >= 0.08) and never enters User B', () => {
    const vecA = makeUnitBasis(128, 0);
    const vecB = makeUnitBasis(128, 1);
    // Probe closely resembles A (distance ~ 0.198 < 0.45) and is far from B (distance ~ 1.40)
    const probeA = makeUnitBasis(128, 0, 2, 0.2);

    const decision = matchFace(probeA, [
      { userId: 'user_A', status: 'face_enrolled', faceConfirmed: true, descriptor: vecA },
      { userId: 'user_B', status: 'face_enrolled', faceConfirmed: true, descriptor: vecB },
    ]);

    expect(decision.matched).toBe(true);
    expect(decision.status).toBe('MATCHED');
    expect(decision.userId).toBe('user_A');
    expect(decision.distance).toBeLessThanOrEqual(MATCH_THRESHOLD);
    expect(decision.margin).toBeGreaterThanOrEqual(MIN_MARGIN);
    expect(decision.showStaffRegisterButton).toBe(false);
  });

  it('rejects unregistered stranger when distance > MATCH_THRESHOLD (0.45) with "ไม่พบบัญชี"', () => {
    const vecA = makeUnitBasis(128, 0);
    const vecB = makeUnitBasis(128, 1);
    const strangerVec = makeUnitBasis(128, 10);

    const decision = matchFace(strangerVec, [
      { userId: 'user_A', status: 'face_enrolled', faceConfirmed: true, descriptor: vecA },
      { userId: 'user_B', status: 'face_enrolled', faceConfirmed: true, descriptor: vecB },
    ]);

    expect(decision.matched).toBe(false);
    expect(decision.status).toBe('NOT_FOUND');
    expect(decision.userId).toBeNull();
    expect(decision.distance).toBeGreaterThan(MATCH_THRESHOLD);
    expect(decision.message).toBe('ไม่พบบัญชี');
    expect(decision.showStaffRegisterButton).toBe(true);
  });

  it('rejects ambiguous match when distance <= 0.45 but margin between 1st and 2nd account < MIN_MARGIN (0.08)', () => {
    // Construct A and B so probe sits nearly halfway between them, with distances ~0.36 and ~0.40 (margin ~0.04 < 0.08)
    const probe = makeUnitBasis(128, 0);
    // For unit vectors: distance = sqrt(2 - 2*cos(theta)) -> cos = 1 - d^2 / 2
    // d1 = 0.36 -> cos1 = 0.9352, d2 = 0.40 -> cos2 = 0.9200 => margin = 0.04 < 0.08
    const vecA = new Array(128).fill(0);
    vecA[0] = 0.9352;
    vecA[1] = Math.sqrt(1 - 0.9352 * 0.9352);

    const vecB = new Array(128).fill(0);
    vecB[0] = 0.9200;
    vecB[2] = Math.sqrt(1 - 0.9200 * 0.9200);

    const decision = matchFace(probe, [
      { userId: 'user_A', status: 'face_enrolled', faceConfirmed: true, descriptor: vecA },
      { userId: 'user_B', status: 'face_enrolled', faceConfirmed: true, descriptor: vecB },
    ]);

    expect(decision.matched).toBe(false);
    expect(decision.status).toBe('NOT_FOUND');
    expect(decision.userId).toBeNull();
    expect(decision.reason).toBe('BELOW_MIN_MARGIN');
    expect(decision.margin).toBeLessThan(MIN_MARGIN);
    expect(decision.message).toBe('ไม่พบบัญชี');
    expect(decision.showStaffRegisterButton).toBe(true);
  });

  it('safely returns "ไม่พบบัญชี" without throwing on invalid probe descriptors (null, empty, NaN, wrong length, zero vector)', () => {
    const vecA = makeUnitBasis(128, 0);
    const accounts = [{ userId: 'user_A', status: 'face_enrolled', faceConfirmed: true, descriptor: vecA }];

    const nanVec = makeUnitBasis(128, 0);
    nanVec[5] = Number.NaN;

    const zeroVec = new Array(128).fill(0);
    const wrongLenVec = makeUnitBasis(64, 0);

    const invalidProbes: unknown[] = [null, undefined, [], nanVec, zeroVec, wrongLenVec, 'not-a-vector'];

    for (const bad of invalidProbes) {
      expect(isValidDescriptor(bad)).toBe(false);
      const res = matchFace(bad, accounts);
      expect(res.matched).toBe(false);
      expect(res.status).toBe('NOT_FOUND');
      expect(res.userId).toBeNull();
      expect(res.message).toBe('ไม่พบบัญชี');
      expect(res.showStaffRegisterButton).toBe(true);
    }
  });

  it('skips enrolled accounts with missing/invalid descriptors and logs a warning without falling back to the first account', () => {
    const warnSpy = vi.fn();
    const vecB = makeUnitBasis(128, 1);
    const probeB = makeUnitBasis(128, 1, 3, 0.1);

    const decision = matchFace(
      probeB,
      [
        { userId: 'user_no_vec', status: 'face_enrolled', faceConfirmed: true, descriptor: null },
        { userId: 'user_nan_vec', status: 'face_enrolled', faceConfirmed: true, descriptor: [Number.NaN] },
        { userId: 'user_archived', status: 'archived', faceConfirmed: true, descriptor: probeB },
        { userId: 'user_B', status: 'face_enrolled', faceConfirmed: true, descriptor: vecB },
      ],
      { onWarn: warnSpy }
    );

    expect(warnSpy).toHaveBeenCalledTimes(2);
    expect(decision.matched).toBe(true);
    expect(decision.userId).toBe('user_B');
  });

  it('requires REQUIRED_CONSECUTIVE_FRAMES (3) consecutive frames for the same userId and resets on user switch or mismatch', () => {
    const vecA = makeUnitBasis(128, 0);
    const vecB = makeUnitBasis(128, 1);
    const accounts = [
      { userId: 'user_A', status: 'face_enrolled', faceConfirmed: true, descriptor: vecA },
      { userId: 'user_B', status: 'face_enrolled', faceConfirmed: true, descriptor: vecB },
    ];

    const frameA = makeUnitBasis(128, 0, 4, 0.1);
    const frameB = makeUnitBasis(128, 1, 5, 0.1);
    const frameStranger = makeUnitBasis(128, 20);

    // Alternating A, B, A, B -> must NOT log in
    const alternating = evaluateConsecutiveFaceFrames([frameA, frameB, frameA, frameB, frameA], accounts);
    expect(alternating.matched).toBe(false);
    expect(alternating.userId).toBeNull();

    // Only 2 consecutive frames of A then stranger -> must NOT log in
    const brokenStreak = evaluateConsecutiveFaceFrames([frameA, frameA, frameStranger, frameA], accounts);
    expect(brokenStreak.matched).toBe(false);

    // 1 mismatch followed by 3 consecutive frames of A (within 5 frames) -> PASSES for user_A
    const validStreak = evaluateConsecutiveFaceFrames([frameStranger, frameA, frameA, frameA], accounts);
    expect(validStreak.matched).toBe(true);
    expect(validStreak.userId).toBe('user_A');
    expect(validStreak.consecutiveCount).toBe(3);

    // Stateful tracker resets properly on new scan
    const tracker = new ConsecutiveFrameTracker(3, 5);
    expect(tracker.push(matchFace(frameA, accounts)).confirmed).toBe(false);
    expect(tracker.push(matchFace(frameA, accounts)).confirmed).toBe(false);
    tracker.reset();
    expect(tracker.push(matchFace(frameA, accounts)).confirmed).toBe(false);
  });

  it('restricts staff registration button & endpoint access to authenticated staff roles only', () => {
    expect(canAccessStaffRegistration(null)).toBe(false);
    expect(canAccessStaffRegistration({ isAuthenticated: false, role: 'admin' })).toBe(false);
    expect(canAccessStaffRegistration({ isAuthenticated: true, role: 'patient' })).toBe(false);
    expect(canAccessStaffRegistration({ isAuthenticated: true, role: 'kiosk_guest' })).toBe(false);
    expect(canAccessStaffRegistration({ isAuthenticated: true, role: 'admin' })).toBe(true);
    expect(canAccessStaffRegistration({ isAuthenticated: true, role: 'pt' })).toBe(true);
    expect(canAccessStaffRegistration({ isAuthenticated: true, role: 'staff' })).toBe(true);
  });
});

