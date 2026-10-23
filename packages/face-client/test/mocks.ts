/**
 * packages/face-client/test/mocks.ts
 * Test Mocks for Face Detection, Embedding, and PAD
 * STRICT COMPLIANCE: Moved to test folder only; NEVER exported in production index.ts bundle.
 */

import { FaceDetector, FaceDetectionResult } from '../src/detect';
import { EmbeddingModel, generateSyntheticVector } from '../src/embed';
import { PadProvider, PadResult } from '../src/liveness';

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

/**
 * Mock Embedding Model for testing & development
 */
export class MockEmbeddingModel implements EmbeddingModel {
  name = 'mock-adaface-ir50';
  version = 'adaface-ir50-v1';
  dim = 512;

  constructor(private seed: number | string = 1) {}

  public setSeed(seed: number | string): void {
    this.seed = seed;
  }

  public async embed(_alignedFace: unknown): Promise<number[]> {
    return generateSyntheticVector(this.seed, this.dim);
  }
}

/**
 * Mock PAD Provider for testing
 */
export class MockPadProvider implements PadProvider {
  name = 'mock-pad-provider';
  mode = 'active_plus_passive' as const;

  constructor(
    private defaultResult: boolean = true,
    private defaultScore: number = 0.95
  ) {}

  public setResult(isLive: boolean, score: number = 0.95): void {
    this.defaultResult = isLive;
    this.defaultScore = score;
  }

  public async checkLiveness(_frame: unknown): Promise<PadResult> {
    return {
      isLive: this.defaultResult,
      score: this.defaultScore,
    };
  }
}
