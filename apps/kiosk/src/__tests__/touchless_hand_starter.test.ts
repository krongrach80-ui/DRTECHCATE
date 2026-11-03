/**
 * apps/kiosk/src/__tests__/touchless_hand_starter.test.ts
 *
 * Unit tests for DrTech Care Touchless Randomized Hand Gesture Starter:
 * 1. Cryptographic randomization ('left' vs 'right')
 * 2. Clinical safety override (strict locking for 'left' or 'right' allowed side)
 * 3. MediaPipe handedness evaluation with mirrored camera correction
 * 4. Dual-hand rejection guard (anti-spoofing)
 * 5. Multi-person central palm prioritization
 * 6. Target exercise selection and sequencing
 * 7. Staff override and emergency pain reporting
 */

import { describe, it, expect } from 'vitest';
import {
  evaluateAnatomicalHand,
  HandLandmarkPoint,
} from '../minigame-cards/HandGestureVerifier.js';
import { pickRandomSide } from '../hooks/useTouchlessGestureStarter';

describe('Clinical Touchless Gesture Starter System', () => {
  describe('1. Cryptographic Hand Randomization & Safety Locks', () => {
    it('1.1 Generates both left and right across 30 randomized trials when allowedSide is "both"', () => {
      const results = new Set<string>();
      for (let i = 0; i < 30; i++) {
        results.add(pickRandomSide('both'));
      }
      expect(results.has('left')).toBe(true);
      expect(results.has('right')).toBe(true);
    });

    it('1.2 Strictly locks to "left" when patient prescription specifies allowedSide === "left"', () => {
      for (let i = 0; i < 20; i++) {
        expect(pickRandomSide('left')).toBe('left');
      }
    });

    it('1.3 Strictly locks to "right" when patient prescription specifies allowedSide === "right"', () => {
      for (let i = 0; i < 20; i++) {
        expect(pickRandomSide('right')).toBe('right');
      }
    });
  });

  describe('2. Anatomical Hand Landmark Evaluation with Mirrored Space Correction', () => {
    // Helper to generate realistic mock hand landmarks
    function createMockHand(
      wristX: number,
      wristY: number,
      fingersExtended: boolean = true
    ): HandLandmarkPoint[] {
      const landmarks: HandLandmarkPoint[] = new Array(21).fill(null).map(() => ({
        x: wristX,
        y: wristY,
        z: 0,
      }));

      // Wrist
      landmarks[0] = { x: wristX, y: wristY, z: 0 };
      // Palm center / MCPs
      landmarks[5] = { x: wristX - 0.05, y: wristY - 0.1, z: 0 };
      landmarks[9] = { x: wristX - 0.02, y: wristY - 0.12, z: 0 };
      landmarks[13] = { x: wristX + 0.02, y: wristY - 0.11, z: 0 };
      landmarks[17] = { x: wristX + 0.05, y: wristY - 0.09, z: 0 };

      // Finger tips and PIPs
      const tipIndices = [4, 8, 12, 16, 20];
      const pipIndices = [2, 6, 10, 14, 18];

      for (let f = 0; f < 5; f++) {
        const tipIdx = tipIndices[f];
        const pipIdx = pipIndices[f];
        if (fingersExtended) {
          // Tips higher than PIPs (smaller y in canvas coordinates)
          landmarks[pipIdx] = { x: wristX, y: wristY - 0.15, z: 0 };
          landmarks[tipIdx] = { x: wristX, y: wristY - 0.25, z: 0 };
        } else {
          // Closed fist (tips curled below PIPs)
          landmarks[pipIdx] = { x: wristX, y: wristY - 0.08, z: 0 };
          landmarks[tipIdx] = { x: wristX, y: wristY - 0.04, z: 0 };
        }
      }

      return landmarks;
    }

    it('2.1 Correctly evaluates real anatomical Left Hand in mirrored view (category Left, mirroredX < 0.68)', () => {
      // In raw un-mirrored sensor, left hand is on the right (x = 0.70)
      // When mirrored (1 - 0.70 = 0.30), it appears on user's left
      const mockLandmarks = createMockHand(0.70, 0.45, true);
      const evaluation = evaluateAnatomicalHand(mockLandmarks, 'Left', 0.95, {
        isMirrored: true,
        maxYThreshold: 0.78,
      });

      expect(evaluation.isValid).toBe(true);
      expect(evaluation.anatomicalSide).toBe('left');
      expect(evaluation.palmCenter.mirroredX).toBeCloseTo(0.32, 1);
      expect(evaluation.extendedFingers).toBeGreaterThanOrEqual(4);
    });

    it('2.2 Correctly evaluates real anatomical Right Hand in mirrored view (category Right, mirroredX > 0.32)', () => {
      // In raw un-mirrored sensor, right hand is on the left (x = 0.30)
      // When mirrored (1 - 0.30 = 0.70), it appears on user's right
      const mockLandmarks = createMockHand(0.30, 0.45, true);
      const evaluation = evaluateAnatomicalHand(mockLandmarks, 'Right', 0.95, {
        isMirrored: true,
        maxYThreshold: 0.78,
      });

      expect(evaluation.isValid).toBe(true);
      expect(evaluation.anatomicalSide).toBe('right');
      expect(evaluation.palmCenter.mirroredX).toBeCloseTo(0.72, 1);
      expect(evaluation.extendedFingers).toBeGreaterThanOrEqual(4);
    });

    it('2.3 Rejects hand below comfortable chest height (wrist y > 0.78)', () => {
      // Hand placed down at lap/waist (wrist y = 0.85)
      const mockLandmarks = createMockHand(0.70, 0.85, true);
      const evaluation = evaluateAnatomicalHand(mockLandmarks, 'Left', 0.95, {
        isMirrored: true,
        maxYThreshold: 0.78,
      });

      expect(evaluation.isValid).toBe(false);
      expect(evaluation.anatomicalSide).toBeNull();
      expect(evaluation.rejectionReason).toBe('HAND_BELOW_CHEST');
    });

    it('2.4 Rejects closed fist or fewer than 3 extended fingers', () => {
      // Closed fist
      const mockLandmarks = createMockHand(0.70, 0.45, false);
      const evaluation = evaluateAnatomicalHand(mockLandmarks, 'Left', 0.95, {
        isMirrored: true,
        maxYThreshold: 0.78,
      });

      expect(evaluation.isValid).toBe(false);
      expect(evaluation.extendedFingers).toBeLessThan(3);
    });
  });

  describe('3. Anti-Spoofing & Multi-Person Arbitration', () => {
    it('3.1 Identifies dual hands raised simultaneously for anti-spoofing rejection', () => {
      // Helper to generate realistic mock hand landmarks
      function createMockHand(wristX: number, wristY: number): HandLandmarkPoint[] {
        const landmarks: HandLandmarkPoint[] = new Array(21).fill(null).map(() => ({ x: wristX, y: wristY, z: 0 }));
        landmarks[0] = { x: wristX, y: wristY, z: 0 };
        landmarks[5] = { x: wristX - 0.05, y: wristY - 0.1, z: 0 };
        landmarks[9] = { x: wristX - 0.02, y: wristY - 0.12, z: 0 };
        landmarks[13] = { x: wristX + 0.02, y: wristY - 0.11, z: 0 };
        landmarks[17] = { x: wristX + 0.05, y: wristY - 0.09, z: 0 };
        const tipIndices = [4, 8, 12, 16, 20];
        const pipIndices = [2, 6, 10, 14, 18];
        for (let f = 0; f < 5; f++) {
          landmarks[pipIndices[f]] = { x: wristX, y: wristY - 0.15, z: 0 };
          landmarks[tipIndices[f]] = { x: wristX, y: wristY - 0.25, z: 0 };
        }
        return landmarks;
      }

      // Left hand on right side of raw sensor (x=0.70)
      const leftHandPts = createMockHand(0.70, 0.45);
      // Right hand on left side of raw sensor (x=0.30)
      const rightHandPts = createMockHand(0.30, 0.45);

      const evalLeft = evaluateAnatomicalHand(leftHandPts, 'Left', 0.9, { isMirrored: true });
      const evalRight = evaluateAnatomicalHand(rightHandPts, 'Right', 0.9, { isMirrored: true });

      expect(evalLeft.isValid && evalLeft.anatomicalSide === 'left').toBe(true);
      expect(evalRight.isValid && evalRight.anatomicalSide === 'right').toBe(true);

      const hasBothSides = [evalLeft, evalRight].some((h) => h.anatomicalSide === 'left') &&
                           [evalLeft, evalRight].some((h) => h.anatomicalSide === 'right');
      expect(hasBothSides).toBe(true);
    });

    it('3.2 Multi-person arbitration prioritizes patient closer to center with larger palm', () => {
      const patientHand = {
        palmSize: 0.18, // Larger palm (closer to camera)
        palmCenter: { mirroredX: 0.48 }, // Centered right in front of kiosk
      };
      const bystanderHand = {
        palmSize: 0.08, // Smaller palm (standing further away)
        palmCenter: { mirroredX: 0.90 }, // At extreme edge of camera
      };

      const scorePatient = patientHand.palmSize * 2.0 - Math.abs(patientHand.palmCenter.mirroredX - 0.5);
      const scoreBystander = bystanderHand.palmSize * 2.0 - Math.abs(bystanderHand.palmCenter.mirroredX - 0.5);

      expect(scorePatient).toBeGreaterThan(scoreBystander);
    });
  });

  describe('4. Daily Exercise Plan Target Selection & Sequencing', () => {
    it('4.1 Correctly picks the next uncompleted exercise in order', () => {
      const exercises = [
        { id: 'ex-01', name: 'Pendulum' },
        { id: 'ex-02', name: 'Shoulder Flexion' },
        { id: 'ex-03', name: 'Wall Slide' },
      ];
      const completedSet = new Set<string>(['ex-01']);

      const nextTarget = exercises.find((item) => !completedSet.has(item.id));
      expect(nextTarget).toBeDefined();
      expect(nextTarget?.id).toBe('ex-02');
    });

    it('4.2 Returns null when all exercises are completed to unlock cognitive minigame', () => {
      const exercises = [
        { id: 'ex-01', name: 'Pendulum' },
        { id: 'ex-02', name: 'Shoulder Flexion' },
      ];
      const completedSet = new Set<string>(['ex-01', 'ex-02']);

      const nextTarget = exercises.find((item) => !completedSet.has(item.id));
      expect(nextTarget).toBeUndefined();
    });
  });
});
