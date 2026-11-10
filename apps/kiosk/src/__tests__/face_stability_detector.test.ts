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
      minDurationMs: 500,
      maxDisplacementRatio: 0.035, // 3.5% screen distance (accommodates sensor noise & subtle breathing)
      minWidthRatio: 0.08, // 8% screen width (accommodates normal desk & kiosk seating 60-120cm)
      maxWidthRatio: 0.65,
      maxYaw: 22,
      maxPitch: 20,
    });
  });

  it('1. Qualifies stable frontal face after holding still for 500ms', () => {
    const baseTime = 1000;
    // Base detection satisfying all frontal conditions (width 200/640 = 31.25%, center = 320, 240)
    const detection = {
      hasFace: true,
      box: { x: 220, y: 160, width: 200, height: 240 },
      pose: { yaw: 2, pitch: -3 },
    };

    // Feed frames over 600ms at 100ms intervals with virtually zero movement
    let lastResult;
    for (let t = 0; t <= 600; t += 100) {
      // Subtle micro-shift (< 0.2% screen distance)
      const microJitter = (t % 200 === 0) ? 0.5 : 0;
      lastResult = detector.update(
        {
          ...detection,
          box: { ...detection.box, x: 220 + microJitter },
        },
        640,
        480,
        baseTime + t
      );
    }

    expect(lastResult?.isStable).toBe(true);
    expect(lastResult?.durationMs).toBeGreaterThanOrEqual(500);
    expect(lastResult?.statusMessageThai).toBe('ใบหน้านิ่งพร้อมสแกน');
  });

  it('2. Does not qualify before 500ms elapsed (e.g. at 300ms)', () => {
    const baseTime = 1000;
    const detection = {
      hasFace: true,
      box: { x: 220, y: 160, width: 200, height: 240 },
      pose: { yaw: 0, pitch: 0 },
    };

    let result;
    for (let t = 0; t <= 300; t += 100) {
      result = detector.update(detection, 640, 480, baseTime + t);
    }

    expect(result?.isStable).toBe(false);
    expect(result?.durationMs).toBeLessThan(500);
  });

  it('3. Rejects and resets when head moves > 3.5% screen distance (motion blur prevention)', () => {
    const baseTime = 1000;
    const detection = {
      hasFace: true,
      box: { x: 220, y: 160, width: 200, height: 240 },
      pose: { yaw: 0, pitch: 0 },
    };

    // Frame 1 to 4: Still
    detector.update(detection, 640, 480, baseTime);
    detector.update(detection, 640, 480, baseTime + 100);
    detector.update(detection, 640, 480, baseTime + 200);

    // Frame 5: Sudden movement (e.g. stepping forward or turning away: dx = 30px in 640 width = 4.68% > 3.5%)
    const movingDetection = {
      ...detection,
      box: { ...detection.box, x: 250 },
    };
    const movingResult = detector.update(movingDetection, 640, 480, baseTime + 300);

    expect(movingResult.isStable).toBe(false);
    expect(movingResult.reason).toBe('MOVING');
    expect(movingResult.displacementRatio).toBeGreaterThan(0.035);
    expect(movingResult.statusMessageThai).toBe('กรุณายืนนิ่งๆ มองตรงที่กล้อง');
  });

  it('4. Rejects non-frontal orientation (|yaw| > 22° or |pitch| > 20°)', () => {
    const turnedDetection = {
      hasFace: true,
      box: { x: 220, y: 160, width: 200, height: 240 },
      pose: { yaw: 25, pitch: 0 },
    };
    const res1 = detector.update(turnedDetection, 640, 480, 1000);
    expect(res1.isStable).toBe(false);
    expect(res1.reason).toBe('NOT_FRONTAL');
    expect(res1.statusMessageThai).toBe('กรุณามองตรงที่กล้อง');

    const tiltedDetection = {
      hasFace: true,
      box: { x: 220, y: 160, width: 200, height: 240 },
      pose: { yaw: 0, pitch: -24 },
    };
    const res2 = detector.update(tiltedDetection, 640, 480, 1000);
    expect(res2.isStable).toBe(false);
    expect(res2.reason).toBe('NOT_FRONTAL');
  });

  it('5. Rejects faces outside size boundary (8% <= widthRatio <= 65%) and accepts natural desk seating (12.5%)', () => {
    // Too far (width 40 / 640 = 6.25% < 8%)
    const farDetection = {
      hasFace: true,
      box: { x: 280, y: 200, width: 40, height: 50 },
      pose: { yaw: 0, pitch: 0 },
    };
    const resFar = detector.update(farDetection, 640, 480, 1000);
    expect(resFar.isStable).toBe(false);
    expect(resFar.reason).toBe('FACE_TOO_FAR');
    expect(resFar.statusMessageThai).toBe('กรุณาขยับเข้าใกล้กล้องอีกนิด');

    // Natural desk seating distance (~70cm, face width 80px / 640 = 12.5% of frame) -> MUST pass size boundary!
    const deskDetection = {
      hasFace: true,
      box: { x: 280, y: 200, width: 80, height: 100 },
      pose: { yaw: 0, pitch: 0 },
    };
    const resDesk = detector.update(deskDetection, 640, 480, 1000);
    // Should NOT be rejected for FACE_TOO_FAR
    expect(resDesk.reason).not.toBe('FACE_TOO_FAR');

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
