import { describe, it, expect } from 'vitest';
import {
  computeLaplacianVariance,
  FaceQualityChecker,
} from '../src/quality';
import { FaceDetectionResult } from '../src/detect';

describe('[FACE-CLIENT] quality.ts - Real Mathematical Quality Gate', () => {
  describe('1. computeLaplacianVariance', () => {
    it('1.1 should return 0 variance for a completely flat solid image', () => {
      const width = 20;
      const height = 20;
      const pixels = new Uint8ClampedArray(width * height * 4);
      // Fill with solid gray (128, 128, 128, 255)
      for (let i = 0; i < pixels.length; i += 4) {
        pixels[i] = 128;
        pixels[i + 1] = 128;
        pixels[i + 2] = 128;
        pixels[i + 3] = 255;
      }

      const variance = computeLaplacianVariance(pixels, width, height);
      expect(variance).toBe(0);
    });

    it('1.2 should return high variance (> 100) for high-frequency sharp edge checkerboard pattern', () => {
      const width = 20;
      const height = 20;
      const pixels = new Uint8ClampedArray(width * height * 4);

      // Alternating black and white pixels (checkerboard)
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 4;
          const val = (x + y) % 2 === 0 ? 255 : 0;
          pixels[idx] = val;
          pixels[idx + 1] = val;
          pixels[idx + 2] = val;
          pixels[idx + 3] = 255;
        }
      }

      const variance = computeLaplacianVariance(pixels, width, height);
      expect(variance).toBeGreaterThan(100);
    });
  });

  describe('2. Face Quality Gate Criteria', () => {
    const checker = new FaceQualityChecker({
      minIod: 40,
      minBrightness: 40,
      maxBrightness: 220,
      minSharpness: 50,
      stabilityMs: 300,
    });

    const createValidDetection = (): FaceDetectionResult => ({
      hasFace: true,
      multipleFaces: false,
      faceCount: 1,
      confidence: 0.98,
      box: { x: 50, y: 50, width: 200, height: 200 },
      landmarks: {
        leftEye: { x: 100, y: 120 },
        rightEye: { x: 160, y: 120 }, // IOD = 60px (> 40px)
        noseTip: { x: 130, y: 150 },
        leftMouth: { x: 110, y: 180 },
        rightMouth: { x: 150, y: 180 },
      },
      pose: { yaw: 0, pitch: 0, roll: 0 },
      eyes: { leftEyeOpen: 0.95, rightEyeOpen: 0.95 },
    });

    it('2.1 should reject when no face is detected', () => {
      const detection: FaceDetectionResult = {
        hasFace: false,
        multipleFaces: false,
        faceCount: 0,
        confidence: 0,
      };

      const result = checker.checkQuality(detection);
      expect(result.passed).toBe(false);
      expect(result.issues).toContain('NO_FACE_DETECTED');
    });

    it('2.2 should reject when multiple faces are detected', () => {
      const detection: FaceDetectionResult = {
        hasFace: true,
        multipleFaces: true,
        faceCount: 2,
        confidence: 0.9,
      };

      const result = checker.checkQuality(detection);
      expect(result.passed).toBe(false);
      expect(result.issues).toContain('MULTIPLE_FACES_DETECTED');
    });

    it('2.3 should reject when face is too far (IOD < minIod)', () => {
      const detection = createValidDetection();
      // Set eye distance to 20px (< 40px)
      detection.landmarks!.leftEye = { x: 100, y: 120 };
      detection.landmarks!.rightEye = { x: 120, y: 120 };

      const result = checker.checkQuality(detection);
      expect(result.passed).toBe(false);
      expect(result.issues.some((i) => i.startsWith('FACE_TOO_FAR'))).toBe(true);
    });

    it('2.4 should reject when eyes are closed', () => {
      const detection = createValidDetection();
      detection.eyes = { leftEyeOpen: 0.2, rightEyeOpen: 0.95 }; // Left eye closed

      const result = checker.checkQuality(detection);
      expect(result.passed).toBe(false);
      expect(result.issues).toContain('EYES_CLOSED');
    });

    it('2.5 should validate head pose matching', () => {
      const detection = createValidDetection();

      // Front target with frontal pose -> passes pose
      detection.pose = { yaw: 2, pitch: -3, roll: 1 };
      let res = checker.checkQuality(detection, undefined, 'front');
      expect(res.poseMatched).toBe(true);

      // Front target with head turned left -> fails pose
      detection.pose = { yaw: -25, pitch: 0, roll: 0 };
      res = checker.checkQuality(detection, undefined, 'front');
      expect(res.poseMatched).toBe(false);
      expect(res.issues.some((i) => i.startsWith('POSE_NOT_FRONT'))).toBe(true);

      // Left target with head turned left (yaw <= -15) -> passes pose
      res = checker.checkQuality(detection, undefined, 'left');
      expect(res.poseMatched).toBe(true);

      // Right target with head turned right (yaw >= 15) -> passes pose
      detection.pose = { yaw: 22, pitch: 0, roll: 0 };
      res = checker.checkQuality(detection, undefined, 'right');
      expect(res.poseMatched).toBe(true);

      // Nod target with head tilted down (pitch <= -12) -> passes pose
      detection.pose = { yaw: 0, pitch: -16, roll: 0 };
      res = checker.checkQuality(detection, undefined, 'nod');
      expect(res.poseMatched).toBe(true);
    });

    it('2.6 should require 300ms continuous temporal stability', () => {
      checker.resetStability();
      const detection = createValidDetection();
      const baseTime = 10000;

      // First frame at t = 0ms -> Not stable yet
      const res1 = checker.checkQuality(detection, undefined, 'front', baseTime);
      expect(res1.passed).toBe(false);
      expect(res1.issues.some((i) => i.startsWith('STABILITY_INSUFFICIENT'))).toBe(true);
      expect(res1.stableDurationMs).toBe(0);

      // Second frame at t = 150ms -> Still < 300ms
      const res2 = checker.checkQuality(detection, undefined, 'front', baseTime + 150);
      expect(res2.passed).toBe(false);
      expect(res2.stableDurationMs).toBe(150);

      // Third frame at t = 300ms -> Stability reached!
      const res3 = checker.checkQuality(detection, undefined, 'front', baseTime + 300);
      expect(res3.passed).toBe(true);
      expect(res3.stableDurationMs).toBe(300);

      // If face disappears, stability resets immediately
      const noFace: FaceDetectionResult = {
        hasFace: false,
        multipleFaces: false,
        faceCount: 0,
        confidence: 0,
      };
      checker.checkQuality(noFace, undefined, 'front', baseTime + 350);

      // Re-detection starts at 0ms again
      const res4 = checker.checkQuality(detection, undefined, 'front', baseTime + 400);
      expect(res4.passed).toBe(false);
      expect(res4.stableDurationMs).toBe(0);
    });
  });
});
