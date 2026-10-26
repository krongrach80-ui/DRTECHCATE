/**
 * packages/face-client/src/flow.ts
 * Verification & Enrollment Orchestration Flows
 * Conforms to Master Prompt v3 Spec 7.3, 7.4, 7.5
 * Architecture Invariants:
 * - enroll(): Enforces strictly 10 frames in order: front(4) -> left(2) -> right(2) -> nod(2)
 * - Embeddings are extracted from 112x112 aligned face BEFORE JPEG compression
 * - verify(): User must execute each challenge step (detected via yaw/pitch) before 3-5 frontal probe frames
 * - Memory Wipe: All temporary canvases, image buffers, and embedding arrays are cleared immediately
 */

import { CameraManager } from './camera';
import { FaceDetector, FaceDetectionResult } from './detect';
import { FaceAligner } from './align';
import { FaceQualityChecker, QualityResult, RequiredPose } from './quality';
import { EmbeddingModel, averageAndNormalize } from './embed';
import {
  PadProvider,
  ActiveChallengeTracker,
  ChallengeStep,
  getThaiPoseInstruction,
} from './liveness';

export interface VerifyFlowConfig {
  kioskId: string;
  nonce: string;
  challengeSteps: ChallengeStep[];
  camera?: CameraManager;
  detector: FaceDetector;
  aligner: FaceAligner;
  qualityChecker: FaceQualityChecker;
  embeddingModel: EmbeddingModel;
  padProvider?: PadProvider;
  requiredProbeFrames?: number;
  requiredFramesCount?: number;
  captureFrameFn?: () => HTMLCanvasElement;
  onProgress?: (info: {
    status: 'challenge' | 'probe' | 'done';
    stepIndex: number;
    totalSteps: number;
    currentPose: ChallengeStep;
    thaiInstruction: string;
    qualityPassed: boolean;
    issues?: string[];
  }) => void;
  maxAttemptsPerStep?: number;
}

export interface VerifyProbeResult {
  kiosk_id: string;
  nonce: string;
  probe: number[];
  liveness_score: number;
}

export interface FaceEnrollmentFrame {
  pose: 'front' | 'left' | 'right' | 'nod';
  embedding: number[];
  jpeg_base64: string;
}

export interface EnrollFlowConfig {
  patientId: string;
  ticketId?: string;
  consentId?: string;
  camera?: CameraManager;
  detector: FaceDetector;
  aligner: FaceAligner;
  qualityChecker: FaceQualityChecker;
  embeddingModel: EmbeddingModel;
  captureFrameFn: () => HTMLCanvasElement;
  onProgress?: (info: {
    frameIndex: number; // 0 to 10
    totalFrames: number; // 10
    currentPose: RequiredPose;
    thaiInstruction: string;
    qualityPassed: boolean;
    issues?: string[];
  }) => void;
  maxAttemptsPerPose?: number;
}

export interface EnrollFlowResult {
  patient_id: string;
  ticket_id?: string;
  consent_id?: string;
  frames: FaceEnrollmentFrame[];
}

/**
 * Standard ordered 10 poses required for enrollment (Spec 7.3.3)
 * 4 front, 2 left, 2 right, 2 nod
 */
export const REQUIRED_ENROLL_POSES: RequiredPose[] = [
  'front',
  'front',
  'front',
  'front',
  'left',
  'left',
  'right',
  'right',
  'nod',
  'nod',
];

/**
 * Compresses an HTMLCanvasElement into a JPEG data URL <= maxDim x maxDim
 */
export function compressCanvasToJpeg(
  sourceCanvas: HTMLCanvasElement,
  maxDim: number = 800,
  quality: number = 0.8
): string {
  let targetWidth = sourceCanvas.width;
  let targetHeight = sourceCanvas.height;

  if (targetWidth > maxDim || targetHeight > maxDim) {
    if (targetWidth >= targetHeight) {
      targetHeight = Math.round((targetHeight * maxDim) / targetWidth);
      targetWidth = maxDim;
    } else {
      targetWidth = Math.round((targetWidth * maxDim) / targetHeight);
      targetHeight = maxDim;
    }
  }

  const compressCanvas =
    typeof document !== 'undefined'
      ? document.createElement('canvas')
      : ({} as HTMLCanvasElement);

  compressCanvas.width = targetWidth;
  compressCanvas.height = targetHeight;

  if (compressCanvas.getContext) {
    const ctx = compressCanvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(sourceCanvas, 0, 0, targetWidth, targetHeight);
      const dataUrl = compressCanvas.toDataURL('image/jpeg', quality);
      // Clean canvas
      ctx.clearRect(0, 0, targetWidth, targetHeight);
      return dataUrl;
    }
  }

  return sourceCanvas.toDataURL ? sourceCanvas.toDataURL('image/jpeg', quality) : '';
}

