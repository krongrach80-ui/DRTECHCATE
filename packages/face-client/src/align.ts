/**
 * packages/face-client/src/align.ts
 * 5-point landmark similarity transform alignment to 112x112 standard
 * per Master Prompt v3 Section 7.1.1 (Line 180).
 * Implements Umeyama / Least-Squares 2D Similarity Transform to ArcFace reference coordinates:
 * [[38.2946, 51.6963], [73.5318, 51.5014], [56.0252, 71.7366], [41.5493, 92.3655], [70.7299, 92.2041]]
 */

import { FaceLandmarks } from './detect';

/**
 * Standard ArcFace/AdaFace 112x112 reference coordinates for 5 landmarks:
 * [leftEye, rightEye, noseTip, leftMouth, rightMouth]
 */
export const ARCFACE_REF_PTS: [number, number][] = [
  [38.2946, 51.6963], // Left Eye
  [73.5318, 51.5014], // Right Eye
  [56.0252, 71.7366], // Nose Tip
  [41.5493, 92.3655], // Left Mouth
  [70.7299, 92.2041], // Right Mouth
];

export interface TransformMatrix {
  a: number;
  b: number;
  c: number;
  d: number;
  tx: number;
  ty: number;
  scale: number;
  rotationRad: number;
}

/**
 * Computes the optimal 2D Similarity Transform (Umeyama / Least-Squares)
 * mapping source points (src) to target points (dst).
 */
export function computeSimilarityTransform(
  srcPts: [number, number][],
  dstPts: [number, number][] = ARCFACE_REF_PTS
): TransformMatrix {
  const n = srcPts.length;
  if (n !== dstPts.length || n < 2) {
    throw new Error('computeSimilarityTransform requires identical number of points (>= 2)');
  }

  // 1. Calculate centroids
  let srcMeanX = 0;
  let srcMeanY = 0;
  let dstMeanX = 0;
  let dstMeanY = 0;

  for (let i = 0; i < n; i++) {
    srcMeanX += srcPts[i][0];
    srcMeanY += srcPts[i][1];
    dstMeanX += dstPts[i][0];
    dstMeanY += dstPts[i][1];
  }

  srcMeanX /= n;
  srcMeanY /= n;
  dstMeanX /= n;
  dstMeanY /= n;

  // 2. Compute variance and cross-covariances
  let srcVar = 0;
  let cxx = 0;
  let cxy = 0;

  for (let i = 0; i < n; i++) {
    const sx = srcPts[i][0] - srcMeanX;
    const sy = srcPts[i][1] - srcMeanY;
    const dx = dstPts[i][0] - dstMeanX;
    const dy = dstPts[i][1] - dstMeanY;

    srcVar += sx * sx + sy * sy;
    cxx += sx * dx + sy * dy;
    cxy += sx * dy - sy * dx;
  }

  srcVar /= n;
  cxx /= n;
  cxy /= n;

  if (srcVar <= 1e-6) {
    return {
      a: 1,
      b: 0,
      c: 0,
      d: 1,
      tx: dstMeanX - srcMeanX,
      ty: dstMeanY - srcMeanY,
      scale: 1,
      rotationRad: 0,
    };
  }

  const a = cxx / srcVar;
  const b = cxy / srcVar;
  const c = -b;
  const d = a;

  const tx = dstMeanX - (a * srcMeanX + c * srcMeanY);
  const ty = dstMeanY - (b * srcMeanX + d * srcMeanY);

  const scale = Math.sqrt(a * a + b * b);
  const rotationRad = Math.atan2(b, a);

  return { a, b, c, d, tx, ty, scale, rotationRad };
}

export interface AlignmentOptions {
  cropWidth?: number;
  cropHeight?: number;
  targetLandmarks?: [number, number][];
}

export class FaceAligner {
  private readonly targetWidth: number;
  private readonly targetHeight: number;
  private readonly refPoints: [number, number][];

  constructor(options: AlignmentOptions = {}) {
    this.targetWidth = options.cropWidth || 112;
    this.targetHeight = options.cropHeight || 112;
    this.refPoints = options.targetLandmarks || ARCFACE_REF_PTS;
  }

  /**
   * Performs 5-Point Umeyama Similarity Transform to 112x112 ArcFace standard.
   */
  public align(
    sourceCanvas: HTMLCanvasElement,
    landmarks: FaceLandmarks
  ): HTMLCanvasElement {
    const alignedCanvas =
      typeof document !== 'undefined'
        ? document.createElement('canvas')
        : ({} as HTMLCanvasElement);

    alignedCanvas.width = this.targetWidth;
    alignedCanvas.height = this.targetHeight;

    if (!alignedCanvas.getContext) {
      return alignedCanvas;
    }

    const ctx = alignedCanvas.getContext('2d');
    if (!ctx) return alignedCanvas;

    // 5 Source Points: [leftEye, rightEye, noseTip, leftMouth, rightMouth]
    const srcPts: [number, number][] = [
      [landmarks.leftEye.x, landmarks.leftEye.y],
      [landmarks.rightEye.x, landmarks.rightEye.y],
      [landmarks.noseTip.x, landmarks.noseTip.y],
      [landmarks.leftMouth.x, landmarks.leftMouth.y],
      [landmarks.rightMouth.x, landmarks.rightMouth.y],
    ];

    // Compute Umeyama least-squares similarity transform matrix
    const matrix = computeSimilarityTransform(srcPts, this.refPoints);

    ctx.save();
    // Clear canvas
    ctx.clearRect(0, 0, this.targetWidth, this.targetHeight);

    // Apply affine transform matrix: [a, b, c, d, tx, ty]
    ctx.setTransform(matrix.a, matrix.b, matrix.c, matrix.d, matrix.tx, matrix.ty);

    // Draw source canvas with transform applied
    ctx.drawImage(sourceCanvas, 0, 0);
    ctx.restore();

    return alignedCanvas;
  }
}
