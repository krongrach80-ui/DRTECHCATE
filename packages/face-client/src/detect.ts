/**
 * packages/face-client/src/detect.ts
 * Face detection abstraction per Master Prompt v3 Section 7.1 & 7.2
 * Enforces single face detection (flags and rejects 0 or >1 face).
 */

export interface Point2D {
  x: number;
  y: number;
}

export interface FaceLandmarks {
  leftEye: Point2D;
  rightEye: Point2D;
  noseTip: Point2D;
  leftMouth: Point2D;
  rightMouth: Point2D;
  allPoints?: Point2D[];
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FaceDetectionResult {
  hasFace: boolean;
  multipleFaces: boolean;
  confidence: number;
  box?: BoundingBox;
  landmarks?: FaceLandmarks;
  faceCount: number;
}

export interface FaceDetector {
  name: string;
  detect(frame: HTMLCanvasElement | ImageData | HTMLVideoElement): Promise<FaceDetectionResult>;
}

