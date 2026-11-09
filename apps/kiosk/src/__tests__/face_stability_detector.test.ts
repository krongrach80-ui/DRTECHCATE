/**
 * apps/kiosk/src/__tests__/face_stability_detector.test.ts
 * Rigorous test suite for FaceStabilityDetector (Pose & Positional Stability Gate)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { FaceStabilityDetector } from '../smart-flow/SmartLoginView';

describe('FaceStabilityDetector: Pose & Positional Stability Gate', () => {
  let detector: FaceStabilityDetector;

  beforeEach(() => {
    detector = new FaceStabilityDetector({
      minDurationMs: 600,
      maxDisplacementRatio: 0.015, // 1.5% screen distance
      minWidthRatio: 0.15,
      maxWidthRatio: 0.65,
      maxYaw: 18,
      maxPitch: 15,
    });
  });

  it('1. Qualifies stable frontal face after holding still for 600ms', () => {
    const baseTime = 1000;
    // Base detection satisfying all frontal conditions (width 200/640 = 31.25%, center = 320, 240)
    const detection = {
      hasFace: true,
      box: { x: 220, y: 160, width: 200, height: 240 },
      pose: { yaw: 2, pitch: -3 },
      landmarks: { noseTip: { x: 320, y: 250 } },
    };

    // Feed frames over 700ms at 100ms intervals with virtually zero movement
    let lastResult;
    for (let t = 0; t <= 700; t += 100) {
      // Subtle micro-shift (< 0.2% screen distance)
      const microJitter = (t % 200 === 0) ? 0.5 : 0;
      lastResult = detector.update(
        {
          ...detection,
          landmarks: { noseTip: { x: 320 + microJitter, y: 250 } },
        },
        640,
        480,
        baseTime + t
      );
    }

    expect(lastResult?.isStable).toBe(true);
    expect(lastResult?.durationMs).toBeGreaterThanOrEqual(600);
    expect(lastResult?.statusMessageThai).toBe('ใบหน้านิ่งพร้อมสแกน');
  });

  it('2. Does not qualify before 600ms elapsed (e.g. at 400ms)', () => {
    const baseTime = 1000;
    const detection = {
      hasFace: true,
      box: { x: 220, y: 160, width: 200, height: 240 },
      pose: { yaw: 0, pitch: 0 },
      landmarks: { noseTip: { x: 320, y: 250 } },
    };

    let result;
    for (let t = 0; t <= 400; t += 100) {
      result = detector.update(detection, 640, 480, baseTime + t);
    }

    expect(result?.isStable).toBe(false);
    expect(result?.durationMs).toBeLessThan(600);
  });

  it('3. Rejects and resets when head moves > 1.5% screen distance (motion blur prevention)', () => {
    const baseTime = 1000;
    const detection = {
      hasFace: true,
      box: { x: 220, y: 160, width: 200, height: 240 },
      pose: { yaw: 0, pitch: 0 },
      landmarks: { noseTip: { x: 320, y: 250 } },
    };

    // Frame 1 to 4: Still
    detector.update(detection, 640, 480, baseTime);
    detector.update(detection, 640, 480, baseTime + 100);
    detector.update(detection, 640, 480, baseTime + 200);

    // Frame 5: Sudden movement (e.g. stepping forward or shaking head: dx = 25px in 640 width = 3.9% > 1.5%)
    const movingDetection = {
      ...detection,
      box: { ...detection.box, x: 245 },
      landmarks: { noseTip: { x: 345, y: 250 } },
    };
    const movingResult = detector.update(movingDetection, 640, 480, baseTime + 300);

    expect(movingResult.isStable).toBe(false);
    expect(movingResult.reason).toBe('MOVING');
    expect(movingResult.displacementRatio).toBeGreaterThan(0.015);
    expect(movingResult.statusMessageThai).toBe('กรุณายืนนิ่งๆ มองตรงที่กล้อง');
  });

  it('4. Rejects non-frontal orientation (|yaw| > 18° or |pitch| > 15°)', () => {
    const turnedDetection = {
      hasFace: true,
      box: { x: 220, y: 160, width: 200, height: 240 },
      pose: { yaw: 22, pitch: 0 },
    };
    const res1 = detector.update(turnedDetection, 640, 480, 1000);
    expect(res1.isStable).toBe(false);
    expect(res1.reason).toBe('NOT_FRONTAL');
    expect(res1.statusMessageThai).toBe('กรุณามองตรงที่กล้อง');

    const tiltedDetection = {
      hasFace: true,
      box: { x: 220, y: 160, width: 200, height: 240 },
      pose: { yaw: 0, pitch: -19 },
    };
    const res2 = detector.update(tiltedDetection, 640, 480, 1000);
    expect(res2.isStable).toBe(false);
    expect(res2.reason).toBe('NOT_FRONTAL');
  });

  it('5. Rejects faces outside size boundary (15% <= widthRatio <= 65%)', () => {
    // Too far (width 80 / 640 = 12.5% < 15%)
    const farDetection = {
      hasFace: true,
      box: { x: 280, y: 200, width: 80, height: 100 },
      pose: { yaw: 0, pitch: 0 },
    };
    const resFar = detector.update(farDetection, 640, 480, 1000);
    expect(resFar.isStable).toBe(false);
    expect(resFar.reason).toBe('FACE_TOO_FAR');
    expect(resFar.statusMessageThai).toBe('กรุณาขยับเข้าใกล้กล้องอีกนิด');

    // Too close (width 450 / 640 = 70.3% > 65%)
    const closeDetection = {
      hasFace: true,
      box: { x: 100, y: 50, width: 450, height: 400 },
      pose: { yaw: 0, pitch: 0 },
    };
    const resClose = detector.update(closeDetection, 640, 480, 1000);
    expect(resClose.isStable).toBe(false);
    expect(resClose.reason).toBe('FACE_TOO_CLOSE');
    expect(resClose.statusMessageThai).toBe('กรุณาถอยห่างจากกล้องเล็กน้อย');
  });

  it('6. Rejects multiple faces in frame', () => {
    const multiDetection = {
      hasFace: true,
      multipleFaces: true,
      box: { x: 200, y: 150, width: 180, height: 220 },
    };
    const res = detector.update(multiDetection, 640, 480, 1000);
    expect(res.isStable).toBe(false);
    expect(res.reason).toBe('MULTIPLE_FACES');
    expect(res.statusMessageThai).toBe('⚠️ กรุณาให้ผู้ใช้ยืนหน้ากล้องทีละคน');
  });

  it('7. Cleanly resets when face disappears', () => {
    const detection = {
      hasFace: true,
      box: { x: 220, y: 160, width: 200, height: 240 },
      pose: { yaw: 0, pitch: 0 },
    };
    detector.update(detection, 640, 480, 1000);
    detector.update(detection, 640, 480, 1300);

    // No face
    const resNoFace = detector.update(null, 640, 480, 1400);
    expect(resNoFace.isStable).toBe(false);
    expect(resNoFace.reason).toBe('NO_FACE');

    // Re-appearing face starts fresh timer from 0
    const resNew = detector.update(detection, 640, 480, 1500);
    expect(resNew.isStable).toBe(false);
    expect(resNew.durationMs).toBe(0);
  });
});
