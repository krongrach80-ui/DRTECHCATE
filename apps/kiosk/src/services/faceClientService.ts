/**
 * apps/kiosk/src/services/faceClientService.ts
 * Browser-side Face Client & Biometrics Service Factory
 * Conforms to Master Prompt v3 Spec 7.1, 7.3, 7.4, 12
 */

import {
  CameraManager,
  FaceDetector,
  MediaPipeFaceDetector,
  FaceAligner,
  FaceQualityChecker,
  EmbeddingModel,
  getSharedEmbeddingModel,
  FaceDetectionResult,
} from '../../../../packages/face-client/src/index.js';
import {
  KioskInputManager,
  DEFAULT_KIOSK_INPUT_CONFIG,
  KioskInputConfig,
} from '../../../../packages/kiosk-input/src/index.js';

export interface FaceClientServices {
  camera: CameraManager;
  detector: FaceDetector;
  aligner: FaceAligner;
  qualityChecker: FaceQualityChecker;
  embeddingModel: EmbeddingModel;
  inputManager: KioskInputManager;
}

/**
 * Fallback Lightweight Face Detector for test or simulation environments
 * where WebAssembly or MediaPipe task models are not loaded in browser memory.
 */
export class FallbackFaceDetector implements FaceDetector {
  public readonly name = 'fallback-face-detector';
  private pose: { yaw: number; pitch: number; roll: number } = { yaw: 0, pitch: 0, roll: 0 };

  public setPose(yaw: number, pitch: number, roll: number): void {
    this.pose = { yaw, pitch, roll };
  }

  public async detect(
    frame: HTMLCanvasElement | ImageData | HTMLVideoElement
  ): Promise<FaceDetectionResult> {
    const width = 'videoWidth' in frame ? frame.videoWidth || 640 : frame.width || 640;
    const height = 'videoHeight' in frame ? frame.videoHeight || 480 : frame.height || 480;

    const cx = width / 2;
    const cy = height / 2;

    return {
      hasFace: true,
      multipleFaces: false,
      faceCount: 1,
      confidence: 0.98,
      box: {
        x: cx - 100,
        y: cy - 120,
        width: 200,
        height: 240,
      },
      landmarks: {
        leftEye: { x: cx - 40, y: cy - 30 },
        rightEye: { x: cx + 40, y: cy - 30 },
        noseTip: { x: cx, y: cy + 10 },
        leftMouth: { x: cx - 30, y: cy + 50 },
        rightMouth: { x: cx + 30, y: cy + 50 },
      },
      pose: { ...this.pose },
      eyes: {
        leftEyeOpen: 1.0,
        rightEyeOpen: 1.0,
      },
    };
  }
}

/**
 * Fallback Embedding Model for test environments
 */
export class FallbackEmbeddingModel implements EmbeddingModel {
  public readonly name = 'fallback-embedding-model';
  public readonly version = 'sim-512';
  public readonly dim = 512;
  private seed: number;

  constructor(seed: number = 42) {
    this.seed = seed;
  }

  public async embed(_alignedFace: HTMLCanvasElement | ImageData): Promise<number[]> {
    const vec = new Array(512);
    let sumSq = 0;
    for (let i = 0; i < 512; i++) {
      const val = Math.sin(this.seed * (i + 1));
      vec[i] = val;
      sumSq += val * val;
    }
    const norm = Math.sqrt(sumSq) || 1.0;
    return vec.map((v) => v / norm);
  }
}

let sharedServices: FaceClientServices | null = null;

export function getFaceClientServices(
  configOverrides?: {
    customDetector?: FaceDetector;
    customEmbeddingModel?: EmbeddingModel;
    inputConfig?: Partial<KioskInputConfig>;
  }
): FaceClientServices {
  if (configOverrides?.customDetector || configOverrides?.customEmbeddingModel) {
    return createFreshServices(configOverrides);
  }

  if (!sharedServices) {
    sharedServices = createFreshServices(configOverrides);
  }
  return sharedServices;
}

function createFreshServices(
  overrides?: {
    customDetector?: FaceDetector;
    customEmbeddingModel?: EmbeddingModel;
    inputConfig?: Partial<KioskInputConfig>;
  }
): FaceClientServices {
  const camera = new CameraManager({
    mirror: true,
    rotation: 0,
  });

  // Use real MediaPipe Face Detector by default; allow mock in tests
  const detector =
    overrides?.customDetector ||
    new MediaPipeFaceDetector({
      wasmPath: '/models/wasm',
      modelAssetPath: '/models/face_landmarker.task',
    });

  const aligner = new FaceAligner();

  const qualityChecker = new FaceQualityChecker({
    minIod: 25,
    minBrightness: 20,
    maxBrightness: 245,
    minSharpness: 15,
    stabilityMs: 250,
  });

  const embeddingModel =
    overrides?.customEmbeddingModel || getSharedEmbeddingModel();

  const inputManager = new KioskInputManager({
    ...DEFAULT_KIOSK_INPUT_CONFIG,
    ...overrides?.inputConfig,
  });

  return {
    camera,
    detector,
    aligner,
    qualityChecker,
    embeddingModel,
    inputManager,
  };
}

export function resetFaceClientServices(): void {
  if (sharedServices) {
    sharedServices.camera.stop();
    sharedServices.inputManager.resetAll();
    sharedServices = null;
  }
}
