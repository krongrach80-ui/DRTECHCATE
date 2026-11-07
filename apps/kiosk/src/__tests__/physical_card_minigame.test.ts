/**
 * apps/kiosk/src/__tests__/physical_card_minigame.test.ts
 * ชุดทดสอบสำหรับมินิเกม "การ์ดกายภาพ" (Physical & Cognitive Cards)
 * ครอบคลุมทั้ง 3 เรื่อง:
 * 1. การตรวจจับมือ 2 ข้างพร้อมกัน (Two-hand detection) & กรองผู้เล่นหลัก & ตรวจจับขอบภาพ
 * 2. การสลับ mapping คำตอบ: ยกมือขวา = "ใช่", ยกมือซ้าย = "ไม่" (HAND_ANSWER_MAP)
 * 3. Animated Dynamic Popup, การเตือนเมื่อยกสองข้าง, และระบบความคืบหน้า 0.6 วินาที
 */

import { describe, it, expect, vi } from 'vitest';
import {
  HAND_ANSWER_MAP,
  evaluateMinigameFrame,
  drawAllMinigameHands,
  evaluateAnatomicalHand,
  HandLandmarkPoint,
} from '../minigame-cards/HandGestureVerifier.js';
import { t, CLINICAL_DICTIONARY } from '../../../../packages/clinical-i18n/src/index';
import { MAX_CROP_RATIO } from '../minigame-cards/PhysicalCardGame.js';

/**
 * Helper: สร้าง Mock Landmarks 21 จุดของมือ
 */
function createMockHandLandmarks(options: {
  wristX?: number;
  wristY?: number;
  middleMcpX?: number;
  middleMcpY?: number;
  middleTipY?: number;
  extended?: boolean;
}): HandLandmarkPoint[] {
  const {
    wristX = 0.5,
    wristY = 0.7,
    middleMcpX = 0.5,
    middleMcpY = 0.5,
    middleTipY = 0.35,
    extended = true,
  } = options;

  const points: HandLandmarkPoint[] = [];

  // 0: Wrist
  points.push({ x: wristX, y: wristY, z: 0 });

  // 1-4: Thumb
  points.push({ x: wristX - 0.05, y: wristY - 0.05, z: 0 });
  points.push({ x: wristX - 0.08, y: wristY - 0.1, z: 0 });
  points.push({ x: wristX - 0.1, y: wristY - 0.15, z: 0 });
  points.push({ x: wristX - 0.12, y: wristY - 0.2, z: 0 });

  // 5-8: Index finger
  const indexTipY = extended ? middleTipY + 0.01 : wristY - 0.02;
  points.push({ x: middleMcpX - 0.03, y: middleMcpY, z: 0 }); // 5: MCP
  points.push({ x: middleMcpX - 0.03, y: (middleMcpY + indexTipY) / 2, z: 0 });
  points.push({ x: middleMcpX - 0.03, y: indexTipY + 0.02, z: 0 });
  points.push({ x: middleMcpX - 0.03, y: indexTipY, z: 0 }); // 8: TIP

  // 9-12: Middle finger
  const actualMiddleTipY = extended ? middleTipY : wristY - 0.02;
  points.push({ x: middleMcpX, y: middleMcpY, z: 0 }); // 9: MCP
  points.push({ x: middleMcpX, y: (middleMcpY + actualMiddleTipY) / 2, z: 0 });
  points.push({ x: middleMcpX, y: actualMiddleTipY + 0.02, z: 0 });
  points.push({ x: middleMcpX, y: actualMiddleTipY, z: 0 }); // 12: TIP

  // 13-16: Ring finger
  const ringTipY = extended ? middleTipY + 0.02 : wristY - 0.02;
  points.push({ x: middleMcpX + 0.03, y: middleMcpY + 0.01, z: 0 }); // 13: MCP
  points.push({ x: middleMcpX + 0.03, y: (middleMcpY + ringTipY) / 2, z: 0 });
  points.push({ x: middleMcpX + 0.03, y: ringTipY + 0.02, z: 0 });
  points.push({ x: middleMcpX + 0.03, y: ringTipY, z: 0 }); // 16: TIP

  // 17-20: Pinky finger
  const pinkyTipY = extended ? middleTipY + 0.03 : wristY - 0.02;
  points.push({ x: middleMcpX + 0.06, y: middleMcpY + 0.02, z: 0 }); // 17: MCP
  points.push({ x: middleMcpX + 0.06, y: (middleMcpY + pinkyTipY) / 2, z: 0 });
  points.push({ x: middleMcpX + 0.06, y: pinkyTipY + 0.02, z: 0 });
  points.push({ x: middleMcpX + 0.06, y: pinkyTipY, z: 0 }); // 20: TIP

  return points;
}

