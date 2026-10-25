/**
 * packages/face-client/test/mocks.ts
 * Test Mocks for Face Detection, Embedding, and PAD
 * STRICT COMPLIANCE: Moved to test folder only; NEVER exported in production index.ts bundle.
 */

import { FaceDetector, FaceDetectionResult, HeadPose, EyeOpenness } from '../src/detect';
import { EmbeddingModel, l2Normalize } from '../src/embed';
import { PadProvider, PadResult } from '../src/liveness';
import { RequiredPose } from '../src/quality';

/**
 * Generates a synthetic 512-dim unit vector from a seed number or string
 * STRICTLY TEST UTILITY ONLY.
 */
export function generateSyntheticVector(seed: number | string, dim: number = 512): number[] {
  const seedNum =
    typeof seed === 'number'
      ? seed
      : seed.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const raw: number[] = [];
  for (let i = 0; i < dim; i++) {
    const val = Math.sin(seedNum * 997 + i * 1337);
    raw.push(val);
  }
  return l2Normalize(raw);
}

/**
 * Mock Face Detector for unit tests and CI
 */
export class MockFaceDetector implements FaceDetector {
  public name = 'mock-face-detector';
  public defaultConfidence: number = 0.98;
  public defaultCount: number = 1;
  public defaultPose: HeadPose = { yaw: 0, pitch: 0, roll: 0 };
  public defaultEyes: EyeOpenness = { leftEyeOpen: 1.0, rightEyeOpen: 1.0 };

  constructor(confidence: number = 0.98, count: number = 1) {
    this.defaultConfidence = confidence;
    this.defaultCount = count;
  }

  public setCount(count: number): void {
    this.defaultCount = count;
  }

  public setConfidence(conf: number): void {
    this.defaultConfidence = conf;
  }

  public setPose(pose: HeadPose): void {
    this.defaultPose = pose;
  }

  public setPoseByKeyword(poseKeyword: RequiredPose): void {
    switch (poseKeyword) {
      case 'front':
        this.defaultPose = { yaw: 0, pitch: 0, roll: 0 };
        break;
      case 'left':
        this.defaultPose = { yaw: -20, pitch: 0, roll: 0 };
        break;
      case 'right':
        this.defaultPose = { yaw: 20, pitch: 0, roll: 0 };
        break;
      case 'nod':
        this.defaultPose = { yaw: 0, pitch: -16, roll: 0 };
        break;
    }
  }

  public setEyes(eyes: EyeOpenness): void {
    this.defaultEyes = eyes;
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
        hasFace: false,
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
      box: { x: 50, y: 50, width: 200, height: 240 },
      landmarks: {
        leftEye: { x: 100, y: 120 },
        rightEye: { x: 180, y: 120 },
        noseTip: { x: 140, y: 160 },
        leftMouth: { x: 110, y: 200 },
        rightMouth: { x: 170, y: 200 },
      },
      pose: { ...this.defaultPose },
      eyes: { ...this.defaultEyes },
    };
  }
}

/**
 * Mock Embedding Model for testing
 */
export class MockEmbeddingModel implements EmbeddingModel {
  public name = 'mock-arcface-onnx';
  public version = 'mock-v1';
  public dim = 512;

  constructor(private seed: number | string = 1) {}

  public setSeed(seed: number | string): void {
    this.seed = seed;
  }

  public async embed(_alignedFace: HTMLCanvasElement | ImageData): Promise<number[]> {
    return generateSyntheticVector(this.seed, this.dim);
  }
}

/**
 * Mock PAD Provider for testing
 */
export class MockPadProvider implements PadProvider {
  public name = 'mock-pad-provider';
  public mode = 'active_plus_passive' as const;

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
