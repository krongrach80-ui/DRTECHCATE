/**
 * apps/kiosk/src/minigame-cards/__tests__/handGestureVerification.test.ts
 *
 * Unit tests for verifyRealHandGesture and 4-Layer Hand Verification Gate.
 * Enforces zero false-positives from face, body, clothing, and pixel motion.
 */

import { describe, it, expect } from 'vitest';
import {
  verifyRealHandGesture,
  HandLandmarkPoint,
  drawHandSkeleton,
} from '../HandGestureVerifier.js';

/**
 * Helper to construct a realistic 21-point MediaPipe hand landmark set
 */
function createMockHandLandmarks(options: {
  wristY?: number;
  tipY?: number;
  mcpY?: number;
  palmX?: number; // raw camera X (if mirrored: mirroredX = 1 - rawX)
  extendedFingersCount?: number; // 0 to 4
}): HandLandmarkPoint[] {
  const {
    wristY = 0.68,
    tipY = 0.35, // tipY < wristY - 0.08 (raised up)
    mcpY = 0.48,
    palmX = 0.75, // mirroredX = 1 - 0.75 = 0.25 (LEFT / 'yes')
    extendedFingersCount = 4,
  } = options;

  const wristX = palmX;

  // 21 points
  const points: HandLandmarkPoint[] = [];

  // Point 0: WRIST
  points[0] = { x: wristX, y: wristY, z: 0 };

  // Thumb: 1, 2, 3, 4
  points[1] = { x: wristX - 0.05, y: wristY - 0.04, z: 0 };
  points[2] = { x: wristX - 0.08, y: wristY - 0.08, z: 0 };
  points[3] = { x: wristX - 0.10, y: wristY - 0.12, z: 0 };
  points[4] = { x: wristX - 0.12, y: wristY - 0.15, z: 0 };

  // Helper for 4 fingers (index, middle, ring, pinky)
  const fingerOffsets = [-0.04, 0, 0.04, 0.08];
  const fingerTipIndices = [8, 12, 16, 20];
  const fingerMcpIndices = [5, 9, 13, 17];

  for (let f = 0; f < 4; f++) {
    const xOffset = fingerOffsets[f];
    const mcpIdx = fingerMcpIndices[f];
    const tipIdx = fingerTipIndices[f];

    // MCP
    points[mcpIdx] = { x: wristX + xOffset, y: mcpY, z: 0 };

    const isExtended = f < extendedFingersCount;
    const currentTipY = isExtended ? tipY : mcpY + 0.02; // folded if not extended

    // PIP & DIP
    points[mcpIdx + 1] = { x: wristX + xOffset, y: (mcpY + currentTipY) / 2, z: 0 };
    points[mcpIdx + 2] = { x: wristX + xOffset, y: currentTipY + 0.02, z: 0 };
    // TIP
    points[tipIdx] = { x: wristX + xOffset, y: currentTipY, z: 0 };
  }

  return points;
}

