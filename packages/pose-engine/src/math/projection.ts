/**
 * packages/pose-engine/src/math/projection.ts
 *
 * EXACT CANVAS-TO-VIDEO COORDINATE PROJECTION ENGINE
 * High-precision mapping from MediaPipe normalized landmark coordinates [0, 1]
 * to canvas pixels under CSS object-fit: cover (or contain) with mirror support.
 */

export interface ProjectionDimensions {
  videoWidth: number;
  videoHeight: number;
  canvasWidth: number;
  canvasHeight: number;
  objectFit?: 'cover' | 'contain';
  isMirrored?: boolean;
}

export interface ProjectedPoint {
  x: number;
  y: number;
  scale: number;
  offsetX: number;
  offsetY: number;
  isWithinFrame: boolean;
}

/**
 * Projects a normalized landmark (lm.x, lm.y in [0, 1]) relative to the video frame
 * into exact canvas pixel space accounting for object-fit scaling and cropping offsets.
 */
export function projectLandmarkToCanvas(
  lm: { x: number; y: number },
  videoWidth: number,
  videoHeight: number,
  canvasWidth: number,
  canvasHeight: number,
  isMirrored: boolean = false,
  objectFit: 'cover' | 'contain' = 'cover'
): ProjectedPoint {
  if (!videoWidth || !videoHeight || !canvasWidth || !canvasHeight) {
    const defaultX = (isMirrored ? 1 - lm.x : lm.x) * canvasWidth;
    const defaultY = lm.y * canvasHeight;
    const isWithinFrame = defaultX >= 0 && defaultX <= canvasWidth && defaultY >= 0 && defaultY <= canvasHeight;
    return {
      x: defaultX,
      y: defaultY,
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      isWithinFrame,
    };
  }

  // Exact scale calculation based on object-fit
  const scale =
    objectFit === 'cover'
      ? Math.max(canvasWidth / videoWidth, canvasHeight / videoHeight)
      : Math.min(canvasWidth / videoWidth, canvasHeight / videoHeight);

  const scaledWidth = videoWidth * scale;
  const scaledHeight = videoHeight * scale;

  // Cropping / centering offsets in canvas pixels
  const offsetX = (canvasWidth - scaledWidth) / 2;
  const offsetY = (canvasHeight - scaledHeight) / 2;

  // Horizontal coordinate with mirror compensation
  const normX = isMirrored ? 1.0 - lm.x : lm.x;
  const x = normX * scaledWidth + offsetX;
  const y = lm.y * scaledHeight + offsetY;
  const isWithinFrame = x >= 0 && x <= canvasWidth && y >= 0 && y <= canvasHeight;

  return {
    x,
    y,
    scale,
    offsetX,
    offsetY,
    isWithinFrame,
  };
}
