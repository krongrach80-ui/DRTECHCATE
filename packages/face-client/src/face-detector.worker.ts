/**
 * packages/face-client/src/face-detector.worker.ts
 * Dedicated Web Worker for off-thread MediaPipe FaceLandmarker execution
 * (Spec 7.1 & 7.7.2 Web Worker for face detection)
 */

import {
  extractEulerAnglesFromMatrix,
  extractEulerAnglesFromLandmarks,
  FaceDetectionResult,
  BoundingBox,
  FaceLandmarks,
} from './detect';

let landmarker: any = null;

async function initLandmarker(wasmPath: string, modelAssetPath: string) {
  const vision = await import('@mediapipe/tasks-vision');
  const { FaceLandmarker, FilesetResolver } = vision;

  const fileset = await FilesetResolver.forVisionTasks(wasmPath);
  landmarker = await FaceLandmarker.createFromOptions(fileset, {
    baseOptions: {
      modelAssetPath,
      delegate: 'GPU',
    },
    runningMode: 'IMAGE',
    numFaces: 2,
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: true,
  });
}

function processDetection(
  results: any,
  width: number,
  height: number
): FaceDetectionResult {
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

  const landmarksRaw = faces[0];

  const leftEyeRaw = landmarksRaw[468] || {
    x: (landmarksRaw[33].x + landmarksRaw[133].x) / 2,
    y: (landmarksRaw[33].y + landmarksRaw[133].y) / 2,
  };
  const rightEyeRaw = landmarksRaw[473] || {
    x: (landmarksRaw[362].x + landmarksRaw[263].x) / 2,
    y: (landmarksRaw[362].y + landmarksRaw[263].y) / 2,
  };
  const noseRaw = landmarksRaw[1];
  const mouthLeftRaw = landmarksRaw[61];
  const mouthRightRaw = landmarksRaw[291];

  const landmarks: FaceLandmarks = {
    leftEye: { x: leftEyeRaw.x * width, y: leftEyeRaw.y * height },
    rightEye: { x: rightEyeRaw.x * width, y: rightEyeRaw.y * height },
    noseTip: { x: noseRaw.x * width, y: noseRaw.y * height },
    leftMouth: { x: mouthLeftRaw.x * width, y: mouthLeftRaw.y * height },
    rightMouth: { x: mouthRightRaw.x * width, y: mouthRightRaw.y * height },
  };

  let minX = 1;
  let minY = 1;
  maxX = 0;
  maxY = 0;

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

  let pose;
  const matrices = results.facialTransformationMatrixes;
  if (matrices && matrices.length > 0 && matrices[0].data) {
    pose = extractEulerAnglesFromMatrix(matrices[0].data);
  } else {
    pose = extractEulerAnglesFromLandmarks(landmarksRaw);
  }

  let leftEyeOpen = 1.0;
  let rightEyeOpen = 1.0;
  const blendshapes = results.faceBlendshapes;
  if (blendshapes && blendshapes.length > 0 && blendshapes[0].categories) {
    for (const cat of blendshapes[0].categories) {
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

let maxX = 0;
let maxY = 0;

if (typeof self !== 'undefined') {
  self.onmessage = async (e: MessageEvent) => {
    const { id, type, payload } = e.data;
    try {
      if (type === 'INIT') {
        await initLandmarker(payload.wasmPath, payload.modelAssetPath);
        self.postMessage({ id, ok: true });
      } else if (type === 'DETECT') {
        if (!landmarker) {
          throw new Error('Worker FaceLandmarker not initialized');
        }
        const results = landmarker.detect(payload.imageBitmap);
        const result = processDetection(results, payload.width, payload.height);
        self.postMessage({ id, ok: true, result });
      }
    } catch (err: any) {
      self.postMessage({ id, ok: false, error: err?.message || String(err) });
    }
  };
}