describe('verifyRealHandGesture — 4-Layer Hand Verification Gate', () => {
  describe('Layer 1: Real Hand Structure & Confidence', () => {
    it('should reject when landmarks is null or undefined (face/body/pixel motion with no hand)', () => {
      const resNull = verifyRealHandGesture(null);
      expect(resNull.isValidHand).toBe(false);
      expect(resNull.isHandDetected).toBe(false);
      expect(resNull.side).toBeNull();
      expect(resNull.rejectionReason).toBe('NO_HAND_LANDMARKS_DETECTED');

      const resUndef = verifyRealHandGesture(undefined);
      expect(resUndef.isValidHand).toBe(false);
      expect(resUndef.side).toBeNull();
    });

    it('should reject when landmarks array has fewer than 21 points', () => {
      const partialLandmarks = createMockHandLandmarks({}).slice(0, 10);
      const res = verifyRealHandGesture(partialLandmarks);
      expect(res.isValidHand).toBe(false);
      expect(res.isHandDetected).toBe(false);
      expect(res.rejectionReason).toBe('NO_HAND_LANDMARKS_DETECTED');
    });

    it('should reject when landmark detection confidence is below 0.75 threshold', () => {
      const landmarks = createMockHandLandmarks({});
      const res = verifyRealHandGesture(landmarks, 0.65); // 0.65 < 0.75
      expect(res.isValidHand).toBe(false);
      expect(res.rejectionReason).toContain('CONFIDENCE_TOO_LOW');
    });

    it('should reject when any landmark contains NaN or non-finite values', () => {
      const landmarks = createMockHandLandmarks({});
      landmarks[8] = { x: NaN, y: 0.2 };
      const res = verifyRealHandGesture(landmarks);
      expect(res.isValidHand).toBe(false);
      expect(res.rejectionReason).toContain('CORRUPTED_LANDMARK_AT_INDEX_8');
    });

    it('should strictly reject face, head, shoulders, clothing or pixel motion when no hand landmarks are present', () => {
      // Mock points from non-hand tracker (e.g. 4 face/shoulder points only)
      const faceOrShoulderPoints = [
        { x: 0.50, y: 0.25 }, // nose
        { x: 0.45, y: 0.35 }, // left shoulder
        { x: 0.55, y: 0.35 }, // right shoulder
      ];
      const res = verifyRealHandGesture(faceOrShoulderPoints as any, 0.99);
      expect(res.isValidHand).toBe(false);
      expect(res.isHandDetected).toBe(false);
      expect(res.side).toBeNull();
      expect(res.zone).toBe('NONE');
      expect(res.rejectionReason).toBe('NO_HAND_LANDMARKS_DETECTED');
    });
  });

  describe('Layer 2: Raised Open-Palm Gesture Check', () => {
    it('should reject when hand is not raised or pointing downward (tips lower than wrist)', () => {
      // wristY = 0.30, tipY = 0.50 (wrist higher than tips, hand hanging down)
      const upsideDownHand = createMockHandLandmarks({
        wristY: 0.30,
        tipY: 0.50,
        mcpY: 0.40,
      });

      const res = verifyRealHandGesture(upsideDownHand);
      expect(res.isValidHand).toBe(false);
      expect(res.rejectionReason).toBe('HAND_NOT_RAISED_OR_POINTING_DOWN');
    });

    it('should reject when tips are not at least 0.08 higher than wrist (horizontal hand / wrist resting)', () => {
      const restingHand = createMockHandLandmarks({
        wristY: 0.50,
        tipY: 0.46, // only 0.04 difference (< 0.08)
        mcpY: 0.48,
      });

      const res = verifyRealHandGesture(restingHand);
      expect(res.isValidHand).toBe(false);
      expect(res.rejectionReason).toBe('HAND_NOT_RAISED_OR_POINTING_DOWN');
    });

    it('should reject closed fist or folded fingers (< 3 extended fingers)', () => {
      // closed fist: 0 extended fingers
      const fist = createMockHandLandmarks({ extendedFingersCount: 0 });
      const resFist = verifyRealHandGesture(fist);
      expect(resFist.isValidHand).toBe(false);
      expect(resFist.rejectionReason).toContain('FINGERS_NOT_EXTENDED');

      // 2 extended fingers (e.g., peace sign / victory) - requires >= 3
      const twoFingers = createMockHandLandmarks({ extendedFingersCount: 2 });
      const resTwo = verifyRealHandGesture(twoFingers);
      expect(resTwo.isValidHand).toBe(false);
      expect(resTwo.rejectionReason).toContain('FINGERS_NOT_EXTENDED_COUNT_2');
    });

    it('should reject hand resting at bottom edge of camera frame (y > 0.70)', () => {
      const bottomEdgeHand = createMockHandLandmarks({
        wristY: 0.85,
        mcpY: 0.75, // > 0.70
        tipY: 0.60,
      });

      const res = verifyRealHandGesture(bottomEdgeHand);
      expect(res.isValidHand).toBe(false);
      expect(res.rejectionReason).toContain('HAND_TOO_LOW');
    });

    it('should accept raised hand with at least 3 extended fingers and mcpY <= 0.70', () => {
      const validHand = createMockHandLandmarks({
        wristY: 0.60,
        mcpY: 0.48,
        tipY: 0.30,
        extendedFingersCount: 3,
        palmX: 0.80, // mirrored: 0.20 (LEFT)
      });

      const res = verifyRealHandGesture(validHand, 0.90);
      expect(res.isValidHand).toBe(true);
      expect(res.isOpenPalm).toBe(true);
      expect(res.extendedFingersCount).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Layer 3: Left (ใช่) / Right (ไม่) / Center Zone Assignment', () => {
    it('should trigger LEFT zone (ใช่) when mirrored palm center is x < 0.42', () => {
      // raw palmX = 0.80 -> mirroredX = 1 - 0.80 = 0.20 (< 0.42)
      const leftHand = createMockHandLandmarks({
        palmX: 0.80,
        wristY: 0.55,
        mcpY: 0.45,
        tipY: 0.28,
        extendedFingersCount: 4,
      });

      const res = verifyRealHandGesture(leftHand, 0.88);
      expect(res.isValidHand).toBe(true);
      expect(res.zone).toBe('LEFT');
      expect(res.side).toBe('yes');
      expect(res.mirroredX).toBeCloseTo(0.20, 2);
    });

    it('should trigger RIGHT zone (ไม่) when mirrored palm center is x > 0.58', () => {
      // raw palmX = 0.25 -> mirroredX = 1 - 0.25 = 0.75 (> 0.58)
      const rightHand = createMockHandLandmarks({
        palmX: 0.25,
        wristY: 0.55,
        mcpY: 0.45,
        tipY: 0.28,
        extendedFingersCount: 4,
      });

      const res = verifyRealHandGesture(rightHand, 0.92);
      expect(res.isValidHand).toBe(true);
      expect(res.zone).toBe('RIGHT');
      expect(res.side).toBe('no');
      expect(res.mirroredX).toBeCloseTo(0.75, 2);
    });

    it('should identify CENTER neutral zone without triggering an answer (0.42 <= x <= 0.58)', () => {
      // raw palmX = 0.50 -> mirroredX = 1 - 0.50 = 0.50 (CENTER)
      const centerHand = createMockHandLandmarks({
        palmX: 0.50,
        wristY: 0.55,
        mcpY: 0.45,
        tipY: 0.28,
        extendedFingersCount: 4,
      });

      const res = verifyRealHandGesture(centerHand, 0.89);
      expect(res.isValidHand).toBe(false); // Does not trigger answer in center
      expect(res.zone).toBe('CENTER');
      expect(res.side).toBeNull();
      expect(res.isOpenPalm).toBe(true);
      expect(res.rejectionReason).toBe('NEUTRAL_CENTER_ZONE');
    });
  });

  describe('drawHandSkeleton helper', () => {
    it('should safely render without errors on canvas mock context', () => {
      const mockCtx = {
        save: () => {},
        restore: () => {},
        beginPath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        stroke: () => {},
        arc: () => {},
        fill: () => {},
        strokeStyle: '',
        fillStyle: '',
        lineWidth: 0,
        lineCap: '',
        lineJoin: '',
      } as unknown as CanvasRenderingContext2D;

      const landmarks = createMockHandLandmarks({});
      expect(() => {
        drawHandSkeleton(mockCtx, landmarks, 320, 240, 'LEFT', 0.5);
      }).not.toThrow();
    });
  });
});
