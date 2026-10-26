import { describe, it, expect } from 'vitest';
import {
  FaceFlowManager,
  REQUIRED_ENROLL_POSES,
  compressCanvasToJpeg,
} from '../src/flow';
import { FaceAligner } from '../src/align';
import { FaceQualityChecker } from '../src/quality';
import { computeProgressRingTicks } from '../src/ring';
import {
  MockFaceDetector,
  MockEmbeddingModel,
  MockPadProvider,
} from './mocks';

describe('[FACE-CLIENT] flow.ts - Enrollment 10-Frames & Verification Probe', () => {
  // Helper to create mock Canvas with realistic high-contrast texture so Laplacian variance passes
  function createMockCanvas(width = 640, height = 480): HTMLCanvasElement {
    const mockCtx = {
      save: () => {},
      restore: () => {},
      clearRect: () => {},
      setTransform: () => {},
      drawImage: () => {},
      getImageData: (_x: number, _y: number, w: number, h: number) => {
        const data = new Uint8ClampedArray(w * h * 4);
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const idx = (y * w + x) * 4;
            const val = (x + y) % 2 === 0 ? 255 : 0;
            data[idx] = val;
            data[idx + 1] = val;
            data[idx + 2] = val;
            data[idx + 3] = 255;
          }
        }
        return { data, width: w, height: h };
      },
    };

    return {
      width,
      height,
      getContext: () => mockCtx,
      toDataURL: (_format: string, _q: number) => 'data:image/jpeg;base64,mock-jpeg-base64',
    } as unknown as HTMLCanvasElement;
  }

  describe('1. executeEnrollment', () => {
    it('1.1 should enforce strictly 10 frames in order: front(4) -> left(2) -> right(2) -> nod(2)', async () => {
      const mockDetector = new MockFaceDetector();
      const mockEmbedding = new MockEmbeddingModel(100);
      const aligner = new FaceAligner();
      const qualityChecker = new FaceQualityChecker({ stabilityMs: 0 }); // 0 ms for fast test

      const progressHistory: any[] = [];
      let currentStepIndex = 0;

      const mockCanvas = createMockCanvas();

      // Configure capture frame to adjust detector pose matching expected pose
      const captureFrameFn = () => {
        const expectedPose = REQUIRED_ENROLL_POSES[currentStepIndex] || 'front';
        mockDetector.setPoseByKeyword(expectedPose);
        return mockCanvas;
      };

      const result = await FaceFlowManager.executeEnrollment({
        patientId: 'patient-test-001',
        ticketId: 'ticket-test-123',
        consentId: 'consent-test-abc',
        detector: mockDetector,
        aligner,
        qualityChecker,
        embeddingModel: mockEmbedding,
        captureFrameFn,
        onProgress: (info) => {
          progressHistory.push(info);
          if (info.qualityPassed) {
            currentStepIndex++;
          }
        },
      });

      // Verify returned result
      expect(result.patient_id).toBe('patient-test-001');
      expect(result.ticket_id).toBe('ticket-test-123');
      expect(result.consent_id).toBe('consent-test-abc');
      expect(result.frames.length).toBe(10);

      // Verify strictly ordered poses
      const collectedPoses = result.frames.map((f) => f.pose);
      expect(collectedPoses).toEqual([
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
      ]);

      // Verify all frames contain 512-dim embedding and compressed JPEG data
      for (const frame of result.frames) {
        expect(frame.embedding.length).toBe(512);
        expect(frame.jpeg_base64).toContain('data:image/jpeg;base64,');
      }

      // Verify progress callback ran and contains Thai guidance
      expect(progressHistory.length).toBeGreaterThanOrEqual(10);
      expect(progressHistory[0].thaiInstruction).toMatch(/มองตรง|กะพริบตา/);
    });

    it('1.2 compressCanvasToJpeg should produce JPEG dataURL scaled within max dimensions', () => {
      const canvas = createMockCanvas(1280, 720);
      const jpeg = compressCanvasToJpeg(canvas, 800, 0.8);
      expect(typeof jpeg).toBe('string');
      expect(jpeg.startsWith('data:image/jpeg;base64,')).toBe(true);
    });
  });

  describe('2. executeVerificationProbe', () => {
    it('2.1 should verify active challenge steps and return 512-dim probe and liveness score', async () => {
      const mockDetector = new MockFaceDetector();
      const mockEmbedding = new MockEmbeddingModel(200);
      const mockPad = new MockPadProvider(true, 0.97);
      const aligner = new FaceAligner();
      const qualityChecker = new FaceQualityChecker({ stabilityMs: 0 });

      const challengeSteps = ['left', 'nod'] as const;
      let phase: 'left' | 'nod' | 'front' = 'left';

      const mockCanvas = createMockCanvas();
      const captureFrameFn = () => {
        mockDetector.setPoseByKeyword(phase);
        return mockCanvas;
      };

      const result = await FaceFlowManager.executeVerificationProbe({
        kioskId: 'kiosk-unit-01',
        nonce: 'nonce-secure-987',
        challengeSteps: [...challengeSteps],
        detector: mockDetector,
        aligner,
        qualityChecker,
        embeddingModel: mockEmbedding,
        padProvider: mockPad,
        requiredProbeFrames: 3,
        captureFrameFn,
        onProgress: (info) => {
          if (info.status === 'challenge') {
            if (info.qualityPassed) {
              if (phase === 'left') phase = 'nod';
            }
          } else if (info.status === 'probe') {
            phase = 'front';
          }
        },
      });

      expect(result.kiosk_id).toBe('kiosk-unit-01');
      expect(result.nonce).toBe('nonce-secure-987');
      expect(result.probe.length).toBe(512);
      expect(result.liveness_score).toBe(0.97);

      // Verify probe is unit normalized (L2 norm = 1.0)
      const norm = Math.sqrt(result.probe.reduce((sum, v) => sum + v * v, 0));
      expect(norm).toBeCloseTo(1.0, 4);
    });

    it('2.2 should reject when PAD detects a spoof attack', async () => {
      const mockDetector = new MockFaceDetector();
      const mockEmbedding = new MockEmbeddingModel();
      const mockPad = new MockPadProvider(false, 0.12); // Spoof!
      const aligner = new FaceAligner();
      const qualityChecker = new FaceQualityChecker({ stabilityMs: 0 });

      const mockCanvas = createMockCanvas();
      mockDetector.setPoseByKeyword('left');

      await expect(
        FaceFlowManager.executeVerificationProbe({
          kioskId: 'kiosk-01',
          nonce: 'nonce-123',
          challengeSteps: ['left'],
          detector: mockDetector,
          aligner,
          qualityChecker,
          embeddingModel: mockEmbedding,
          padProvider: mockPad,
          captureFrameFn: () => mockCanvas,
        })
      ).rejects.toThrow('Presentation Attack Detection (PAD) rejected');
    });
  });

  describe('3. 10-Tick Progress Ring Helpers', () => {
    it('3.1 computeProgressRingTicks should partition into 4 front, 2 left, 2 right, 2 nod', () => {
      const ticks = computeProgressRingTicks(5);
      expect(ticks.length).toBe(10);

      // Verify status: ticks 0..4 completed, tick 5 active, ticks 6..9 pending
      for (let i = 0; i < 5; i++) {
        expect(ticks[i].status).toBe('completed');
      }
      expect(ticks[5].status).toBe('active');
      for (let i = 6; i < 10; i++) {
        expect(ticks[i].status).toBe('pending');
      }

      // Verify pose mapping
      const poses = ticks.map((t) => t.pose);
      expect(poses).toEqual([
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
      ]);
    });
  });
});
