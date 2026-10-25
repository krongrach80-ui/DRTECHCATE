/**
 * packages/face-client/src/detect.ts
 * Face detection & landmark extraction per Master Prompt v3 Section 7.1 & 7.7.2
 * Uses MediaPipe FaceLandmarker with blendshapes & transformation matrices.
 * Invariant:
 * - Loads wasm and model files from local path (/models/...) only (Spec 7.1 Line 178)
 * - Returns faceCount, bounding box, 5 key landmarks, head pose (yaw/pitch/roll), and eye openness.
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

export interface HeadPose {
  yaw: number; // degrees: negative = turning left, positive = turning right
  pitch: number; // degrees: negative = tilting down, positive = tilting up
  roll: number; // degrees: head tilt side to side
}

export interface EyeOpenness {
  leftEyeOpen: number; // 0.0 (closed) to 1.0 (fully open)
  rightEyeOpen: number; // 0.0 (closed) to 1.0 (fully open)
}

export interface FaceDetectionResult {
  hasFace: boolean;
  multipleFaces: boolean;
  faceCount: number;
  confidence: number;
  box?: BoundingBox;
  landmarks?: FaceLandmarks;
  pose?: HeadPose;
  eyes?: EyeOpenness;
}

export interface FaceDetector {
  name: string;
  detect(frame: HTMLCanvasElement | ImageData | HTMLVideoElement): Promise<FaceDetectionResult>;
  close?(): Promise<void>;
}

export interface MediaPipeConfig {
  wasmPath?: string;
  modelAssetPath?: string;
  minDetectionConfidence?: number;
  minPresenceConfidence?: number;
  minTrackingConfidence?: number;
}

/**
 * Helper to compute Euler angles (yaw, pitch, roll) in degrees from
 * MediaPipe's 4x4 facial transformation matrix (column-major).
 */
export function extractEulerAnglesFromMatrix(m: number[] | Float32Array): HeadPose {
  if (!m || m.length < 16) {
    return { yaw: 0, pitch: 0, roll: 0 };
  }

  // Column-major 4x4 matrix from MediaPipe OpenGL conventions:
  // [m0,  m4,  m8,  m12]
  // [m1,  m5,  m9,  m13]
  // [m2,  m6,  m10, m14]
  // [m3,  m7,  m11, m15]
  const r00 = m[0];
  const r10 = m[1];
  const _r01 = m[4];
  const r11 = m[5];
  const r02 = m[8];
  const r12 = m[9];
  const r22 = m[10];

  const radToDeg = 180 / Math.PI;

  // Yaw: rotation around Y-axis (left/right)
  const yaw = Math.atan2(r02, r22) * radToDeg;

  // Pitch: rotation around X-axis (up/down)
  // Clamp for asin safety
  const sinPitch = Math.max(-1, Math.min(1, -r12));
  const pitch = Math.asin(sinPitch) * radToDeg;

  // Roll: rotation around Z-axis (tilt)
  const roll = Math.atan2(r10, r00 || r11) * radToDeg;

  return {
    yaw: Number(yaw.toFixed(2)),
    pitch: Number(pitch.toFixed(2)),
    roll: Number(roll.toFixed(2)),
  };
}

/**
 * Fallback Euler angle calculation from 3D landmarks when matrix is absent
 */
export function extractEulerAnglesFromLandmarks(
  landmarks: Array<{ x: number; y: number; z?: number }>
): HeadPose {
  if (!landmarks || landmarks.length < 300) {
    return { yaw: 0, pitch: 0, roll: 0 };
  }

  const leftEye = landmarks[33] || landmarks[468];
  const rightEye = landmarks[263] || landmarks[473];
  const nose = landmarks[1];
  const mouthLeft = landmarks[61];
  const mouthRight = landmarks[291];

  const eyeMidX = (leftEye.x + rightEye.x) / 2;
  const eyeMidY = (leftEye.y + rightEye.y) / 2;
  const mouthMidY = (mouthLeft.y + mouthRight.y) / 2;

  const iod = Math.sqrt(
    Math.pow(rightEye.x - leftEye.x, 2) + Math.pow(rightEye.y - leftEye.y, 2)
  );

  const radToDeg = 180 / Math.PI;

  // Roll: angle between eyes
  const roll = Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x) * radToDeg;

  // Yaw: horizontal deviation of nose from eye midpoint relative to IOD
  const yaw = iod > 0 ? ((nose.x - eyeMidX) / iod) * 75 : 0;

  // Pitch: vertical position of nose relative to eye/mouth vertical distance
  const faceHeight = mouthMidY - eyeMidY;
  const pitch = faceHeight > 0 ? (((eyeMidY + mouthMidY) / 2 - nose.y) / faceHeight) * 60 : 0;

  return {
    yaw: Number(yaw.toFixed(2)),
    pitch: Number(pitch.toFixed(2)),
    roll: Number(roll.toFixed(2)),
  };
}

/**
 * MediaPipe Face Landmarker Implementation
 * Connects to local /models/ wasm and task file (Spec 7.1.5)
 */
export class MediaPipeFaceDetector implements FaceDetector {
  public readonly name = 'mediapipe-face-landmarker';
  private landmarker: any = null;
  private initPromise: Promise<void> | null = null;
  private wasmPath: string;
  private modelAssetPath: string;

