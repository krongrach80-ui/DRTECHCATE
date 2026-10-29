/**
 * packages/face-client/test/raise_both_hands.test.ts
 *
 * Test Suite: Clinical-Grade Touchless "Raise-Both-Hands" Readiness Confirmation Engine
 * Covers all 6 clinical scenarios:
 * 1. Valid Bilateral Hand Raise (Standing & Seated/Wheelchair postures)
 * 2. Single-Hand Raise Rejection (Left only or Right only)
 * 3. Low Visibility / Out-of-Frame Rejection
 * 4. Transient Motion / Early Drop (< 1.2s) with Smooth Decay
 * 5. Multi-Person Bystander Rejection (Identity Continuity Lock)
 * 6. Accessibility Fallback Guidance Trigger (Hemiparesis / Frozen Shoulder)
 */

import { describe, it, expect } from 'vitest';
import {
  detectRaiseBothHands,
  createInitialRaiseBothHandsState,
  POSE_LM,
  PoseLandmarkPoint,
  SpatialIdentityAnchor,
} from '../src/gesture/raiseBothHandsDetector';

function createMockPose(overrides: Partial<Record<number, Partial<PoseLandmarkPoint>>> = {}): PoseLandmarkPoint[] {
  // Base relaxed pose: patient standing at center (x=0.5), hands resting at side (y=0.7)
  const pose: PoseLandmarkPoint[] = Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.5,
    z: 0.0,
    visibility: 0.95,
    presence: 0.95,
  }));

  // Standard topology coordinates
  pose[POSE_LM.NOSE] = { x: 0.5, y: 0.20, z: 0.0, visibility: 0.99, presence: 0.99 };
  pose[POSE_LM.LEFT_SHOULDER] = { x: 0.60, y: 0.35, z: 0.0, visibility: 0.95, presence: 0.95 };
  pose[POSE_LM.RIGHT_SHOULDER] = { x: 0.40, y: 0.35, z: 0.0, visibility: 0.95, presence: 0.95 };
  pose[POSE_LM.LEFT_ELBOW] = { x: 0.65, y: 0.50, z: 0.0, visibility: 0.95, presence: 0.95 };
  pose[POSE_LM.RIGHT_ELBOW] = { x: 0.35, y: 0.50, z: 0.0, visibility: 0.95, presence: 0.95 };
  pose[POSE_LM.LEFT_WRIST] = { x: 0.65, y: 0.65, z: 0.0, visibility: 0.95, presence: 0.95 };
  pose[POSE_LM.RIGHT_WRIST] = { x: 0.35, y: 0.65, z: 0.0, visibility: 0.95, presence: 0.95 };
  pose[POSE_LM.LEFT_HIP] = { x: 0.56, y: 0.70, z: 0.0, visibility: 0.95, presence: 0.95 };
  pose[POSE_LM.RIGHT_HIP] = { x: 0.44, y: 0.70, z: 0.0, visibility: 0.95, presence: 0.95 };

  for (const [idxStr, val] of Object.entries(overrides)) {
    const idx = Number(idxStr);
    pose[idx] = { ...pose[idx], ...val };
  }

  return pose;
}

