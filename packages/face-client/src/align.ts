/**
 * packages/face-client/src/align.ts
 * 5-point landmark similarity transform alignment to 112x112 standard
 * per Master Prompt v3 Section 7.1 (Line 180).
 */

import { FaceLandmarks } from './detect';

export interface AlignmentOptions {
  cropWidth?: number;
  cropHeight?: number;
}

export class FaceAligner {
  private readonly targetWidth: number;
  private readonly targetHeight: number;

  constructor(options: AlignmentOptions = {}) {
    this.targetWidth = options.cropWidth || 112;
    this.targetHeight = options.cropHeight || 112;
  }

  /**
   * Performs 2D similarity transform aligning the eye centers and scaling the face to 112x112
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

    const lx = landmarks.leftEye.x;
    const ly = landmarks.leftEye.y;
    const rx = landmarks.rightEye.x;
    const ry = landmarks.rightEye.y;

    // Eye midpoint
    const eyeCenterX = (lx + rx) / 2;
    const eyeCenterY = (ly + ry) / 2;

    // Angle of eyes relative to horizontal axis
    const dx = rx - lx;
    const dy = ry - ly;
    const angle = Math.atan2(dy, dx);

    // Inter-ocular distance in source
    const currentIod = Math.sqrt(dx * dx + dy * dy);

    // Target eye distance at 112x112 standard (approx 44% of width, ~50px)
    const targetIod = this.targetWidth * 0.44;
    const scale = currentIod > 0 ? targetIod / currentIod : 1.0;

    // Target eye midpoint in 112x112 box (~38% from top)
    const targetCenterX = this.targetWidth / 2;
    const targetCenterY = this.targetHeight * 0.38;

    ctx.save();
    // 1. Move origin to target eye midpoint
    ctx.translate(targetCenterX, targetCenterY);
    // 2. Rotate to align eyes horizontally
    ctx.rotate(-angle);
    // 3. Scale to target IOD
    ctx.scale(scale, scale);
    // 4. Translate back from source eye midpoint
    ctx.translate(-eyeCenterX, -eyeCenterY);

    // Draw source canvas
    ctx.drawImage(sourceCanvas, 0, 0);
    ctx.restore();

    return alignedCanvas;
  }
}
