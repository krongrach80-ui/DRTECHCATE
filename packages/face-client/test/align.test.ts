import { describe, it, expect } from 'vitest';
import {
  computeSimilarityTransform,
  ARCFACE_REF_PTS,
  FaceAligner,
} from '../src/align';
import { FaceLandmarks } from '../src/detect';

describe('[FACE-CLIENT] align.ts - 5-Point Umeyama Similarity Transform', () => {
  it('1. should return identity transform when source points match reference points exactly', () => {
    const matrix = computeSimilarityTransform(ARCFACE_REF_PTS, ARCFACE_REF_PTS);

    expect(matrix.scale).toBeCloseTo(1.0, 4);
    expect(matrix.rotationRad).toBeCloseTo(0.0, 4);
    expect(matrix.a).toBeCloseTo(1.0, 4);
    expect(matrix.b).toBeCloseTo(0.0, 4);
    expect(matrix.c).toBeCloseTo(0.0, 4);
    expect(matrix.d).toBeCloseTo(1.0, 4);
    expect(matrix.tx).toBeCloseTo(0.0, 4);
    expect(matrix.ty).toBeCloseTo(0.0, 4);
  });

  it('2. should accurately estimate pure translation', () => {
    const shiftX = 15;
    const shiftY = -25;
    const translatedPts: [number, number][] = ARCFACE_REF_PTS.map(([x, y]) => [
      x + shiftX,
      y + shiftY,
    ]);

    // Map translatedPts -> ARCFACE_REF_PTS
    const matrix = computeSimilarityTransform(translatedPts, ARCFACE_REF_PTS);

    expect(matrix.scale).toBeCloseTo(1.0, 4);
    expect(matrix.rotationRad).toBeCloseTo(0.0, 4);
    expect(matrix.tx).toBeCloseTo(-shiftX, 4);
    expect(matrix.ty).toBeCloseTo(-shiftY, 4);
  });

  it('3. should accurately estimate scale and rotation (Umeyama Least-Squares)', () => {
    const scaleFactor = 2.0;
    const theta = Math.PI / 6; // 30 degrees
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);

    // Transform reference points by scale and rotation
    const transformedPts: [number, number][] = ARCFACE_REF_PTS.map(([x, y]) => [
      scaleFactor * (x * cosT - y * sinT) + 50,
      scaleFactor * (x * sinT + y * cosT) + 30,
    ]);

    // Matrix to map transformedPts back to ARCFACE_REF_PTS
    const matrix = computeSimilarityTransform(transformedPts, ARCFACE_REF_PTS);

    // Expected inverse scale = 0.5, inverse rotation = -30 deg
    expect(matrix.scale).toBeCloseTo(1 / scaleFactor, 3);
    expect(matrix.rotationRad).toBeCloseTo(-theta, 3);

    // Verify transforming the transformed points lands on reference points
    for (let i = 0; i < ARCFACE_REF_PTS.length; i++) {
      const [sx, sy] = transformedPts[i];
      const ux = matrix.a * sx + matrix.c * sy + matrix.tx;
      const uy = matrix.b * sx + matrix.d * sy + matrix.ty;
      expect(ux).toBeCloseTo(ARCFACE_REF_PTS[i][0], 2);
      expect(uy).toBeCloseTo(ARCFACE_REF_PTS[i][1], 2);
    }
  });

  it('4. should gracefully fallback if source variance is zero', () => {
    const zeroVarPts: [number, number][] = [
      [50, 50],
      [50, 50],
      [50, 50],
      [50, 50],
      [50, 50],
    ];

    const matrix = computeSimilarityTransform(zeroVarPts, ARCFACE_REF_PTS);
    expect(matrix.scale).toBe(1);
    expect(matrix.rotationRad).toBe(0);
  });

  it('5. FaceAligner should configure target width and height and call canvas transform', () => {
    const aligner = new FaceAligner({ cropWidth: 112, cropHeight: 112 });
    expect(aligner).toBeDefined();

    // Mock Canvas
    const mockCtx = {
      save: () => {},
      restore: () => {},
      clearRect: () => {},
      setTransform: () => {},
      drawImage: () => {},
    };

    const mockSourceCanvas = {
      width: 640,
      height: 480,
      getContext: () => mockCtx,
    } as unknown as HTMLCanvasElement;

    const landmarks: FaceLandmarks = {
      leftEye: { x: ARCFACE_REF_PTS[0][0], y: ARCFACE_REF_PTS[0][1] },
      rightEye: { x: ARCFACE_REF_PTS[1][0], y: ARCFACE_REF_PTS[1][1] },
      noseTip: { x: ARCFACE_REF_PTS[2][0], y: ARCFACE_REF_PTS[2][1] },
      leftMouth: { x: ARCFACE_REF_PTS[3][0], y: ARCFACE_REF_PTS[3][1] },
      rightMouth: { x: ARCFACE_REF_PTS[4][0], y: ARCFACE_REF_PTS[4][1] },
    };

    const aligned = aligner.align(mockSourceCanvas, landmarks);
    expect(aligned.width).toBe(112);
    expect(aligned.height).toBe(112);
  });
});
