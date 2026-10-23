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

/**
 * Mock Face Detector for testing, unit tests, and CI
 */
export class MockFaceDetector implements FaceDetector {
  name = 'mock-face-detector';

  constructor(
    private defaultConfidence: number = 0.98,
    private defaultCount: number = 1
  ) {}

  public setCount(count: number): void {
    this.defaultCount = count;
  }

  public setConfidence(conf: number): void {
    this.defaultConfidence = conf;
  }

  public async detect(_frame: HTMLCanvasElement | ImageData | HTMLVideoElement): Promise<FaceDetectionResult> {
    if (this.defaultCount === 0) {
      return {
        hasFace: false,
        multipleFaces: false,
        confidence: 0,
        faceCount: 0,
      };
    }

    if (this.defaultCount > 1) {
      return {
        hasFace: true,
        multipleFaces: true,
        confidence: this.defaultConfidence,
        faceCount: this.defaultCount,
      };
    }

    return {
      hasFace: true,
      multipleFaces: false,
      confidence: this.defaultConfidence,
      faceCount: 1,
      box: { x: 100, y: 100, width: 200, height: 240 },
      landmarks: {
        leftEye: { x: 150, y: 180 },
        rightEye: { x: 250, y: 180 },
        noseTip: { x: 200, y: 220 },
        leftMouth: { x: 160, y: 280 },
        rightMouth: { x: 240, y: 280 },
      },
    };
  }
}