  constructor(config: MediaPipeConfig = {}) {
    this.wasmPath = config.wasmPath || '/models/wasm';
    this.modelAssetPath = config.modelAssetPath || '/models/face_landmarker.task';
  }

  public async initialize(): Promise<void> {
    if (this.landmarker) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      // Dynamic import to prevent SSR/Node test failures
      const vision = await import('@mediapipe/tasks-vision');
      const { FaceLandmarker, FilesetResolver } = vision;

      const fileset = await FilesetResolver.forVisionTasks(this.wasmPath);
      this.landmarker = await FaceLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: this.modelAssetPath,
          delegate: 'GPU',
        },
        runningMode: 'IMAGE',
        numFaces: 2,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
      });
    })();

    return this.initPromise;
  }

  public async detect(
    frame: HTMLCanvasElement | ImageData | HTMLVideoElement
  ): Promise<FaceDetectionResult> {
    await this.initialize();
    if (!this.landmarker) {
      throw new Error('MediaPipe FaceLandmarker failed to initialize');
    }

    const results = this.landmarker.detect(frame as any);
    const faces = results.faceLandmarks || [];
    const faceCount = faces.length;

    if (faceCount === 0) {
      return {
        hasFace: false,
        multipleFaces: false,
        faceCount: 0,
        confidence: 0,
      };
    }

    if (faceCount > 1) {
      return {
        hasFace: false,
        multipleFaces: true,
        faceCount,
        confidence: 0,
      };
    }

    // Single face detected
    const landmarksRaw = faces[0];
    const width = 'videoWidth' in frame ? frame.videoWidth : frame.width;
    const height = 'videoHeight' in frame ? frame.videoHeight : frame.height;

    // 5 Key Landmarks (converted to absolute pixel coordinates)
    // Left eye: 468 (iris center) or 33/133 midpoint
    const leftEyeRaw = landmarksRaw[468] || {
      x: (landmarksRaw[33].x + landmarksRaw[133].x) / 2,
      y: (landmarksRaw[33].y + landmarksRaw[133].y) / 2,
    };
    // Right eye: 473 (iris center) or 362/263 midpoint
    const rightEyeRaw = landmarksRaw[473] || {
      x: (landmarksRaw[362].x + landmarksRaw[263].x) / 2,
      y: (landmarksRaw[362].y + landmarksRaw[263].y) / 2,
    };
    // Nose tip: 1
    const noseRaw = landmarksRaw[1];
    // Mouth corners: 61 (left) and 291 (right)
    const mouthLeftRaw = landmarksRaw[61];
    const mouthRightRaw = landmarksRaw[291];

    const landmarks: FaceLandmarks = {
      leftEye: { x: leftEyeRaw.x * width, y: leftEyeRaw.y * height },
      rightEye: { x: rightEyeRaw.x * width, y: rightEyeRaw.y * height },
      noseTip: { x: noseRaw.x * width, y: noseRaw.y * height },
      leftMouth: { x: mouthLeftRaw.x * width, y: mouthLeftRaw.y * height },
      rightMouth: { x: mouthRightRaw.x * width, y: mouthRightRaw.y * height },
    };

    // Calculate Bounding Box
    let minX = 1;
    let minY = 1;
    let maxX = 0;
    let maxY = 0;

    for (const pt of landmarksRaw) {
      if (pt.x < minX) minX = pt.x;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.y > maxY) maxY = pt.y;
    }

    const box: BoundingBox = {
      x: Math.max(0, minX * width),
      y: Math.max(0, minY * height),
      width: Math.min(width, (maxX - minX) * width),
      height: Math.min(height, (maxY - minY) * height),
    };

    // Extract Head Pose (yaw, pitch, roll) from facialTransformationMatrixes
    let pose: HeadPose;
    const matrices = results.facialTransformationMatrixes;
    if (matrices && matrices.length > 0 && matrices[0].data) {
      pose = extractEulerAnglesFromMatrix(matrices[0].data);
    } else {
      pose = extractEulerAnglesFromLandmarks(landmarksRaw);
    }

    // Extract Eye Openness from blendshapes (1.0 - eyeBlink)
    let leftEyeOpen = 1.0;
    let rightEyeOpen = 1.0;
    const blendshapes = results.faceBlendshapes;
    if (blendshapes && blendshapes.length > 0 && blendshapes[0].categories) {
      const cats = blendshapes[0].categories;
      for (const cat of cats) {
        if (cat.categoryName === 'eyeBlinkLeft') {
          leftEyeOpen = Math.max(0, Math.min(1, 1.0 - cat.score));
        } else if (cat.categoryName === 'eyeBlinkRight') {
          rightEyeOpen = Math.max(0, Math.min(1, 1.0 - cat.score));
        }
      }
    }

    return {
      hasFace: true,
      multipleFaces: false,
      faceCount: 1,
      confidence: 0.95,
      box,
      landmarks,
      pose,
      eyes: {
        leftEyeOpen: Number(leftEyeOpen.toFixed(2)),
        rightEyeOpen: Number(rightEyeOpen.toFixed(2)),
      },
    };
  }

  public async close(): Promise<void> {
    if (this.landmarker?.close) {
      this.landmarker.close();
    }
    this.landmarker = null;
    this.initPromise = null;
  }
}
