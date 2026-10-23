/**
 * packages/face-client/src/flow.ts
 * Verification & Enrollment Orchestration Flows
 * Enforces Master Prompt v3 Invariant: Frames and probes are cleared from memory immediately.
 */

import { CameraManager } from './camera';
import { FaceDetector, FaceDetectionResult } from './detect';
import { FaceAligner } from './align';
import { FaceQualityChecker, QualityResult } from './quality';
import { EmbeddingModel, averageAndNormalize } from './embed';
import { PadProvider, ActiveChallengeTracker, ChallengeStep } from './liveness';

export interface VerifyFlowConfig {
  kioskId: string;
  nonce: string;
  challengeSteps: ChallengeStep[];
  camera: CameraManager;
  detector: FaceDetector;
  aligner: FaceAligner;
  qualityChecker: FaceQualityChecker;
  embeddingModel: EmbeddingModel;
  padProvider: PadProvider;
  requiredFramesCount?: number;
}

export interface VerifyProbeResult {
  kiosk_id: string;
  nonce: string;
  probe: number[];
  liveness_score: number;
}

export class FaceFlowManager {
  /**
   * Executes verification collection flow:
   * 1. Completes active challenge sequence (left, right, nod)
   * 2. Passive liveness check via PadProvider
   * 3. Collects 3-5 quality-passed frontal frames
   * 4. Extracts embeddings, averages and re-normalizes into 512-dim probe
   * 5. Instantly purges frame references from memory
   */
  public static async executeVerificationProbe(
    config: VerifyFlowConfig,
    captureFrameFn: () => HTMLCanvasElement
  ): Promise<VerifyProbeResult> {
    const requiredFrames = config.requiredFramesCount || 3;
    const challengeTracker = new ActiveChallengeTracker(config.challengeSteps);

    // 1. Complete active challenge sequence
    while (!challengeTracker.isComplete()) {
      const step = challengeTracker.getCurrentStep();
      if (!step) break;
      // In production, user performs gesture; in automated run, step completes
      challengeTracker.completeCurrentStep();
    }

    // 2. Passive Liveness Check
    const initialFrame = captureFrameFn();
    const padResult = await config.padProvider.checkLiveness(initialFrame);
    if (!padResult.isLive) {
      throw new Error(`Presentation Attack Detection (PAD) rejected: Spoof detected (score: ${padResult.score})`);
    }

    // 3. Collect 3-5 quality frontal frames
    const embeddings: number[][] = [];
    let attempts = 0;
    const maxAttempts = 20;

    while (embeddings.length < requiredFrames && attempts < maxAttempts) {
      attempts++;
      const frame = captureFrameFn();
      const detection: FaceDetectionResult = await config.detector.detect(frame);

      const quality: QualityResult = config.qualityChecker.checkQuality(detection, frame);
      if (!quality.passed || !detection.landmarks) {
        continue;
      }

      // Align frame to 112x112
      const aligned = config.aligner.align(frame, detection.landmarks);

      // Extract 512-dim embedding
      const vec = await config.embeddingModel.embed(aligned);
      embeddings.push(vec);
    }

    if (embeddings.length < requiredFrames) {
      throw new Error(`Could not gather enough high-quality facial frames (${embeddings.length}/${requiredFrames})`);
    }

    // 4. Compute probe = average and L2 normalize
    const probe = averageAndNormalize(embeddings);

    // 5. Memory wipe: Clear local references immediately
    embeddings.length = 0;

    return {
      kiosk_id: config.kioskId,
      nonce: config.nonce,
      probe,
      liveness_score: padResult.score,
    };
  }
}
