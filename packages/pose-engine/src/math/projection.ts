/**
 * packages/pose-engine/src/math/projection.ts
 *
 * EXACT CANVAS-TO-VIDEO COORDINATE PROJECTION ENGINE
 * High-precision mapping from MediaPipe normalized landmark coordinates [0, 1]
 * to canvas pixels under CSS object-fit: cover (or contain) with mirror support.
 */

export interface NormalizedLandmark {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
  presence?: number;
}

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
  visibility: number;
  inFrame: boolean;
  scale?: number;
  offsetX?: number;
  offsetY?: number;
  isWithinFrame?: boolean;
}

/**
 * Projects a normalized landmark (0..1) relative to the video frame into exact canvas pixel space.
 * Overloaded to support both:
 * 1) (lm, videoEl, canvasEl, isMirrored?, objectFit?)
 * 2) (lm, videoWidth, videoHeight, canvasWidth, canvasHeight, isMirrored?, objectFit?)
 */
export function projectLandmarkToCanvas(
  lm: NormalizedLandmark,
  videoEl: HTMLVideoElement,
  canvasEl: HTMLCanvasElement,
  isMirrored?: boolean,
  objectFit?: 'cover' | 'contain'
): ProjectedPoint;
export function projectLandmarkToCanvas(
  lm: NormalizedLandmark,
  videoWidth: number,
  videoHeight: number,
  canvasWidth: number,
  canvasHeight: number,
  isMirrored?: boolean,
  objectFit?: 'cover' | 'contain'
): ProjectedPoint;
export function projectLandmarkToCanvas(
  lm: NormalizedLandmark,
  arg1: HTMLVideoElement | number,
  arg2: HTMLCanvasElement | number,
  arg3?: boolean | number,
  arg4?: 'cover' | 'contain' | number,
  arg5?: boolean,
  arg6?: 'cover' | 'contain'
): ProjectedPoint {
  let vw: number;
  let vh: number;
  let cw: number;
  let ch: number;
  let isMirrored: boolean;
  let objectFit: 'cover' | 'contain';

  if (typeof arg1 === 'number') {
    vw = arg1;
    vh = arg2 as number;
    cw = arg3 as number;
    ch = arg4 as number;
    isMirrored = typeof arg5 === 'boolean' ? arg5 : false;
    objectFit = (arg6 as 'cover' | 'contain') || 'cover';
  } else {
    const videoEl = arg1 as HTMLVideoElement;
    const canvasEl = arg2 as HTMLCanvasElement;
    cw = canvasEl.width;
    ch = canvasEl.height;
    vw = videoEl.videoWidth || cw || 1280;
    vh = videoEl.videoHeight || ch || 720;
    isMirrored = typeof arg3 === 'boolean' ? arg3 : true;
    objectFit = (arg4 as 'cover' | 'contain') || 'cover';
  }

  const vis = lm.visibility ?? 1.0;

  if (cw <= 0 || ch <= 0 || vw <= 0 || vh <= 0) {
    return {
      x: 0,
      y: 0,
      visibility: vis,
      inFrame: false,
      isWithinFrame: false,
      scale: 1,
      offsetX: 0,
      offsetY: 0,
    };
  }

  const normX = isMirrored ? 1.0 - lm.x : lm.x;
  const normY = lm.y;

  const scale =
    objectFit === 'cover'
      ? Math.max(cw / vw, ch / vh)
      : Math.min(cw / vw, ch / vh);

  const scaledW = vw * scale;
  const scaledH = vh * scale;
  const offsetX = (cw - scaledW) / 2;
  const offsetY = (ch - scaledH) / 2;

  const x = normX * scaledW + offsetX;
  const y = normY * scaledH + offsetY;
  const inFrame =
    lm.x >= 0.01 &&
    lm.x <= 0.99 &&
    lm.y >= 0.01 &&
    lm.y <= 0.99 &&
    x >= 0 &&
    x <= cw &&
    y >= 0 &&
    y <= ch;

  return {
    x,
    y,
    visibility: vis,
    inFrame,
    isWithinFrame: inFrame,
    scale,
    offsetX,
    offsetY,
  };
}