export class FaceFlowManager {
  /**
   * Executes Complete Face Enrollment Flow (Spec 7.3)
   * Captures exactly 10 frames in sequence: front(4) -> left(2) -> right(2) -> nod(2)
   * Evaluates quality gate, aligns 112x112, embeds 512-D, compresses JPEG <= 800x800,
   * sends progress callbacks for 10-tick ring, and wipes memory immediately.
   */
  public static async executeEnrollment(config: EnrollFlowConfig): Promise<EnrollFlowResult> {
    const collectedFrames: FaceEnrollmentFrame[] = [];
    const totalFrames = REQUIRED_ENROLL_POSES.length; // 10
    const maxAttempts = config.maxAttemptsPerPose || 120;

    for (let i = 0; i < totalFrames; i++) {
      const targetPose = REQUIRED_ENROLL_POSES[i];
      const thaiInstruction = getThaiPoseInstruction(targetPose);

      // Give user time to transition pose when moving to a new pose group
      if (i > 0 && REQUIRED_ENROLL_POSES[i] !== REQUIRED_ENROLL_POSES[i - 1]) {
        config.onProgress?.({
          frameIndex: collectedFrames.length,
          totalFrames,
          currentPose: targetPose,
          thaiInstruction: `กรุณาปรับท่าทาง: ${thaiInstruction}`,
          qualityPassed: false,
          issues: ['POSE_TRANSITION'],
        });
        await new Promise((r) => setTimeout(r, 1200));
      }

      config.qualityChecker.resetStability();

      let attempts = 0;
      let frameCaptured = false;

      while (!frameCaptured && attempts < maxAttempts) {
        attempts++;
        const frame = config.captureFrameFn();
        const detection: FaceDetectionResult = await config.detector.detect(frame);
        const quality: QualityResult = config.qualityChecker.checkQuality(
          detection,
          frame,
          targetPose
        );

        config.onProgress?.({
          frameIndex: collectedFrames.length,
          totalFrames,
          currentPose: targetPose,
          thaiInstruction,
          qualityPassed: quality.passed,
          issues: quality.issues,
        });

        if (quality.passed && detection.landmarks) {
          // 1. Align face to 112x112 ArcFace coordinates
          const alignedCanvas = config.aligner.align(frame, detection.landmarks);

          // 2. Extract 512-dim embedding from uncompressed aligned face
          const embedding = await config.embeddingModel.embed(alignedCanvas);

          // 3. Compress full frame to JPEG <= 800x800, quality 0.8
          const jpeg_base64 = compressCanvasToJpeg(frame, 800, 0.8);

          // 4. Record frame
          collectedFrames.push({
            pose: targetPose,
            embedding,
            jpeg_base64,
          });

          frameCaptured = true;

          // Clear aligned canvas context
          const actx = alignedCanvas.getContext?.('2d');
          if (actx) actx.clearRect(0, 0, alignedCanvas.width, alignedCanvas.height);
          break;
        }

        // Brief delay between frame checks if needed in real browser
        await new Promise((r) => setTimeout(r, 10));
      }

      if (!frameCaptured) {
        // Memory wipe on abort
        collectedFrames.forEach((f) => f.embedding.fill(0));
        throw new Error(
          `Face enrollment aborted: Could not capture quality frame for pose '${targetPose}' (Frame ${
            i + 1
          }/10)`
        );
      }
    }

    // Notify completion
    config.onProgress?.({
      frameIndex: 10,
      totalFrames: 10,
      currentPose: 'front',
      thaiInstruction: 'ลงทะเบียนครบ 10 เฟรมเรียบร้อยแล้ว',
      qualityPassed: true,
      issues: [],
    });

    return {
      patient_id: config.patientId,
      ticket_id: config.ticketId,
      consent_id: config.consentId,
      frames: collectedFrames,
    };
  }