describe('Touchless "Raise-Both-Hands" Readiness Confirmation Engine', () => {
  const patientAnchor: SpatialIdentityAnchor = {
    anchorNoseXY: { x: 0.50, y: 0.20 },
  };

  // ---------------------------------------------------------------------------
  // Test 1: Valid Bilateral Hand Raise (Standing & Seated / Wheelchair)
  // ---------------------------------------------------------------------------
  describe('1. Valid Bilateral Hand Raise Confirmation', () => {
    it('1.1 should reach 100% progress and return detected=true for standing patient after 1200ms hold', () => {
      // Both wrists raised well above shoulders: y=0.18 (shoulders at y=0.35)
      const raisedPose = createMockPose({
        [POSE_LM.LEFT_WRIST]: { x: 0.68, y: 0.18, visibility: 0.95 },
        [POSE_LM.RIGHT_WRIST]: { x: 0.32, y: 0.18, visibility: 0.95 },
      });

      let state = createInitialRaiseBothHandsState(1000);
      let res = detectRaiseBothHands(raisedPose, patientAnchor, {}, state, 1000);

      expect(res.detected).toBe(false);
      expect(res.status).toBe('holding');
      expect(res.leftWristAboveShoulder).toBe(true);
      expect(res.rightWristAboveShoulder).toBe(true);
      expect(res.isSeated).toBe(false);

      // Simulate holding for 15 frames spanning 1300ms (> 1200ms hold duration)
      for (let i = 1; i <= 15; i++) {
        const t = 1000 + i * 90; // step 90ms
        res = detectRaiseBothHands(raisedPose, patientAnchor, {}, res.nextState, t);
      }

      expect(res.detected).toBe(true);
      expect(res.progress).toBe(1.0);
      expect(res.status).toBe('confirmed');
      expect(res.thaiMessage).toContain('ยืนยันสำเร็จ');
    });

    it('1.2 should successfully detect gesture in seated / wheelchair posture where hips have 0 visibility', () => {
      // Wheelchair patient: hips occluded (visibility = 0.0)
      const seatedRaisedPose = createMockPose({
        [POSE_LM.LEFT_HIP]: { x: 0.56, y: 0.70, visibility: 0.0, presence: 0.0 },
        [POSE_LM.RIGHT_HIP]: { x: 0.44, y: 0.70, visibility: 0.0, presence: 0.0 },
        [POSE_LM.LEFT_WRIST]: { x: 0.68, y: 0.15, visibility: 0.95 },
        [POSE_LM.RIGHT_WRIST]: { x: 0.32, y: 0.15, visibility: 0.95 },
      });

      let state = createInitialRaiseBothHandsState(2000);
      let res = detectRaiseBothHands(seatedRaisedPose, patientAnchor, {}, state, 2000);

      expect(res.isSeated).toBe(true);
      expect(res.referenceTorsoScale).toBeGreaterThan(0.15); // Biacromial scale invariant
      expect(res.leftWristAboveShoulder).toBe(true);
      expect(res.rightWristAboveShoulder).toBe(true);
      expect(res.status).toBe('holding');

      // Hold for 1300ms
      for (let i = 1; i <= 14; i++) {
        const t = 2000 + i * 100;
        res = detectRaiseBothHands(seatedRaisedPose, patientAnchor, {}, res.nextState, t);
      }

      expect(res.detected).toBe(true);
      expect(res.progress).toBe(1.0);
      expect(res.status).toBe('confirmed');
    });
  });

  // ---------------------------------------------------------------------------
  // Test 2: Single-Hand Raise Rejection
  // ---------------------------------------------------------------------------
  describe('2. Single-Hand Raise Rejection', () => {
    it('2.1 should reject when only left hand is raised', () => {
      const leftOnlyPose = createMockPose({
        [POSE_LM.LEFT_WRIST]: { x: 0.68, y: 0.15, visibility: 0.95 }, // Above shoulder
        [POSE_LM.RIGHT_WRIST]: { x: 0.35, y: 0.65, visibility: 0.95 }, // Down at side
      });

      const state = createInitialRaiseBothHandsState(3000);
      const res = detectRaiseBothHands(leftOnlyPose, patientAnchor, {}, state, 3000);

      expect(res.detected).toBe(false);
      expect(res.progress).toBe(0.0);
      expect(res.status).toBe('single_hand_detected');
      expect(res.thaiMessage).toContain('เห็นมือข้างเดียว');
      expect(res.leftWristAboveShoulder).toBe(true);
      expect(res.rightWristAboveShoulder).toBe(false);
    });

    it('2.2 should reject when only right hand is raised', () => {
      const rightOnlyPose = createMockPose({
        [POSE_LM.LEFT_WRIST]: { x: 0.65, y: 0.65, visibility: 0.95 }, // Down at side
        [POSE_LM.RIGHT_WRIST]: { x: 0.32, y: 0.15, visibility: 0.95 }, // Above shoulder
      });

      const state = createInitialRaiseBothHandsState(4000);
      const res = detectRaiseBothHands(rightOnlyPose, patientAnchor, {}, state, 4000);

      expect(res.detected).toBe(false);
      expect(res.progress).toBe(0.0);
      expect(res.status).toBe('single_hand_detected');
      expect(res.thaiMessage).toContain('เห็นมือข้างเดียว');
      expect(res.leftWristAboveShoulder).toBe(false);
      expect(res.rightWristAboveShoulder).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Test 3: Low Visibility / Out-of-Frame Rejection
  // ---------------------------------------------------------------------------
  describe('3. Low Visibility & Out-of-Frame Gating', () => {
    it('3.1 should reject when wrists are above shoulders but visibility is below minVisibility (< 0.60)', () => {
      const lowVisPose = createMockPose({
        [POSE_LM.LEFT_WRIST]: { x: 0.68, y: 0.15, visibility: 0.35 }, // Low visibility
        [POSE_LM.RIGHT_WRIST]: { x: 0.32, y: 0.15, visibility: 0.40 }, // Low visibility
      });

      const state = createInitialRaiseBothHandsState(5000);
      const res = detectRaiseBothHands(lowVisPose, patientAnchor, {}, state, 5000);

      expect(res.detected).toBe(false);
      expect(res.progress).toBe(0.0);
      expect(res.status).toBe('low_visibility_or_out_of_frame');
      expect(res.thaiMessage).toContain('ไม่เห็นข้อมือหรือไหล่');
    });

    it('3.2 should reject when shoulders are out of frame or occluded', () => {
      const missingShoulderPose = createMockPose({
        [POSE_LM.LEFT_SHOULDER]: { x: 0.60, y: 0.35, visibility: 0.20 },
        [POSE_LM.LEFT_WRIST]: { x: 0.68, y: 0.15, visibility: 0.95 },
        [POSE_LM.RIGHT_WRIST]: { x: 0.32, y: 0.15, visibility: 0.95 },
      });

      const state = createInitialRaiseBothHandsState(5500);
      const res = detectRaiseBothHands(missingShoulderPose, patientAnchor, {}, state, 5500);

      expect(res.detected).toBe(false);
      expect(res.status).toBe('low_visibility_or_out_of_frame');
    });
  });

  // ---------------------------------------------------------------------------
  // Test 4: Transient Motion / Early Drop with Smooth Decay (< 1.2s)
  // ---------------------------------------------------------------------------
  describe('4. Transient Motion & Smooth Decay', () => {
    it('4.1 should accumulate partial progress then smoothly decay to 0 when hands are dropped early', () => {
      const raisedPose = createMockPose({
        [POSE_LM.LEFT_WRIST]: { x: 0.68, y: 0.15, visibility: 0.95 },
        [POSE_LM.RIGHT_WRIST]: { x: 0.32, y: 0.15, visibility: 0.95 },
      });

      const relaxedPose = createMockPose({
        [POSE_LM.LEFT_WRIST]: { x: 0.65, y: 0.65, visibility: 0.95 },
        [POSE_LM.RIGHT_WRIST]: { x: 0.35, y: 0.65, visibility: 0.95 },
      });

      let state = createInitialRaiseBothHandsState(6000);
      let res = detectRaiseBothHands(raisedPose, patientAnchor, {}, state, 6000);

      // Raise hands for ~500ms (5 frames of 100ms)
      for (let i = 1; i <= 5; i++) {
        res = detectRaiseBothHands(raisedPose, patientAnchor, {}, res.nextState, 6000 + i * 100);
      }

      // Progress should be partial (~0.4 - 0.5) and not detected
      expect(res.detected).toBe(false);
      expect(res.progress).toBeGreaterThan(0.3);
      expect(res.progress).toBeLessThan(0.7);
      const peakProgress = res.progress;

      // Patient immediately drops hands down (e.g. was just scratching head)
      res = detectRaiseBothHands(relaxedPose, patientAnchor, {}, res.nextState, 6600);
      expect(res.detected).toBe(false);
      expect(res.progress).toBeLessThan(peakProgress); // Smoothly decayed

      // After 500ms of resting, progress must decay all the way to 0.0
      res = detectRaiseBothHands(relaxedPose, patientAnchor, {}, res.nextState, 7200);
      expect(res.progress).toBe(0.0);
      expect(res.detected).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Test 5: Multi-Person Bystander Rejection (Identity Continuity Lock)
  // ---------------------------------------------------------------------------
  describe('5. Multi-Person Bystander Rejection', () => {
    it('5.1 should ignore bystander raising hands in background when verified patient has hands down', () => {
      // Verified Patient at center (x=0.50), hands relaxed at sides
      const verifiedPatientPose = createMockPose({
        [POSE_LM.NOSE]: { x: 0.50, y: 0.20, visibility: 0.99 },
        [POSE_LM.LEFT_WRIST]: { x: 0.65, y: 0.65, visibility: 0.95 },
        [POSE_LM.RIGHT_WRIST]: { x: 0.35, y: 0.65, visibility: 0.95 },
      });

      // Bystander / Staff at right side (x=0.88), raising both hands high
      const bystanderPose = createMockPose({
        [POSE_LM.NOSE]: { x: 0.88, y: 0.22, visibility: 0.95 },
        [POSE_LM.LEFT_SHOULDER]: { x: 0.94, y: 0.35, visibility: 0.95 },
        [POSE_LM.RIGHT_SHOULDER]: { x: 0.82, y: 0.35, visibility: 0.95 },
        [POSE_LM.LEFT_WRIST]: { x: 0.96, y: 0.12, visibility: 0.95 }, // Raised
        [POSE_LM.RIGHT_WRIST]: { x: 0.80, y: 0.12, visibility: 0.95 }, // Raised
      });

      const multiPersonInput = [verifiedPatientPose, bystanderPose];

      let state = createInitialRaiseBothHandsState(8000);
      let res = detectRaiseBothHands(multiPersonInput, patientAnchor, {}, state, 8000);

      // Verified patient has hands down -> must not trigger holding
      expect(res.detected).toBe(false);
      expect(res.progress).toBe(0.0);
      expect(res.status).toBe('ready');

      // Continue for 20 frames (2.0 seconds) with bystander waving hands
      for (let i = 1; i <= 20; i++) {
        res = detectRaiseBothHands(multiPersonInput, patientAnchor, {}, res.nextState, 8000 + i * 100);
      }

      expect(res.detected).toBe(false);
      expect(res.progress).toBe(0.0);
    });

    it('5.2 should mark identity_mismatch_or_lost if verified patient steps out of camera frame', () => {
      // Only bystander in frame
      const bystanderOnlyPose = [
        createMockPose({
          [POSE_LM.NOSE]: { x: 0.90, y: 0.25, visibility: 0.95 }, // Distance from 0.50 is 0.40 > 0.22 maxDrift
        }),
      ];

      const state = createInitialRaiseBothHandsState(9000);
      const res = detectRaiseBothHands(bystanderOnlyPose, patientAnchor, {}, state, 9000);

      expect(res.detected).toBe(false);
      expect(res.status).toBe('identity_mismatch_or_lost');
      expect(res.progress).toBe(0.0);
    });
  });

  // ---------------------------------------------------------------------------
  // Test 6: Clinical Accessibility Fallback (Hemiparesis / Frozen Shoulder)
  // ---------------------------------------------------------------------------
  describe('6. Clinical Accessibility Fallback Guidance', () => {
    it('6.1 should trigger showAccessibilityFallbackHint after 7 seconds timeout without bilateral raise', () => {
      const relaxedPose = createMockPose();

      const state = createInitialRaiseBothHandsState(10000);
      let res = detectRaiseBothHands(relaxedPose, patientAnchor, {}, state, 10000);
      expect(res.showAccessibilityFallbackHint).toBe(false);

      // Advance time by 7500ms (> 7000ms accessibilityTimeoutMs)
      res = detectRaiseBothHands(relaxedPose, patientAnchor, {}, res.nextState, 10000 + 7500);
      expect(res.showAccessibilityFallbackHint).toBe(true);
    });

    it('6.2 should trigger showAccessibilityFallbackHint early if repeated single-arm attempts exceed 3.5s', () => {
      // Hemiparesis patient trying to raise only one functional arm
      const singleArmPose = createMockPose({
        [POSE_LM.LEFT_WRIST]: { x: 0.68, y: 0.15, visibility: 0.95 },
        [POSE_LM.RIGHT_WRIST]: { x: 0.35, y: 0.65, visibility: 0.95 },
      });

      let state = createInitialRaiseBothHandsState(20000);
      let res = detectRaiseBothHands(singleArmPose, patientAnchor, {}, state, 20000);
      expect(res.showAccessibilityFallbackHint).toBe(false);

      // Attempt single arm for 3800ms (> 3500ms singleArmAccessibilityTimeoutMs)
      res = detectRaiseBothHands(singleArmPose, patientAnchor, {}, res.nextState, 20000 + 3800);
      expect(res.showAccessibilityFallbackHint).toBe(true);
    });
  });
});
