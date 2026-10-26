import { describe, it, expect } from 'vitest';
import {
  ActiveLivenessTracker,
  FastLoginLivenessVerifier,
  PassiveLivenessChecker,
} from '../src/liveness';
import { FaceDetectionResult } from '../src/detect';

describe('[LIVENESS-PAD] Presentation Attack Detection & Anti-Spoofing Engine', () => {
  describe('1. PassiveLivenessChecker (3D Landmark Protrusion & Micro-Motion)', () => {
    const checker = new PassiveLivenessChecker();

    it('rejects a flat 2D photograph with near-zero depth variance', () => {
      const spoofFlatDetection = {
        hasFace: true,
        multipleFaces: false,
        faceCount: 1,
        confidence: 0.95,
        box: { x: 50, y: 50, width: 200, height: 200 },
        liveness: {
          depthScore: 0.08, // Very low 3D protrusion (flat 2D paper photo or phone screen)
          microMotionScore: 0.02,
          is3dLive: false,
          state: 'spoof_blocked' as const,
          statusMessageThai: 'ตรวจพบภาพที่ไม่ใช่ใบหน้าจริง',
          isLiveVerified: false,
          ear: 0.3,
          isBlinking: false,
        },
        landmarks: {
          leftEye: { x: 80, y: 90 },
          rightEye: { x: 140, y: 90 },
          noseTip: { x: 110, y: 120 },
          mouth: { x: 110, y: 160 },
          leftEarTragion: { x: 60, y: 110 },
          rightEarTragion: { x: 160, y: 110 },
        },
      } as unknown as FaceDetectionResult;

      const result = checker.check(spoofFlatDetection);
      expect(result.isLive).toBe(false);
      expect(result.issues).toContain('LIVENESS_REJECTED_FLAT_2D_SPOOF');
    });

    it('accepts genuine 3D live facial structure with natural depth and micro-movement', () => {
      const liveHumanDetection = {
        hasFace: true,
        multipleFaces: false,
        faceCount: 1,
        confidence: 0.95,
        box: { x: 50, y: 50, width: 200, height: 200 },
        liveness: {
          depthScore: 0.78, // High natural 3D protrusion
          microMotionScore: 0.45,
          is3dLive: true,
          state: 'live_verified' as const,
          statusMessageThai: 'บุคคลจริง',
          isLiveVerified: true,
          ear: 0.3,
          isBlinking: false,
        },
        landmarks: {
          leftEye: { x: 80, y: 90 },
          rightEye: { x: 140, y: 90 },
          noseTip: { x: 110, y: 120 },
          mouth: { x: 110, y: 160 },
          leftEarTragion: { x: 60, y: 110 },
          rightEarTragion: { x: 160, y: 110 },
        },
      } as unknown as FaceDetectionResult;

      const result = checker.check(liveHumanDetection);
      expect(result.isLive).toBe(true);
      expect(result.issues.length).toBe(0);
    });
  });

  describe('2. ActiveLivenessTracker (4-Stage Enrollment Challenge-Response)', () => {
    it('progresses through 4 stages: front+blink -> left -> right -> nod', () => {
      const tracker = new ActiveLivenessTracker();

      // Stage 1: Front + Eye Blink
      // 1.1 Waiting for blink while looking straight
      let update = tracker.update({
        hasFace: true,
        pose: { yaw: 2, pitch: 1, roll: 0 },
        eyes: { ear: 0.32, isBlinking: false },
      } as any);
      expect(update.stageIndex).toBe(0);
      expect(update.stageId).toBe('front_blink');
      expect(update.stagePassed).toBe(false);
      expect(update.issues).toContain('กรุณากะพริบตา 1 ครั้ง');

      // 1.2 Blink starts (EAR drops < 0.20)
      tracker.update({
        hasFace: true,
        pose: { yaw: 1, pitch: 1, roll: 0 },
        eyes: { ear: 0.15, isBlinking: true },
      } as any);

      // 1.3 Blink completes (EAR recovers > 0.25)
      update = tracker.update({
        hasFace: true,
        pose: { yaw: 2, pitch: 0, roll: 0 },
        eyes: { ear: 0.30, isBlinking: false },
      } as any);
      expect(update.blinkVerified).toBe(true);
      expect(update.stagePassed).toBe(true);

      // Advance to Stage 2: Left Turn
      tracker.advanceStage();

      // 2.1 Needs left rotation (yaw <= -15°)
      update = tracker.update({
        hasFace: true,
        pose: { yaw: -5, pitch: 0, roll: 0 },
      } as any);
      expect(update.stageIndex).toBe(1);
      expect(update.stageId).toBe('left_turn');
      expect(update.stagePassed).toBe(false);

      // 2.2 Achieves left rotation
      update = tracker.update({
        hasFace: true,
        pose: { yaw: -18, pitch: 0, roll: 0 },
      } as any);
      expect(update.stagePassed).toBe(true);

      // Advance to Stage 3: Right Turn
      tracker.advanceStage();

      // 3.1 Needs right rotation (yaw >= +15°)
      update = tracker.update({
        hasFace: true,
        pose: { yaw: 8, pitch: 0, roll: 0 },
      } as any);
      expect(update.stageIndex).toBe(2);
      expect(update.stageId).toBe('right_turn');
      expect(update.stagePassed).toBe(false);

      // 3.2 Achieves right rotation
      update = tracker.update({
        hasFace: true,
        pose: { yaw: 20, pitch: 0, roll: 0 },
      } as any);
      expect(update.stagePassed).toBe(true);

      // Advance to Stage 4: Pitch Nod
      tracker.advanceStage();

      // 4.1 First frame sets initial pitch
      tracker.update({
        hasFace: true,
        pose: { yaw: 0, pitch: 5, roll: 0 },
      } as any);

      // 4.2 Nods down by at least 10°
      update = tracker.update({
        hasFace: true,
        pose: { yaw: 0, pitch: -12, roll: 0 },
      } as any);
      expect(update.stageIndex).toBe(3);
      expect(update.stageId).toBe('pitch_nod');
      expect(update.stagePassed).toBe(true);
    });
  });

  describe('3. FastLoginLivenessVerifier (Kiosk / Portal Fast Verification)', () => {
    it('immediately blocks flat 2D spoof attacks and outputs Thai rejection message', () => {
      const verifier = new FastLoginLivenessVerifier(1000);
      verifier.start();

      let lastResult: any;
      // Feed 10 consecutive flat frames (depthScore = 0.05, no blink)
      for (let i = 0; i < 10; i++) {
        lastResult = verifier.evaluate({
          hasFace: true,
          liveness: { depthScore: 0.05, microMotionScore: 0.01, is3dLive: false },
          eyes: { ear: 0.32, isBlinking: false },
        } as any);
      }

      expect(lastResult.isLive).toBe(false);
      expect(lastResult.state).toBe('spoof_blocked');
      expect(lastResult.statusMessageThai).toContain('ตรวจพบภาพที่ไม่ใช่ใบหน้าจริง');
    });

    it('passes verified live human after sufficient depth and blink/motion within duration', () => {
      const verifier = new FastLoginLivenessVerifier(200);
      verifier.start();

      // Feed frames with realistic 3D depth and a blink
      verifier.evaluate({
        hasFace: true,
        liveness: { depthScore: 0.75, microMotionScore: 0.35, is3dLive: true },
        eyes: { ear: 0.30, isBlinking: false },
      } as any);
      verifier.evaluate({
        hasFace: true,
        liveness: { depthScore: 0.72, microMotionScore: 0.35, is3dLive: true },
        eyes: { ear: 0.16, isBlinking: true },
      } as any);
      verifier.evaluate({
        hasFace: true,
        liveness: { depthScore: 0.76, microMotionScore: 0.35, is3dLive: true },
        eyes: { ear: 0.28, isBlinking: false },
      } as any);

      // Wait 250ms for required duration
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          const result = verifier.evaluate({
            hasFace: true,
            liveness: { depthScore: 0.78, microMotionScore: 0.40, is3dLive: true },
            eyes: { ear: 0.31, isBlinking: false },
          } as any);

          expect(result.isLive).toBe(true);
          expect(result.state).toBe('live_verified');
          expect(result.blinkVerified).toBe(true);
          expect(result.depthScore).toBeGreaterThanOrEqual(0.28);
          resolve();
        }, 250);
      });
    });
  });
});
