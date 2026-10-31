/**
 * packages/pose-engine/src/__tests__/pose_visibility_and_projection.test.ts
 *
 * Automated verification for Bug #2:
 * 1. Exact Canvas-to-Video Coordinate Mapping (object-fit: cover & contain, mirroring, aspect ratios)
 * 2. Anatomical Readiness & Visibility Gate (missing arm / missing shoulder)
 * 3. Side Toggle (Right Arm vs Left Arm) with Shoulder Pendulum repetition counting
 */

import { describe, it, expect } from 'vitest';
import { projectLandmarkToCanvas } from '../math/projection';
import { RepStateMachine } from '../engine/repStateMachine';
import { SHOULDER_PENDULUM_PRESET } from '../presets/shoulderPendulumPreset';
import { PoseEngineLandmark } from '../types/exerciseConfig';

function createMockSkeleton(): PoseEngineLandmark[] {
  return Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.5,
    z: 0.0,
    visibility: 0.95,
    presence: 0.95,
  }));
}

describe('Pose Visibility & Projection Test Suite', () => {
  describe('1. projectLandmarkToCanvas Coordinate Projection', () => {
    it('1.1 maps center landmark (0.5, 0.5) to center of canvas under cover fit', () => {
      // 1280x720 video displayed on 1920x1080 canvas (both 16:9)
      const pt = projectLandmarkToCanvas(
        { x: 0.5, y: 0.5 },
        1280,
        720,
        1920,
        1080,
        false,
        'cover'
      );

      expect(pt.x).toBeCloseTo(960, 1);
      expect(pt.y).toBeCloseTo(540, 1);
      expect(pt.isWithinFrame).toBe(true);
    });

    it('1.2 mirrors x coordinates when isMirrored is true (webcam selfie view)', () => {
      // Left eye / shoulder at norm x = 0.25 -> mirrored should be at norm x = 0.75
      const ptNormal = projectLandmarkToCanvas(
        { x: 0.25, y: 0.5 },
        1280,
        720,
        1280,
        720,
        false,
        'cover'
      );
      const ptMirrored = projectLandmarkToCanvas(
        { x: 0.25, y: 0.5 },
        1280,
        720,
        1280,
        720,
        true,
        'cover'
      );

      expect(ptNormal.x).toBeCloseTo(320, 1);
      expect(ptMirrored.x).toBeCloseTo(960, 1);
      expect(ptMirrored.y).toBeCloseTo(ptNormal.y, 1);
    });

    it('1.3 handles aspect-ratio mismatch with cropping offset under cover fit', () => {
      // 16:9 video (1280x720) displayed on square canvas (1000x1000)
      // Scale is determined by height: 1000 / 720 = 1.3888
      // Video width scaled = 1280 * 1.3888 = 1777.7px. OffsetX = (1000 - 1777.7)/2 = -388.8px
      const ptCenter = projectLandmarkToCanvas(
        { x: 0.5, y: 0.5 },
        1280,
        720,
        1000,
        1000,
        false,
        'cover'
      );

      expect(ptCenter.x).toBeCloseTo(500, 1);
      expect(ptCenter.y).toBeCloseTo(500, 1);
      expect(ptCenter.isWithinFrame).toBe(true);

      // A landmark near the edge in camera coordinates may be cropped out of the square viewport
      const ptFarEdge = projectLandmarkToCanvas(
        { x: 0.05, y: 0.5 },
        1280,
        720,
        1000,
        1000,
        false,
        'cover'
      );
      // In this setup, normX 0.05 falls outside [0, 1000] canvas range
      expect(ptFarEdge.x).toBeLessThan(0);
      expect(ptFarEdge.isWithinFrame).toBe(false);
    });

    it('1.4 projects landmarks using HTMLVideoElement and HTMLCanvasElement mock objects', () => {
      const mockVideo = { videoWidth: 1280, videoHeight: 720 } as HTMLVideoElement;
      const mockCanvas = { width: 1280, height: 720 } as HTMLCanvasElement;

      const pt = projectLandmarkToCanvas(
        { x: 0.2, y: 0.3, visibility: 0.95 },
        mockVideo,
        mockCanvas,
        true,
        'cover'
      );

      // Mirrored x = (1.0 - 0.2) * 1280 = 0.8 * 1280 = 1024
      expect(pt.x).toBeCloseTo(1024, 1);
      expect(pt.y).toBeCloseTo(216, 1);
      expect(pt.visibility).toBe(0.95);
      expect(pt.inFrame).toBe(true);
      expect(pt.isWithinFrame).toBe(true);
    });

    it('1.5 gracefully handles zero canvas or video dimensions without NaN or exceptions', () => {
      const mockVideo = { videoWidth: 0, videoHeight: 0 } as HTMLVideoElement;
      const mockCanvas = { width: 0, height: 0 } as HTMLCanvasElement;

      const pt = projectLandmarkToCanvas(
        { x: 0.5, y: 0.5 },
        mockVideo,
        mockCanvas,
        true,
        'cover'
      );

      expect(pt.x).toBe(0);
      expect(pt.y).toBe(0);
      expect(pt.inFrame).toBe(false);
      expect(pt.isWithinFrame).toBe(false);
    });
  });

  describe('2. Anatomical Readiness & Landmark Visibility Gating', () => {
    it('2.1 triggers missing_arm_landmarks when user sits too close and elbow/wrist are out of frame', () => {
      const config = {
        ...SHOULDER_PENDULUM_PRESET,
        side: 'right' as const,
      };

      const machine = new RepStateMachine(config);
      const skel = createMockSkeleton();

      // Right shoulder (12) is visible in upper chest
      skel[12] = { x: 0.45, y: 0.35, z: 0.0, visibility: 0.92 };

      // Elbow (14) and Wrist (16) are out of frame / low confidence (as seen in screenshot)
      skel[14] = { x: 0.45, y: 0.95, z: 0.0, visibility: 0.25 };
      skel[16] = { x: 0.45, y: 0.99, z: 0.0, visibility: 0.12 };

      const res = machine.evaluate(skel, 1000);

      // Must be gated: readinessStatus must be 'missing_arm_landmarks'
      expect(res.readinessStatus).toBe('missing_arm_landmarks');
      expect(res.coachingMessageTh).toContain('ไม่พบข้อศอกและข้อมือข้างที่ฝึก');
      // Crucial: Must NEVER show false elbow-flex warning
      expect(res.coachingMessageTh).not.toContain('อย่าเกร็งหรืองอข้อศอก');
      expect(res.formRating).toBe('warning');
      expect(res.completedReps).toBe(0);
    });

    it('2.2 triggers missing_shoulder when shoulder is out of frame', () => {
      const config = {
        ...SHOULDER_PENDULUM_PRESET,
        side: 'right' as const,
      };

      const machine = new RepStateMachine(config);
      const skel = createMockSkeleton();

      // Right shoulder (12) is invisible or missing
      skel[12] = { x: 0.5, y: 0.5, z: 0.0, visibility: 0.3 };
      skel[14] = { x: 0.5, y: 0.7, z: 0.0, visibility: 0.8 };
      skel[16] = { x: 0.5, y: 0.85, z: 0.0, visibility: 0.8 };

      const res = machine.evaluate(skel, 1000);

      expect(res.readinessStatus).toBe('missing_shoulder');
      expect(res.coachingMessageTh).toContain('ไม่พบหัวไหล่ในภาพ');
      expect(res.coachingMessageTh).not.toContain('อย่าเกร็งหรืองอข้อศอก');
      expect(res.formRating).toBe('warning');
    });

    it('2.3 evaluates circular pendulum when all required arm landmarks have high visibility', () => {
      const config = {
        ...SHOULDER_PENDULUM_PRESET,
        side: 'right' as const,
        pendulumMechanics: {
          ...SHOULDER_PENDULUM_PRESET.pendulumMechanics!,
          minCycleDurationSec: 0.4,
          maxCycleDurationSec: 5.0,
        },
      };

      const machine = new RepStateMachine(config);
      const skel = createMockSkeleton();

      // Forward tilt posture (hip 24 at (0.5, 0.7), shoulder 12 at (0.68, 0.35))
      // Arm hanging straight (elbow 14 at (0.68, 0.55), wrist 16 at (0.68, 0.75))
      skel[24] = { x: 0.5, y: 0.7, z: 0.0, visibility: 0.95 }; // Right hip
      skel[12] = { x: 0.68, y: 0.35, z: 0.0, visibility: 0.95 }; // Right shoulder
      skel[14] = { x: 0.68, y: 0.55, z: 0.0, visibility: 0.95 }; // Right elbow
      skel[16] = { x: 0.68, y: 0.75, z: 0.0, visibility: 0.95 }; // Right wrist

      const res = machine.evaluate(skel, 1000);

      expect(res.readinessStatus).toBe('ready');
      // Should show initial pendulum guidance, not missing arm or bent elbow
      expect(res.coachingMessageTh).toContain('วงกลม');
    });
  });

  describe('3. Side Toggle (Right Arm vs Left Arm) & 10 Reps Completion', () => {
    it('3.1 switches tracking to left arm when setSide is called', () => {
      const config = {
        ...SHOULDER_PENDULUM_PRESET,
        side: 'right' as const,
      };

      const machine = new RepStateMachine(config);

      // Switch to left arm
      machine.setSide('left');

      const skel = createMockSkeleton();
      // Right arm visible, but Left arm out of frame
      skel[12] = { x: 0.4, y: 0.3, z: 0.0, visibility: 0.9 }; // R.Shoulder
      skel[14] = { x: 0.4, y: 0.5, z: 0.0, visibility: 0.9 }; // R.Elbow
      skel[16] = { x: 0.4, y: 0.7, z: 0.0, visibility: 0.9 }; // R.Wrist

      skel[11] = { x: 0.6, y: 0.3, z: 0.0, visibility: 0.9 }; // L.Shoulder
      skel[13] = { x: 0.6, y: 0.5, z: 0.0, visibility: 0.2 }; // L.Elbow (missing!)
      skel[15] = { x: 0.6, y: 0.7, z: 0.0, visibility: 0.1 }; // L.Wrist (missing!)

      const res = machine.evaluate(skel, 1000);
      expect(res.readinessStatus).toBe('missing_arm_landmarks');
      expect(res.coachingMessageTh).toContain('ไม่พบข้อศอกและข้อมือข้างที่ฝึก');
    });

    it('3.2 completes 10 full circular reps on right arm when tracking is valid', () => {
      const config = {
        ...SHOULDER_PENDULUM_PRESET,
        defaultPrescription: { repsPerSet: 10, totalSets: 1, restBetweenSetsSec: 30 },
        pendulumMechanics: {
          ...SHOULDER_PENDULUM_PRESET.pendulumMechanics!,
          minCycleDurationSec: 0.4,
          maxCycleDurationSec: 5.0,
        },
      };

      const machine = new RepStateMachine(config);
      let currentTime = 1000;
      const hip = { x: 0.5, y: 0.7, z: 0.0 };
      const shoulder = { x: 0.68, y: 0.35, z: 0.0 };
      const elbow = { x: 0.68, y: 0.55, z: 0.0 };
      const centerX = 0.68;
      const centerY = 0.75;
      const radius = 0.08;

      for (let rep = 1; rep <= 10; rep++) {
        const steps = 16;
        for (let s = 0; s <= steps; s++) {
          const theta = (2 * Math.PI * s) / steps;
          const wristX = centerX + radius * Math.cos(theta);
          const wristY = centerY + radius * Math.sin(theta);

          const skel = createMockSkeleton();
          skel[24] = hip;
          skel[12] = shoulder;
          skel[14] = elbow;
          skel[16] = { x: wristX, y: wristY, z: 0.0 };

          machine.evaluate(skel, currentTime);
          currentTime += 40; // 40ms * 16 steps = 640ms per circle (>= 0.4s min duration)
        }
      }

      const finalRes = machine.evaluate(createMockSkeleton(), currentTime);
      expect(finalRes.completedReps).toBe(10);
      expect(finalRes.isExerciseCompleted).toBe(true);
    });

    it('3.3 evaluateFrame alias processes frame successfully with moderate visibility (0.45)', () => {
      const config = {
        ...SHOULDER_PENDULUM_PRESET,
        side: 'left' as const,
      };
      const machine = new RepStateMachine(config);
      const skel = createMockSkeleton();

      // Moderate visibility (0.45) on left side joints
      skel[11] = { x: 0.68, y: 0.35, z: 0.0, visibility: 0.45 }; // L.Shoulder
      skel[13] = { x: 0.68, y: 0.55, z: 0.0, visibility: 0.45 }; // L.Elbow
      skel[15] = { x: 0.68, y: 0.75, z: 0.0, visibility: 0.45 }; // L.Wrist
      skel[23] = { x: 0.5, y: 0.7, z: 0.0, visibility: 0.45 };  // L.Hip

      const res = machine.evaluateFrame(skel, skel, 2000);
      expect(res.readinessStatus).toBe('ready');
      expect(res.accuracyPct).toBeDefined();
      expect(res.severity).toBeDefined();
      expect(isNaN(res.currentAngleDeg)).toBe(false);
    });

    it('3.4 adaptively synthesizes arm trajectory when seated at desk and wrist is below screen edge (elbow visible)', () => {
      const config = {
        ...SHOULDER_PENDULUM_PRESET,
        side: 'right' as const,
      };
      const machine = new RepStateMachine(config);
      const skel = createMockSkeleton();

      // Right shoulder and elbow visible, but wrist occluded at desk edge (y > 1.0 or low visibility)
      skel[12] = { x: 0.5, y: 0.35, z: 0.0, visibility: 0.90 }; // R.Shoulder
      skel[14] = { x: 0.5, y: 0.65, z: 0.0, visibility: 0.85 }; // R.Elbow
      skel[16] = { x: 0.5, y: 1.05, z: 0.0, visibility: 0.15 }; // R.Wrist (below frame)
      skel[24] = { x: 0.45, y: 0.75, z: 0.0, visibility: 0.85 }; // R.Hip

      const res = machine.evaluate(skel, 1500);
      // Crucial: Must NOT be permanently blocked with missing_arm_landmarks when elbow is clearly visible
      expect(res.readinessStatus).toBe('ready');
      expect(res.accuracyPct).toBeDefined();
      expect(isNaN(res.currentAngleDeg)).toBe(false);
    });
  });
});