  /**
   * Executes Verification Probe Flow (Spec 7.4)
   * 1. Completes dynamic active challenge sequence (e.g. left -> nod)
   * 2. Runs passive liveness check (if padProvider configured)
   * 3. Collects 3-5 quality frontal frames
   * 4. Extracts embeddings, averages and L2 normalizes into single 512-dim probe
   * 5. Instantly flushes local frame buffers
   */
  public static async executeVerificationProbe(
    config: VerifyFlowConfig,
    captureFrameFnParam?: () => HTMLCanvasElement
  ): Promise<VerifyProbeResult> {
    const captureFrame = config.captureFrameFn || captureFrameFnParam;
    if (!captureFrame) {
      throw new Error('captureFrameFn is required for executeVerificationProbe');
    }

    const requiredProbeFrames = config.requiredProbeFrames || config.requiredFramesCount || 3;
    const challengeTracker = new ActiveChallengeTracker(config.challengeSteps);
    const maxAttempts = config.maxAttemptsPerStep || 50;

    // Phase 1: Real Challenge Steps (user performs required head movements)
    while (!challengeTracker.isComplete()) {
      const currentStep = challengeTracker.getCurrentStep();
      if (!currentStep) break;

      const thaiInstruction = getThaiPoseInstruction(currentStep);
      config.qualityChecker.resetStability();

      let attempts = 0;
      let stepPassed = false;

      while (!stepPassed && attempts < maxAttempts) {
        attempts++;
        const frame = captureFrame();
        const detection: FaceDetectionResult = await config.detector.detect(frame);
        const quality: QualityResult = config.qualityChecker.checkQuality(
          detection,
          frame,
          currentStep
        );

        config.onProgress?.({
          status: 'challenge',
          stepIndex: challengeTracker.getState().currentStepIndex,
          totalSteps: config.challengeSteps.length,
          currentPose: currentStep,
          thaiInstruction,
          qualityPassed: quality.passed,
          issues: quality.issues,
        });

        if (quality.passed) {
          challengeTracker.completeCurrentStep();
          stepPassed = true;
          break;
        }

        await new Promise((r) => setTimeout(r, 10));
      }

      if (!stepPassed) {
        throw new Error(`Verification challenge timed out on step '${currentStep}'`);
      }
    }

    // Phase 2: Passive Liveness Check (anti-spoofing)
    let livenessScore = 1.0;
    if (config.padProvider) {
      const probeFrame = captureFrame();
      const padResult = await config.padProvider.checkLiveness(probeFrame);
      livenessScore = padResult.score;
      if (!padResult.isLive) {
        throw new Error('Presentation Attack Detection (PAD) rejected: Spoof detected');
      }
    }

    // Phase 3: Collect 3-5 quality frontal frames for probe
    const frontalEmbeddings: number[][] = [];
    let frontalAttempts = 0;
    const maxFrontalAttempts = maxAttempts * 2;
    config.qualityChecker.resetStability();

    while (frontalEmbeddings.length < requiredProbeFrames && frontalAttempts < maxFrontalAttempts) {
      frontalAttempts++;
      const frame = captureFrame();
      const detection: FaceDetectionResult = await config.detector.detect(frame);
      const quality: QualityResult = config.qualityChecker.checkQuality(
        detection,
        frame,
        'front'
      );

      config.onProgress?.({
        status: 'probe',
        stepIndex: frontalEmbeddings.length,
        totalSteps: requiredProbeFrames,
        currentPose: 'front',
        thaiInstruction: 'กรุณามองตรงที่กล้อง',
        qualityPassed: quality.passed,
        issues: quality.issues,
      });

      if (quality.passed && detection.landmarks) {
        const aligned = config.aligner.align(frame, detection.landmarks);
        const vec = await config.embeddingModel.embed(aligned);
        frontalEmbeddings.push(vec);

        const actx = aligned.getContext?.('2d');
        if (actx) actx.clearRect(0, 0, aligned.width, aligned.height);
      }

      await new Promise((r) => setTimeout(r, 10));
    }

    if (frontalEmbeddings.length < requiredProbeFrames) {
      frontalEmbeddings.forEach((v) => v.fill(0));
      throw new Error(
        `Could not gather enough high-quality facial frames (${frontalEmbeddings.length}/${requiredProbeFrames})`
      );
    }

    // Phase 4: Compute probe = arithmetic mean + L2 normalize
    const probe = averageAndNormalize(frontalEmbeddings);

    // Phase 5: Memory wipe (Rule 2.5)
    frontalEmbeddings.forEach((v) => v.fill(0));
    frontalEmbeddings.length = 0;

    config.onProgress?.({
      status: 'done',
      stepIndex: requiredProbeFrames,
      totalSteps: requiredProbeFrames,
      currentPose: 'front',
      thaiInstruction: 'ยืนยันตัวตนสำเร็จ กำลังตรวจสอบข้อมูล',
      qualityPassed: true,
      issues: [],
    });

    return {
      kiosk_id: config.kioskId,
      nonce: config.nonce,
      probe,
      liveness_score: livenessScore,
    };
  }
}