describe('Physical Card Minigame - Two-Hand Detection & Inverted Mapping Suite', () => {
  // Test 1: Canonical Hand-to-Answer Mapping
  it('1. HAND_ANSWER_MAP strictly maps right to "yes" and left to "no"', () => {
    expect(HAND_ANSWER_MAP.right).toBe('yes');
    expect(HAND_ANSWER_MAP.left).toBe('no');
  });

  // Test 2: Two-hand simultaneous detection in evaluateMinigameFrame
  it('2. evaluateMinigameFrame detects and evaluates 2 hands simultaneously', () => {
    // Mirrored camera feed: user's right hand appears on right half (mirroredX > 0.5)
    // Raw middleMcpX for right hand: 0.25 -> mirroredX = 1 - 0.25 = 0.75
    // Raw middleMcpX for left hand: 0.75 -> mirroredX = 1 - 0.75 = 0.25
    const rightHandLandmarks = createMockHandLandmarks({
      wristX: 0.25,
      wristY: 0.65,
      middleMcpX: 0.25,
      middleMcpY: 0.45,
      middleTipY: 0.3,
      extended: true,
    });
    const leftHandLandmarks = createMockHandLandmarks({
      wristX: 0.75,
      wristY: 0.65,
      middleMcpX: 0.75,
      middleMcpY: 0.45,
      middleTipY: 0.3,
      extended: true,
    });

    const result = evaluateMinigameFrame(
      [rightHandLandmarks, leftHandLandmarks],
      [
        [{ categoryName: 'Right', score: 0.95 }],
        [{ categoryName: 'Left', score: 0.95 }],
      ],
      { isMirrored: true }
    );

    expect(result.allHands.length).toBe(2);
    expect(result.raisedHands.length).toBe(2);
  });

  // Test 3: Raising Right Hand maps to 'yes'
  it('3. Raising Right Hand produces answerSide = "yes"', () => {
    const rightHandLandmarks = createMockHandLandmarks({
      wristX: 0.25,
      wristY: 0.65,
      middleMcpX: 0.25,
      middleMcpY: 0.45,
      middleTipY: 0.3,
      extended: true,
    });

    const result = evaluateMinigameFrame(
      [rightHandLandmarks],
      [[{ categoryName: 'Right', score: 0.92 }]],
      { isMirrored: true }
    );

    expect(result.activeHand).not.toBeNull();
    expect(result.activeHand?.anatomicalSide).toBe('right');
    expect(result.activeHand?.answerSide).toBe('yes');
    expect(result.isBothHandsRaised).toBe(false);
  });

  // Test 4: Raising Left Hand maps to 'no'
  it('4. Raising Left Hand produces answerSide = "no"', () => {
    const leftHandLandmarks = createMockHandLandmarks({
      wristX: 0.75,
      wristY: 0.65,
      middleMcpX: 0.75,
      middleMcpY: 0.45,
      middleTipY: 0.3,
      extended: true,
    });

    const result = evaluateMinigameFrame(
      [leftHandLandmarks],
      [[{ categoryName: 'Left', score: 0.92 }]],
      { isMirrored: true }
    );

    expect(result.activeHand).not.toBeNull();
    expect(result.activeHand?.anatomicalSide).toBe('left');
    expect(result.activeHand?.answerSide).toBe('no');
    expect(result.isBothHandsRaised).toBe(false);
  });

  // Test 5: Bilateral Ambiguity Check (Both hands raised)
  it('5. Both hands raised simultaneously triggers isBothHandsRaised = true and activeHand = null', () => {
    const rightHandLandmarks = createMockHandLandmarks({
      wristX: 0.25,
      middleMcpX: 0.25,
      extended: true,
    });
    const leftHandLandmarks = createMockHandLandmarks({
      wristX: 0.75,
      middleMcpX: 0.75,
      extended: true,
    });

    const result = evaluateMinigameFrame(
      [rightHandLandmarks, leftHandLandmarks],
      [
        [{ categoryName: 'Right', score: 0.9 }],
        [{ categoryName: 'Left', score: 0.9 }],
      ],
      { isMirrored: true }
    );

    expect(result.isBothHandsRaised).toBe(true);
    expect(result.activeHand).toBeNull();
  });

  // Test 6: Multi-person filtering (Primary user vs background person)
  it('6. Filters out background persons by focusing on the primary user (largest palm)', () => {
    // Primary user close to camera: palm size ~0.20
    const primaryHand = createMockHandLandmarks({
      wristX: 0.25,
      wristY: 0.7,
      middleMcpX: 0.25,
      middleMcpY: 0.5,
      extended: true,
    });
    // Background passerby: palm size ~0.04
    const backgroundHand = createMockHandLandmarks({
      wristX: 0.8,
      wristY: 0.44,
      middleMcpX: 0.8,
      middleMcpY: 0.4,
      extended: true,
    });

    const result = evaluateMinigameFrame(
      [primaryHand, backgroundHand],
      [
        [{ categoryName: 'Right', score: 0.95 }],
        [{ categoryName: 'Left', score: 0.85 }],
      ],
      { isMirrored: true }
    );

    // Primary hand is retained, background hand with tiny palm is filtered out
    expect(result.allHands.length).toBe(1);
    expect(result.activeHand?.anatomicalSide).toBe('right');
  });

  // Test 7: Frame Edge Detection
  it('7. Detects hands near the boundary and sets hasNearEdgeHand = true', () => {
    // Hand placed right near the extreme edge (mirroredX = 1 - 0.96 = 0.04 < 0.08)
    const edgeHand = createMockHandLandmarks({
      wristX: 0.96,
      middleMcpX: 0.96,
      extended: true,
    });

    const result = evaluateMinigameFrame(
      [edgeHand],
      [[{ categoryName: 'Left', score: 0.9 }]],
      { isMirrored: true }
    );

    expect(result.hasNearEdgeHand).toBe(true);
    expect(result.allHands[0].isNearEdge).toBe(true);
  });

  // Test 8: Raised criteria - Hand below chest level is rejected
  it('8. Rejects hand that is lowered below chest level (middleMcpY > 0.82)', () => {
    const lowHand = createMockHandLandmarks({
      wristX: 0.25,
      wristY: 0.95,
      middleMcpX: 0.25,
      middleMcpY: 0.85, // below maxYThreshold 0.82
      middleTipY: 0.75,
      extended: true,
    });

    const result = evaluateMinigameFrame(
      [lowHand],
      [[{ categoryName: 'Right', score: 0.9 }]],
      { isMirrored: true }
    );

    expect(result.activeHand).toBeNull();
    expect(result.raisedHands.length).toBe(0);
  });

  // Test 9: Raised criteria - Folded fist is rejected
  it('9. Rejects hand with folded fingers (extendedFingers < 2)', () => {
    const fistHand = createMockHandLandmarks({
      wristX: 0.25,
      wristY: 0.65,
      middleMcpX: 0.25,
      middleMcpY: 0.45,
      extended: false, // curled fingers
    });

    const result = evaluateMinigameFrame(
      [fistHand],
      [[{ categoryName: 'Right', score: 0.9 }]],
      { isMirrored: true }
    );

    expect(result.activeHand).toBeNull();
    expect(result.raisedHands.length).toBe(0);
  });

  // Test 10: Skeletons Canvas Rendering function
  it('10. drawAllMinigameHands executes safely on Canvas without crashing', () => {
    const mockCtx = {
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      strokeStyle: '',
      fillStyle: '',
      lineWidth: 1,
      lineCap: '',
      lineJoin: '',
    } as unknown as CanvasRenderingContext2D;

    const hand1 = createMockHandLandmarks({ wristX: 0.25, middleMcpX: 0.25 });
    const hand2 = createMockHandLandmarks({ wristX: 0.75, middleMcpX: 0.75 });

    const frameResult = evaluateMinigameFrame(
      [hand1, hand2],
      [
        [{ categoryName: 'Right', score: 0.9 }],
        [{ categoryName: 'Left', score: 0.9 }],
      ]
    );

    // Test drawing both hands
    expect(() => {
      drawAllMinigameHands(mockCtx, frameResult.allHands, 640, 480, frameResult.activeHand, 0.5, false);
    }).not.toThrow();
    expect(mockCtx.save).toHaveBeenCalled();
    expect(mockCtx.restore).toHaveBeenCalled();
  });

  // Test 11: Multilingual Dynamic Popup Text Availability
  it('11. All minigame i18n translation keys exist and return non-empty strings in TH, EN, ZH', () => {
    const requiredKeys = [
      'card_bottom_hint',
      'card_intro_popup_hint',
      'card_right_hand_yes',
      'card_left_hand_no',
      'card_both_hands_warning',
      'card_confirmed_yes',
      'card_confirmed_no',
      'card_move_to_center',
      'card_btn_tap_yes',
      'card_btn_tap_no',
    ] as const;

    const languages = ['th-TH', 'en-US', 'zh-CN'] as const;

    for (const key of requiredKeys) {
      expect(CLINICAL_DICTIONARY[key]).toBeDefined();
      for (const lang of languages) {
        const text = t(key, lang);
        expect(text).toBeTruthy();
        expect(text.length).toBeGreaterThan(0);
      }
    }
  });

  // Test 12: Zero Regression for useTouchlessGestureStarter (evaluateAnatomicalHand remains intact)
  it('12. evaluateAnatomicalHand remains backwards-compatible for useTouchlessGestureStarter', () => {
    const hand = createMockHandLandmarks({
      wristX: 0.5,
      wristY: 0.7,
      middleMcpX: 0.5,
      middleMcpY: 0.45,
      middleTipY: 0.3,
      extended: true,
    });

    const evalResult = evaluateAnatomicalHand(hand, 'Right', 0.95);
    expect(evalResult).toBeDefined();
    expect(evalResult.isValid).toBe(true);
    expect(evalResult.anatomicalSide).toBe('right');
    expect(evalResult.palmSize).toBeGreaterThan(0);
  });

  // Test 13: Handles null, empty, or undefined input gracefully
  it('13. evaluateMinigameFrame handles empty or null input without crashing', () => {
    const emptyResult = evaluateMinigameFrame(null, null);
    expect(emptyResult.allHands).toEqual([]);
    expect(emptyResult.raisedHands).toEqual([]);
    expect(emptyResult.activeHand).toBeNull();
    expect(emptyResult.isBothHandsRaised).toBe(false);
    expect(emptyResult.hasNearEdgeHand).toBe(false);
  });

  // Test 14: MAX_CROP_RATIO and Adaptive Frame Aspect Ratio
  it('14. MAX_CROP_RATIO is 0.15 (15%) and adaptive aspect ratio eliminates pillarbox bars', () => {
    expect(MAX_CROP_RATIO).toBe(0.15);

    // 16:9 HD feed
    const hdStream = { width: 1280, height: 720 };
    const hdRatio = hdStream.width / hdStream.height;
    expect(hdRatio).toBeCloseTo(16 / 9, 3);

    // 4:3 SD feed
    const sdStream = { width: 640, height: 480 };
    const sdRatio = sdStream.width / sdStream.height;
    expect(sdRatio).toBeCloseTo(4 / 3, 3);

    // Adaptive container aspect ratio matches feed ratio -> 0% crop and 0% pillarbox
    const calcCropRatio = (streamW: number, streamH: number, frameAspect: number) => {
      const streamAspect = streamW / streamH;
      if (Math.abs(streamAspect - frameAspect) < 1e-4) return 0;
      if (streamAspect > frameAspect) {
        // Stream wider than frame: cropped on sides
        const visibleWidth = streamH * frameAspect;
        return (streamW - visibleWidth) / streamW;
      } else {
        // Stream taller than frame: cropped on top/bottom
        const visibleHeight = streamW / frameAspect;
        return (streamH - visibleHeight) / streamH;
      }
    };

    expect(calcCropRatio(1280, 720, hdRatio)).toBe(0);
    expect(calcCropRatio(640, 480, sdRatio)).toBe(0);
    expect(calcCropRatio(1280, 720, hdRatio)).toBeLessThanOrEqual(MAX_CROP_RATIO);
    expect(calcCropRatio(640, 480, sdRatio)).toBeLessThanOrEqual(MAX_CROP_RATIO);
  });

  // Test 15: Overlay coordinate mapping matches mirrored mode
  it('15. drawAllMinigameHands flips X coordinates when isMirrored is true', () => {
    const mockCtx = {
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      strokeStyle: '',
      fillStyle: '',
      lineWidth: 1,
      lineCap: '',
      lineJoin: '',
    } as unknown as CanvasRenderingContext2D;

    const hand = createMockHandLandmarks({ wristX: 0.2, wristY: 0.6, middleMcpX: 0.2, middleMcpY: 0.4 });
    const frameResult = evaluateMinigameFrame([hand], [[{ categoryName: 'Right', score: 0.95 }]], { isMirrored: true });

    drawAllMinigameHands(mockCtx, frameResult.allHands, 1000, 500, null, 0, false, true);

    // In mirrored mode, wristX=0.2 should map to (1 - 0.2) * 1000 = 800
    // Verify an arc or moveTo was called with x = 800
    const arcCalls = (mockCtx.arc as any).mock.calls;
    const hasMirroredX = arcCalls.some((call: any[]) => Math.abs(call[0] - 800) < 1e-3);
    expect(hasMirroredX).toBe(true);
  });

  // Test 16: Overlay coordinate mapping does not flip X coordinates when isMirrored is false
  it('16. drawAllMinigameHands preserves normal X coordinates when isMirrored is false', () => {
    const mockCtx = {
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      strokeStyle: '',
      fillStyle: '',
      lineWidth: 1,
      lineCap: '',
      lineJoin: '',
    } as unknown as CanvasRenderingContext2D;

    const hand = createMockHandLandmarks({ wristX: 0.2, wristY: 0.6, middleMcpX: 0.2, middleMcpY: 0.4 });
    const frameResult = evaluateMinigameFrame([hand], [[{ categoryName: 'Right', score: 0.95 }]], { isMirrored: false });

    drawAllMinigameHands(mockCtx, frameResult.allHands, 1000, 500, null, 0, false, false);

    // In unmirrored mode, wristX=0.2 should map to 0.2 * 1000 = 200
    const arcCalls = (mockCtx.arc as any).mock.calls;
    const hasUnmirroredX = arcCalls.some((call: any[]) => Math.abs(call[0] - 200) < 1e-3);
    expect(hasUnmirroredX).toBe(true);
  });

  // Test 17: Dwell Progress Ring palm coordinate mapping respects isMirrored
  it('17. Dwell progress ring palm coordinate maps correctly in both mirrored and unmirrored modes', () => {
    const mockCtxMirrored = {
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      strokeStyle: '',
      fillStyle: '',
      lineWidth: 1,
      lineCap: '',
      lineJoin: '',
    } as unknown as CanvasRenderingContext2D;

    const mockCtxUnmirrored = {
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      strokeStyle: '',
      fillStyle: '',
      lineWidth: 1,
      lineCap: '',
      lineJoin: '',
    } as unknown as CanvasRenderingContext2D;

    // Palm MCP 9 is at middleMcpX = 0.3
    const hand = createMockHandLandmarks({ wristX: 0.3, wristY: 0.6, middleMcpX: 0.3, middleMcpY: 0.45 });
    const frameResult = evaluateMinigameFrame([hand], [[{ categoryName: 'Right', score: 0.95 }]], { isMirrored: true });

    // Mirrored with dwell progress = 0.5
    drawAllMinigameHands(mockCtxMirrored, frameResult.allHands, 1000, 500, frameResult.activeHand, 0.5, false, true);
    // Unmirrored with dwell progress = 0.5
    drawAllMinigameHands(mockCtxUnmirrored, frameResult.allHands, 1000, 500, frameResult.activeHand, 0.5, false, false);

    // Mirrored: px = (1 - 0.3) * 1000 = 700
    const mirroredArcs = (mockCtxMirrored.arc as any).mock.calls;
    const hasMirroredPalmRing = mirroredArcs.some((call: any[]) => Math.abs(call[0] - 700) < 1e-3 && Math.abs(call[2] - 32) < 1e-3);
    expect(hasMirroredPalmRing).toBe(true);

    // Unmirrored: px = 0.3 * 1000 = 300
    const unmirroredArcs = (mockCtxUnmirrored.arc as any).mock.calls;
    const hasUnmirroredPalmRing = unmirroredArcs.some((call: any[]) => Math.abs(call[0] - 300) < 1e-3 && Math.abs(call[2] - 32) < 1e-3);
    expect(hasUnmirroredPalmRing).toBe(true);
  });
});

