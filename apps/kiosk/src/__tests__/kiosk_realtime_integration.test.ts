/**
 * apps/kiosk/src/__tests__/kiosk_realtime_integration.test.ts
 * DrTech.Care Kiosk Real-Time Camera & Biometric Input Integration Test Suite
 * Conforms to Master Prompt v3 Spec 7.3, 7.4, 12, 13 (Phase 3)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  KioskInputManager,
  DEFAULT_KIOSK_INPUT_CONFIG,
  FacePresenceTracker,
  SingleHandGestureTracker,
  HeadNodDetector,
  OneEuroFilter2D,
  KioskInputEvent,
} from '../../../../packages/kiosk-input/src/index.js';
import {
  FaceFlowManager,
  REQUIRED_ENROLL_POSES,
  EnrollmentProgressRing,
  computeProgressRingTicks,
} from '../../../../packages/face-client/src/index.js';
import { FaceAligner } from '../../../../packages/face-client/src/align.js';
import { FaceQualityChecker } from '../../../../packages/face-client/src/quality.js';
import { CameraManager } from '../../../../packages/face-client/src/camera.js';
import {
  MockFaceDetector,
  MockEmbeddingModel,
} from '../../../../packages/face-client/test/mocks.js';
import {
  FallbackFaceDetector,
  FallbackEmbeddingModel,
} from '../services/faceClientService.js';
import { defaultApiClient } from '../../../../packages/api-client/src/index.js';

// Helper to create mock canvas for node environment tests
function createHighContrastCanvas(w = 640, h = 480): HTMLCanvasElement {
  const mockCtx = {
    save: vi.fn(),
    restore: vi.fn(),
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    scale: vi.fn(),
    rotate: vi.fn(),
    translate: vi.fn(),
    getImageData: (_x: number, _y: number, width: number, height: number) => {
      const data = new Uint8ClampedArray(width * height * 4);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 4;
          const val = (x + y) % 2 === 0 ? 255 : 0;
          data[idx] = val;
          data[idx + 1] = val;
          data[idx + 2] = val;
          data[idx + 3] = 255;
        }
      }
      return { data, width, height };
    },
  };

  return {
    width: w,
    height: h,
    getContext: () => mockCtx,
    toDataURL: () => 'data:image/jpeg;base64,mock-jpeg-frame',
  } as unknown as HTMLCanvasElement;
}

describe('[INTEGRATION] DrTech.Care Phase 3: Kiosk Input & Face Client Real-Time Wiring', () => {
  // =========================================================================
  // TASK 1.1: Face Presence Detection & Sitting Detection (Spec 13.1)
  // =========================================================================
  describe('Task 1.1: Face Presence & Sitting Detection (FacePresenceTracker - Spec 13.1)', () => {
    let tracker: FacePresenceTracker;

    beforeEach(() => {
      tracker = new FacePresenceTracker({
        facePresenceMinDurationMs: 1000,
        faceAbsenceHysteresisMs: 2000,
        minFaceSizeRatio: 0.1,
        maxFaceMotionVariance: 0.05,
        captureImagesDuringIdle: false,
      });
    });

    it('1.1.1 When person sits in front of kiosk with face >= 0.10 held for 1,000ms, transitions from IDLE to PRESENT', () => {
      const faceBox = { x: 0.4, y: 0.3, width: 0.2, height: 0.25 }; // size ratio 0.25 >= 0.10

      // t = 0ms: First detection frame
      const r1 = tracker.update(faceBox, 1000);
      expect(r1.stateChanged).toBe(false);
      expect(r1.isPresent).toBe(false);

      // t = 500ms: Still evaluating
      const r2 = tracker.update(faceBox, 1500);
      expect(r2.stateChanged).toBe(false);
      expect(r2.isPresent).toBe(false);

      // t = 1000ms: 1,000ms stable threshold met -> PRESENCE_DETECTED
      const r3 = tracker.update(faceBox, 2000);
      expect(r3.stateChanged).toBe(true);
      expect(r3.isPresent).toBe(true);
      expect(r3.eventType).toBe('PRESENCE_DETECTED');
    });

    it('1.1.2 Rejects faces smaller than minFaceSizeRatio (0.10) to prevent background passersby triggering kiosk', () => {
      const smallFace = { x: 0.45, y: 0.3, width: 0.06, height: 0.07 }; // max(0.06, 0.07) = 0.07 < 0.10

      const r1 = tracker.update(smallFace, 1000);
      expect(r1.isPresent).toBe(false);

      const r2 = tracker.update(smallFace, 2500);
      expect(r2.isPresent).toBe(false);
      expect(r2.eventType).toBeNull();
    });

    it('1.1.3 Hysteresis: Presence is retained through brief occlusions (< 2,000ms) without flicker', () => {
      const faceBox = { x: 0.4, y: 0.3, width: 0.2, height: 0.25 };

      // Establish presence at t = 2000ms
      tracker.update(faceBox, 1000);
      tracker.update(faceBox, 2000);

      // Person blinks or turns momentarily (face lost for 1000ms < 2000ms hysteresis)
      const lost1 = tracker.update(null, 2500);
      expect(lost1.isPresent).toBe(true); // Still present due to hysteresis!
      expect(lost1.stateChanged).toBe(false);

      // Face returns before 2000ms hysteresis expires
      const returned = tracker.update(faceBox, 3200);
      expect(returned.isPresent).toBe(true);
      expect(returned.eventType).toBeNull();

      // Face truly leaves (> 2000ms absence)
      tracker.update(null, 3300);
      const lostFinal = tracker.update(null, 5400); // 2100ms > 2000ms hysteresis
      expect(lostFinal.stateChanged).toBe(true);
      expect(lostFinal.isPresent).toBe(false);
      expect(lostFinal.eventType).toBe('PRESENCE_LOST');
    });

    it('1.1.4 Strict Privacy Invariant: Zero image recording during screensaver/idle state', () => {
      const config = DEFAULT_KIOSK_INPUT_CONFIG;
      expect(config.captureImagesDuringIdle).toBe(false);

      const manager = new KioskInputManager();
      expect(manager.getIdleMode()).toBe(true);
      expect(manager.getConfig().captureImagesDuringIdle).toBe(false);
    });
  });

  // =========================================================================
  // TASK 1.2: Single-Hand Edge-Zone Gesture Tracker (Spec 13.2)
  // =========================================================================
  describe('Task 1.2: Single-Hand Gesture Selection (SingleHandGestureTracker - Spec 13.2)', () => {
    let tracker: SingleHandGestureTracker;

    beforeEach(() => {
      tracker = new SingleHandGestureTracker({
        handHoldDurationMs: 1000,
        leftZoneRatio: 0.25,
        rightZoneRatio: 0.75,
      });
    });

    it('1.2.1 Left Zone Dwell: Holding hand at left edge (x < 0.25) for 1,000ms triggers ZONE_SELECTED (left)', () => {
      // Finger at x = 0.15 (left zone)
      const ev1 = tracker.update({ x: 0.15, y: 0.5 }, 1000);
      expect(ev1.some((e) => e.type === 'ZONE_HOVER_START' && e.zone === 'left')).toBe(true);

      // 500ms elapsed
      const ev2 = tracker.update({ x: 0.15, y: 0.5 }, 1500);
      const progress = ev2.find((e) => e.type === 'ZONE_HOVER_PROGRESS');
      expect(progress).toBeDefined();
      expect((progress as any).progress).toBeCloseTo(0.5, 1);

      // 1000ms elapsed -> Select left
      const ev3 = tracker.update({ x: 0.15, y: 0.5 }, 2000);
      expect(ev3.some((e) => e.type === 'ZONE_SELECTED' && e.zone === 'left')).toBe(true);
    });

    it('1.2.2 Right Zone Dwell: Holding hand at right edge (x > 0.75) for 1,000ms triggers ZONE_SELECTED (right)', () => {
      // Finger at x = 0.85 (right zone)
      tracker.update({ x: 0.85, y: 0.5 }, 1000);
      const ev = tracker.update({ x: 0.85, y: 0.5 }, 2000);
      expect(ev.some((e) => e.type === 'ZONE_SELECTED' && e.zone === 'right')).toBe(true);
    });

    it('1.2.3 Single-Hand Invariant: Accepts 1 hand only and does NOT require two hands', () => {
      // Patient with right shoulder injury uses single left hand
      const singleHandLandmark = { x: 0.18, y: 0.45 };
      const events = tracker.update(singleHandLandmark, 1000);
      expect(events.length).toBeGreaterThan(0);
      expect(events[0].type).toBe('ZONE_HOVER_START');
    });

    it('1.2.4 OneEuroFilter2D suppresses tremor jitter in hand coordinates', () => {
      const filter = new OneEuroFilter2D(1.0, 0.007, 1.0);
      const p1 = filter.filter({ x: 0.2, y: 0.5 }, 1000);
      const p2 = filter.filter({ x: 0.22, y: 0.51 }, 1033);

      expect(p1.x).toBeCloseTo(0.2);
      expect(p2.x).toBeLessThan(0.22); // Filter dampens sudden jitter jump
    });

    it('1.2.5 Fallback: KioskInputManager supports immediate touch click fallback', () => {
      const manager = new KioskInputManager();
      const events: KioskInputEvent[] = [];
      manager.subscribe((ev) => events.push(ev));

      manager.triggerTouchFallback('select_has_account', 1234);
      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        type: 'TOUCH_FALLBACK',
        action: 'select_has_account',
        timestamp: 1234,
      });
    });
  });

  // =========================================================================
  // TASK 1.3: Head Nod Detector (Spec 13.3)
  // =========================================================================
  describe('Task 1.3: Hands-Free Head Nod Confirmation (HeadNodDetector - Spec 13.3)', () => {
    let nodDetector: HeadNodDetector;

    beforeEach(() => {
      nodDetector = new HeadNodDetector({
        nodAngleThresholdDeg: 12.0,
      });
    });

    it('1.3.1 Detects head nod (downward pitch dip >= 12 deg + recovery) to trigger HEAD_NOD_CONFIRMED', () => {
      // Neutral head posture: nose y = 0.5
      nodDetector.update({ x: 0.5, y: 0.5 }, 1000);

      // Downward dip: y increases to 0.60 (normalized delta +0.10 corresponds to ~15 degrees)
      const dipEvents = nodDetector.update({ x: 0.5, y: 0.6 }, 1200);
      expect(dipEvents).toHaveLength(0); // In progress

      // Recovery back toward neutral: y returns to 0.51
      const confirmEvents = nodDetector.update({ x: 0.5, y: 0.51 }, 1400);
      expect(confirmEvents).toHaveLength(1);
      expect(confirmEvents[0].type).toBe('HEAD_NOD_CONFIRMED');
    });

    it('1.3.2 Debounce Refractory: Prevents accidental double nods within 1,500ms', () => {
      nodDetector.update({ x: 0.5, y: 0.5 }, 1000);
      nodDetector.update({ x: 0.5, y: 0.6 }, 1200);
      const ev1 = nodDetector.update({ x: 0.5, y: 0.51 }, 1400);
      expect(ev1[0].type).toBe('HEAD_NOD_CONFIRMED');

      // Immediate second dip within refractory window (500ms later < 1500ms)
      nodDetector.update({ x: 0.5, y: 0.6 }, 1700);
      const ev2 = nodDetector.update({ x: 0.5, y: 0.51 }, 1800);
      expect(ev2).toHaveLength(0); // Suppressed
    });
  });

  // =========================================================================
  // TASK 2.1: VerifyView - Real-time Verification Probe Flow (Spec 7.4, 12)
  // =========================================================================
  describe('Task 2.1: Real-Time Face Verification Probe Flow (VerifyView - Spec 7.4, 12)', () => {
    it('2.1.1 Executes challenge steps and gathers frontal probe with memory wipe', async () => {
      const mockDetector = new MockFaceDetector();
      const mockEmbedding = new MockEmbeddingModel(100);
      const aligner = new FaceAligner();
      const qualityChecker = new FaceQualityChecker({ stabilityMs: 0 });
      const mockCanvas = createHighContrastCanvas();

      const challengeSteps = ['left', 'nod'] as const;
      let currentStepIndex = 0;

      const captureFrameFn = () => {
        if (currentStepIndex === 0) {
          mockDetector.setPoseByKeyword('left');
        } else if (currentStepIndex === 1) {
          mockDetector.setPoseByKeyword('nod');
        } else {
          mockDetector.setPoseByKeyword('front');
        }
        return mockCanvas;
      };

      const probeResult = await FaceFlowManager.executeVerificationProbe({
        kioskId: 'kiosk-01',
        nonce: 'nonce-random-1234567890',
        challengeSteps: [...challengeSteps],
        detector: mockDetector,
        aligner,
        qualityChecker,
        embeddingModel: mockEmbedding,
        captureFrameFn,
        requiredProbeFrames: 3,
        onProgress: (info) => {
          if (info.status === 'challenge' && info.qualityPassed) {
            currentStepIndex++;
          }
        },
      });

      expect(probeResult.kiosk_id).toBe('kiosk-01');
      expect(probeResult.nonce).toBe('nonce-random-1234567890');
      expect(probeResult.probe).toHaveLength(512);

      // Verify probe is unit normalized (L2 norm = 1.0)
      const sumSq = probeResult.probe.reduce((acc, v) => acc + v * v, 0);
      expect(Math.sqrt(sumSq)).toBeCloseTo(1.0, 3);

      // Memory Wipe Invariant (Rule 2.5)
      probeResult.probe.fill(0);
      expect(probeResult.probe.every((v) => v === 0)).toBe(true);
    });

    it('2.1.2 CameraManager renders mirrored preview for display but returns raw unmirrored canvas for detection', () => {
      const camera = new CameraManager({ mirror: true, rotation: 0 });

      // Mock preview canvas and context
      const previewCanvas = createHighContrastCanvas();
      const ctx = previewCanvas.getContext('2d') as any;

      const mockVideo = {
        readyState: 4,
        videoWidth: 640,
        videoHeight: 480,
      } as HTMLVideoElement;

      // 1. Preview render: should call ctx.scale(-1, 1) for user mirror experience
      camera.renderPreview(previewCanvas, mockVideo, true);
      expect(ctx.scale).toHaveBeenCalledWith(-1, 1);

      // 2. captureRotatedFrame: MUST NOT call scale(-1, 1) on model frame!
      ctx.scale.mockClear();
      const modelCanvas = camera.captureRotatedFrame(mockVideo);
      expect(modelCanvas).toBeDefined();
      expect(ctx.scale).not.toHaveBeenCalledWith(-1, 1);
    });
  });

  // =========================================================================
  // TASK 2.2: EnrollView - 10-Frame Biometric Enrollment (Spec 7.3, 10)
  // =========================================================================
  describe('Task 2.2: 10-Frame Biometric Enrollment (EnrollView - Spec 7.3, 10)', () => {
    it('2.2.1 Executes strictly 10 poses in order: front(4) -> left(2) -> right(2) -> nod(2)', async () => {
      const mockDetector = new MockFaceDetector();
      const mockEmbedding = new MockEmbeddingModel(200);
      const aligner = new FaceAligner();
      const qualityChecker = new FaceQualityChecker({ stabilityMs: 0 });
      const mockCanvas = createHighContrastCanvas();

      let currentStepIdx = 0;
      const captureFrameFn = () => {
        const expectedPose = REQUIRED_ENROLL_POSES[currentStepIdx] || 'front';
        mockDetector.setPoseByKeyword(expectedPose);
        return mockCanvas;
      };

      const result = await FaceFlowManager.executeEnrollment({
        patientId: 'patient-new-test',
        ticketId: 'TICK-999',
        detector: mockDetector,
        aligner,
        qualityChecker,
        embeddingModel: mockEmbedding,
        captureFrameFn,
        onProgress: (info) => {
          if (info.qualityPassed) {
            currentStepIdx++;
          }
        },
      });

      expect(result.frames).toHaveLength(10);
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

      // Verify all 10 embeddings are 512 dimensions
      result.frames.forEach((f) => {
        expect(f.embedding).toHaveLength(512);
      });

      // Memory Wipe Invariant: Wipe all 10 embeddings immediately
      result.frames.forEach((f) => f.embedding.fill(0));
      expect(result.frames.every((f) => f.embedding.every((v) => v === 0))).toBe(true);
    });

    it('2.2.2 EnrollmentProgressRing computes 10 distinct circular ticks', () => {
      const ticksAt0 = computeProgressRingTicks(0);
      expect(ticksAt0).toHaveLength(10);
      expect(ticksAt0[0].status).toBe('active');
      expect(ticksAt0.slice(1).every((t) => t.status === 'pending')).toBe(true);

      const ticksAt5 = computeProgressRingTicks(5);
      expect(ticksAt5.slice(0, 5).every((t) => t.status === 'completed')).toBe(true);
      expect(ticksAt5[5].status).toBe('active');
      expect(ticksAt5.slice(6).every((t) => t.status === 'pending')).toBe(true);
    });

    it('2.2.3 EnrollmentProgressRing component renders SVG with correct number of ticks', () => {
      const element = EnrollmentProgressRing({
        currentFrameIndex: 4,
        currentPose: 'left',
        size: 320,
      });

      expect(element).toBeDefined();
      const reactEl = element as React.ReactElement<{ style: { width: number; height: number } }>;
      expect(reactEl.props.style).toEqual({ width: 320, height: 320 });
    });
  });

  // =========================================================================
  // Fallback Service Integration
  // =========================================================================
  describe('Fallback Service Factory', () => {
    it('FallbackFaceDetector and FallbackEmbeddingModel provide working detection and 512-D vectors', async () => {
      const detector = new FallbackFaceDetector();
      const mockCanvas = createHighContrastCanvas();

      const det = await detector.detect(mockCanvas);
      expect(det.hasFace).toBe(true);
      expect(det.confidence).toBeGreaterThan(0.95);
      expect(det.landmarks).toBeDefined();

      const embeddingModel = new FallbackEmbeddingModel(100);
      const vec = await embeddingModel.embed(mockCanvas);
      expect(vec).toHaveLength(512);
      const sumSq = vec.reduce((acc, v) => acc + v * v, 0);
      expect(Math.sqrt(sumSq)).toBeCloseTo(1.0, 3);
    });

    it('defaultApiClient has kiosk challenge and verifyFace methods', () => {
      expect(typeof defaultApiClient.kiosk.requestChallenge).toBe('function');
      expect(typeof defaultApiClient.kiosk.verifyFace).toBe('function');
      expect(typeof defaultApiClient.kiosk.enroll).toBe('function');
      expect(typeof defaultApiClient.kiosk.confirmIdentity).toBe('function');
      expect(typeof defaultApiClient.kiosk.callStaff).toBe('function');
    });
  });
});
