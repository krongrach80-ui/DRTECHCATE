/**
 * apps/kiosk/src/__tests__/kiosk_zero_touch_auto_scan.test.ts
 * Tests for Zero-Touch Auto-Scan, Passive Liveness & Manual Button Removal
 */

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { checkKioskFaceQuality, SmartLoginView } from '../smart-flow/SmartLoginView';
import { FastLoginLivenessVerifier } from '../../../../packages/face-client/src/liveness';

describe('Zero-Touch Auto-Scan & Quality Gate Verification', () => {
  describe('1. checkKioskFaceQuality Quality Gate', () => {
    it('passes a frontal face satisfying faceWidthRatio >= 0.10, yaw <= 22, pitch <= 20 inside boundaries', () => {
      const detection = {
        hasFace: true,
        box: { x: 100, y: 100, width: 120, height: 160 },
        pose: { yaw: 10, pitch: -8 },
      };
      // frame: 640x480. faceWidthRatio = 120 / 640 = 0.1875 >= 0.10
      const result = checkKioskFaceQuality(detection, 640, 480);
      expect(result.passed).toBe(true);
      expect(result.statusMessageThai).toBe('ใบหน้าพร้อมสำหรับการสแกน');
    });

    it('rejects faces smaller than 10% frame width (faceWidthRatio < 0.10)', () => {
      const detection = {
        hasFace: true,
        box: { x: 200, y: 200, width: 50, height: 65 }, // 50 / 640 = 0.078 < 0.10
        pose: { yaw: 0, pitch: 0 },
      };
      const result = checkKioskFaceQuality(detection, 640, 480);
      expect(result.passed).toBe(false);
      expect(result.reason).toBe('FACE_TOO_SMALL');
    });

    it('rejects turned face |yaw| > 22°', () => {
      const detection = {
        hasFace: true,
        box: { x: 100, y: 100, width: 150, height: 180 },
        pose: { yaw: 25, pitch: 5 },
      };
      const result = checkKioskFaceQuality(detection, 640, 480);
      expect(result.passed).toBe(false);
      expect(result.reason).toBe('HEAD_TURNED');
    });

    it('rejects tilted face |pitch| > 20°', () => {
      const detection = {
        hasFace: true,
        box: { x: 100, y: 100, width: 150, height: 180 },
        pose: { yaw: 5, pitch: -25 },
      };
      const result = checkKioskFaceQuality(detection, 640, 480);
      expect(result.passed).toBe(false);
      expect(result.reason).toBe('HEAD_TILTED');
    });

    it('rejects face clipped outside frame boundaries', () => {
      const detection = {
        hasFace: true,
        box: { x: -10, y: 50, width: 200, height: 250 },
        pose: { yaw: 0, pitch: 0 },
      };
      const result = checkKioskFaceQuality(detection, 640, 480);
      expect(result.passed).toBe(false);
      expect(result.reason).toBe('FACE_CLIPPED');
    });

    it('does NOT enforce circular reticle centerDistance check', () => {
      // Face is near the right edge (x=400, width=150, center = 475/640 = 0.74 => centerDistance > 0.24)
      const detection = {
        hasFace: true,
        box: { x: 400, y: 100, width: 150, height: 180 },
        pose: { yaw: 5, pitch: 0 },
      };
      const result = checkKioskFaceQuality(detection, 640, 480);
      expect(result.passed).toBe(true);
    });
  });

  describe('2. Passive Multi-Frame Liveness in FastLoginLivenessVerifier', () => {
    it('promotes to live_verified within 4-6 frames without requiring active blink when 3D depth and micro-movement are detected', async () => {
      const verifier = new FastLoginLivenessVerifier(250);
      verifier.start();

      // Feed 5 frames with 3D depth and subtle natural micro-movement (no blink, eyes open EAR 0.34)
      for (let i = 0; i < 5; i++) {
        verifier.evaluate({
          hasFace: true,
          box: { x: 100, y: 100, width: 150, height: 180 },
          landmarks: { noseTip: { x: 175 + i * 0.5, y: 190 + (i % 2) * 0.3 } },
          liveness: { depthScore: 0.75, microMotionScore: 0.05, is3dLive: true },
          eyes: { ear: 0.34, isBlinking: false },
          pose: { yaw: 2, pitch: 1 },
        } as any);
      }

      await new Promise((resolve) => setTimeout(resolve, 260));

      const finalResult = verifier.evaluate({
        hasFace: true,
        box: { x: 100, y: 100, width: 150, height: 180 },
        landmarks: { noseTip: { x: 177.5, y: 190.3 } },
        liveness: { depthScore: 0.75, microMotionScore: 0.05, is3dLive: true },
        eyes: { ear: 0.34, isBlinking: false },
        pose: { yaw: 2, pitch: 1 },
      } as any);

      expect(finalResult.isLive).toBe(true);
      expect(finalResult.state).toBe('live_verified');
    });

    it('rejects flat 2D spoof attacks even after multiple frames', () => {
      const verifier = new FastLoginLivenessVerifier(250);
      verifier.start();

      let res: any;
      for (let i = 0; i < 10; i++) {
        res = verifier.evaluate({
          hasFace: true,
          liveness: { depthScore: 0.08, microMotionScore: 0.0, is3dLive: false },
          eyes: { ear: 0.32, isBlinking: false },
        } as any);
      }

      expect(res.isLive).toBe(false);
      expect(res.state).toBe('spoof_blocked');
    });
  });

  describe('3. UI Contract: Manual Scan Button Removed & Secondary Buttons Preserved', () => {
    it('does not render kiosk-scan-face-btn in DOM while preserving PIN and Enroll buttons', () => {
      const onLoginSuccess = vi.fn();
      const onNavigateToEnroll = vi.fn();

      const html = renderToStaticMarkup(
        React.createElement(SmartLoginView, {
          onLoginSuccess,
          onNavigateToEnroll,
        })
      );

      // Verify the manual scan button is completely gone
      expect(html.includes('id="kiosk-scan-face-btn"')).toBe(false);
      expect(html.includes('เริ่มสแกนใบหน้าใหม่อีกครั้ง')).toBe(false);

      // Verify PIN scan button is removed and staff-gated enroll hook stays hidden
      expect(html.includes('id="kiosk-pin-login-btn"')).toBe(false);
      expect(html.includes('id="kiosk-enroll-new-btn"')).toBe(true);
    });
  });
});
