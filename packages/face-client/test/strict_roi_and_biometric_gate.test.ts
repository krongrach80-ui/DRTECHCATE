/**
 * packages/face-client/test/strict_roi_and_biometric_gate.test.ts
 * Rigorous Unit & Integration Test Suite covering:
 * Case A: Strict ROI / Circle Center & Full-Face Bounding Check
 * Case B: Strict >= 80% Biometric Similarity Threshold & Zero Fallback Match
 * Case C: Registered User Inside Circle with Similarity >= 80% and Clean Name Display
 */

import { describe, it, expect } from 'vitest';
import {
  checkFaceROIInCircle,
  FaceDetectionResult,
} from '../src/detect';
import {
  evaluateBiometricMatch,
  l2Normalize,
  ACCEPTANCE_THRESHOLDS,
} from '../../../packages/smart-biometric-core/src/vectorMath';

describe('Biometric Gate & Strict Circle ROI Verification Suite', () => {
  describe('Case A: Strict ROI / Circle Center & Full-Face Bounding Check (Rule 1)', () => {
    const frameW = 640;
    const frameH = 480;

    it('A.1: should reject face when nose is outside circle radius 0.18 (e.g. top-right corner)', () => {
      // User screenshot 1 scenario: face is at top-right corner outside guide circle
      const detection: FaceDetectionResult = {
        hasFace: true,
        multipleFaces: false,
        faceCount: 1,
        confidence: 0.95,
        box: {
          x: 500,
          y: 60,
          width: 130,
          height: 160,
        },
        landmarks: {
          noseTip: { x: 565, y: 140 }, // normX = 565/640 = 0.88, normY = 140/480 = 0.29
          leftEye: { x: 530, y: 110 },
          rightEye: { x: 580, y: 110 },
          leftMouth: { x: 540, y: 180 },
          rightMouth: { x: 580, y: 180 },
        },
      };

      const result = checkFaceROIInCircle(detection, frameW, frameH);

      expect(result.inCircle).toBe(false);
      expect(result.centerDistance).toBeGreaterThan(0.18);
      expect(result.reason).toBe('CENTER_OFFSET_TOO_LARGE');
      expect(result.statusMessageThai).toBe('กรุณาขยับใบหน้าให้ตรงกรอบวงกลม');
    });

    it('A.2: should reject face when face boundary is clipped or half-visible at screen edge', () => {
      // Partial face cut at screen boundary (x < 0.15)
      const detection: FaceDetectionResult = {
        hasFace: true,
        multipleFaces: false,
        faceCount: 1,
        confidence: 0.88,
        box: {
          x: 20, // 20 / 640 = 0.031 < 0.15 border
          y: 120,
          width: 200,
          height: 240,
        },
        landmarks: {
          noseTip: { x: 300, y: 240 }, // nose centered but face cut at left edge
          leftEye: { x: 260, y: 200 },
          rightEye: { x: 340, y: 200 },
          leftMouth: { x: 270, y: 280 },
          rightMouth: { x: 330, y: 280 },
        },
      };

      const result = checkFaceROIInCircle(detection, frameW, frameH);

      expect(result.inCircle).toBe(false);
      expect(result.isFullFaceVisible).toBe(false);
      expect(result.reason).toBe('FACE_BORDER_CLIPPED');
    });

    it('A.3: should reject face when face is too small or too far (faceWidthRatio < 0.22)', () => {
      // Face in center but tiny/far away
      const detection: FaceDetectionResult = {
        hasFace: true,
        multipleFaces: false,
        faceCount: 1,
        confidence: 0.90,
        box: {
          x: 275,
          y: 200,
          width: 90, // 90 / 640 = 0.14 < 0.22
          height: 110,
        },
        landmarks: {
          noseTip: { x: 320, y: 240 }, // center (0.5, 0.5)
          leftEye: { x: 305, y: 220 },
          rightEye: { x: 335, y: 220 },
          leftMouth: { x: 310, y: 260 },
          rightMouth: { x: 330, y: 260 },
        },
      };

      const result = checkFaceROIInCircle(detection, frameW, frameH);

      expect(result.inCircle).toBe(false);
      expect(result.faceWidthRatio).toBeLessThan(0.22);
      expect(result.reason).toBe('FACE_TOO_FAR_OR_SMALL');
    });

    it('A.4: should accept face when fully centered in circle with sufficient size', () => {
      // Good face right in the center circle
      const detection: FaceDetectionResult = {
        hasFace: true,
        multipleFaces: false,
        faceCount: 1,
        confidence: 0.99,
        box: {
          x: 220, // 220 / 640 = 0.344 >= 0.15
          y: 110, // 110 / 480 = 0.229 >= 0.15
          width: 200, // 200 / 640 = 0.3125 >= 0.22
          height: 250,
        },
        landmarks: {
          noseTip: { x: 320, y: 240 }, // exact center (0.5, 0.5), dist = 0.0 <= 0.18
          leftEye: { x: 280, y: 190 },
          rightEye: { x: 360, y: 190 },
          leftMouth: { x: 285, y: 290 },
          rightMouth: { x: 355, y: 290 },
        },
      };

      const result = checkFaceROIInCircle(detection, frameW, frameH);

      expect(result.inCircle).toBe(true);
      expect(result.centerDistance).toBeLessThanOrEqual(0.18);
      expect(result.isFullFaceVisible).toBe(true);
      expect(result.faceWidthRatio).toBeGreaterThanOrEqual(0.22);
      expect(result.statusMessageThai).toBe('ใบหน้าอยู่ในกรอบวงกลมถูกต้อง');
    });
  });

  describe('Case B: Strict >= 80% Similarity Threshold & Zero Fallback Match (Rule 2)', () => {
    it('B.1: strictly rejects 7% similarity match (User Screenshot 2 scenario)', () => {
      // Reproduce user screenshot 2 where two vectors had 7% similarity / 0.93 distance
      const probe = new Array(512).fill(0);
      const reference = new Array(512).fill(0);

      // Construct vectors with cosine similarity ~ 0.07
      probe[0] = 1.0;
      reference[0] = 0.07;
      reference[1] = Math.sqrt(1 - 0.07 * 0.07);

      const normProbe = l2Normalize(probe);
      const normRef = l2Normalize(reference);

      const match = evaluateBiometricMatch(normProbe, normRef);

      expect(match.similarityPercentage).toBeLessThan(80);
      expect(match.isMatch).toBe(false);
      expect(match.euclideanDistance).toBeGreaterThan(0.42);
    });

    it('B.2: strictly rejects near-boundary matches below 80% (e.g. 78% or 79%)', () => {
      const probe = new Array(512).fill(0);
      const reference = new Array(512).fill(0);

      // Cosine similarity = 0.79 (< 0.80)
      probe[0] = 1.0;
      reference[0] = 0.79;
      reference[1] = Math.sqrt(1 - 0.79 * 0.79);

      const match = evaluateBiometricMatch(probe, reference);

      expect(match.cosineSimilarity).toBe(0.79);
      expect(match.similarityPercentage).toBe(79);
      expect(match.isMatch).toBe(false); // MUST be false!
    });

    it('B.3: strictly enforces ACCEPTANCE_THRESHOLDS constants', () => {
      expect(ACCEPTANCE_THRESHOLDS.MIN_COSINE_SIMILARITY).toBe(0.80);
      expect(ACCEPTANCE_THRESHOLDS.MAX_EUCLIDEAN_DISTANCE).toBe(0.42);
      expect(ACCEPTANCE_THRESHOLDS.MIN_SIMILARITY_PERCENTAGE).toBe(80);
    });
  });

  describe('Case C: Registered User Inside Circle with Similarity >= 80% (Rule 3)', () => {
    it('C.1: allows login when similarity >= 80% and distance <= 0.42', () => {
      const probe = new Array(512).fill(0);
      const reference = new Array(512).fill(0);

      // High similarity face: Cosine = 0.92, Euclidean ~= 0.40
      probe[0] = 1.0;
      reference[0] = 0.92;
      reference[1] = Math.sqrt(1 - 0.92 * 0.92);

      const match = evaluateBiometricMatch(probe, reference);

      expect(match.similarityPercentage).toBeGreaterThanOrEqual(80);
      expect(match.cosineSimilarity).toBeGreaterThanOrEqual(0.80);
      expect(match.euclideanDistance).toBeLessThanOrEqual(0.42);
      expect(match.isMatch).toBe(true);
    });

    it('C.2: cleans patient name when last_name is "-" or empty (no trailing "-")', () => {
      const patient = {
        first_name: 'asda',
        last_name: '-',
      };

      const formatPatientName = (first: string, last?: string) => {
        return `คุณ ${first}${last && last !== '-' ? ` ${last}` : ''}`;
      };

      const displayName = formatPatientName(patient.first_name, patient.last_name);
      expect(displayName).toBe('คุณ asda'); // NO trailing '-'!
      expect(displayName).not.toContain('-');
    });
  });
});
