import { describe, it, expect } from 'vitest';
import { verifyRealHandGesture, HandLandmarkPoint } from '../HandGestureVerifier';

function createMockHand(options: {
  palmX?: number;
  wristY?: number;
  mcpY?: number;
  tipY?: number;
  extended?: boolean;
}): HandLandmarkPoint[] {
  const {
    palmX = 0.80, // mirrored: 0.20 (LEFT)
    wristY = 0.60,
    mcpY = 0.45,
    tipY = 0.25,
    extended = true,
  } = options;

  const pts: HandLandmarkPoint[] = Array.from({ length: 21 }, () => ({ x: palmX, y: mcpY, z: 0 }));
  pts[0] = { x: palmX, y: wristY, z: 0 }; // Wrist

  // Finger MCPs and tips
  pts[5] = { x: palmX - 0.05, y: mcpY }; // Index MCP
  pts[8] = { x: palmX - 0.05, y: extended ? tipY : mcpY + 0.05 }; // Index Tip

  pts[9] = { x: palmX, y: mcpY }; // Middle MCP
  pts[12] = { x: palmX, y: extended ? tipY : mcpY + 0.05 }; // Middle Tip

  pts[13] = { x: palmX + 0.03, y: mcpY }; // Ring MCP
  pts[16] = { x: palmX + 0.03, y: extended ? tipY : mcpY + 0.05 }; // Ring Tip

  pts[17] = { x: palmX + 0.06, y: mcpY }; // Pinky MCP
  pts[20] = { x: palmX + 0.06, y: extended ? tipY : mcpY + 0.05 }; // Pinky Tip

  return pts;
}

describe('Physical Card Game - Vision & Bilateral Hand Verification', () => {
  it('1. Correctly verifies single left hand in YES zone (mirroredX < 0.46)', () => {
    // raw palmX = 0.80 -> mirroredX = 1 - 0.80 = 0.20
    const leftHand = createMockHand({ palmX: 0.80 });
    const res = verifyRealHandGesture(leftHand, 0.85, { isMirrored: true });

    expect(res.isValidHand).toBe(true);
    expect(res.zone).toBe('LEFT');
    expect(res.side).toBe('yes');
    expect(res.extendedFingersCount).toBeGreaterThanOrEqual(1);
  });

  it('2. Correctly verifies single right hand in NO zone (mirroredX > 0.54)', () => {
    // raw palmX = 0.20 -> mirroredX = 1 - 0.20 = 0.80
    const rightHand = createMockHand({ palmX: 0.20 });
    const res = verifyRealHandGesture(rightHand, 0.85, { isMirrored: true });

    expect(res.isValidHand).toBe(true);
    expect(res.zone).toBe('RIGHT');
    expect(res.side).toBe('no');
  });

  it('3. Neutral center hand does not trigger answer side', () => {
    // raw palmX = 0.50 -> mirroredX = 0.50 (dead zone: 0.46 to 0.54)
    const centerHand = createMockHand({ palmX: 0.50 });
    const res = verifyRealHandGesture(centerHand, 0.85, { isMirrored: true });

    expect(res.isHandDetected).toBe(true);
    expect(res.zone).toBe('CENTER');
    expect(res.side).toBeNull();
    expect(res.isValidHand).toBe(false);
  });

  it('4. Bilateral simulation: Detecting both hands allows identifying ambiguous simultaneous gesture', () => {
    const leftHandPts = createMockHand({ palmX: 0.80 }); // Left
    const rightHandPts = createMockHand({ palmX: 0.20 }); // Right

    const leftRes = verifyRealHandGesture(leftHandPts, 0.85, { isMirrored: true });
    const rightRes = verifyRealHandGesture(rightHandPts, 0.85, { isMirrored: true });

    expect(leftRes.zone).toBe('LEFT');
    expect(rightRes.zone).toBe('RIGHT');

    // System guard check: when both sides are valid simultaneously, bilateral flag triggers
    const bothRaised = (leftRes.zone === 'LEFT' && leftRes.isValidHand) &&
                       (rightRes.zone === 'RIGHT' && rightRes.isValidHand);
    expect(bothRaised).toBe(true);
  });

  it('5. Elderly accessibility: Accepts slightly relaxed confidence (0.45-0.70) without dropping', () => {
    const elderlyHand = createMockHand({ palmX: 0.80, tipY: 0.35, mcpY: 0.50 });
    const res = verifyRealHandGesture(elderlyHand, 0.50, { isMirrored: true });

    expect(res.isValidHand).toBe(true);
    expect(res.confidence).toBe(0.50);
  });
});

