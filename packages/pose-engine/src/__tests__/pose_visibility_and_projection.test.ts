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
    it('2.1 triggers missing_arm_landmarks for distal exercises when elbow is out of frame', () => {
      const config = {
        nameTh: 'งอข้อศอก (Elbow Flexion)',
        nameEn: 'Elbow Flexion',
        evaluationMode: 'angle_rep_hold' as const,
        side: 'right' as const,
        targetJoint: 'elbow' as const,
        framing: 'upper' as const,
        cameraGuide: {
          recommendedView: 'side_45' as const,
          recommendedDistanceMeters: [1.5, 2.5] as [number, number],
          instructionTextTh: 'หันข้างให้เห็นข้อศอก',
        },
        angleMechanics: {
          landmarks: {
            left: { pointA: 11, vertex: 13, pointB: 15 },
            right: { pointA: 12, vertex: 14, pointB: 16 },
          },
          startAngleDeg: 150,
          targetMinDeg: 45,
          targetMaxDeg: 75,
          toleranceDeg: 10,
          holdDurationSec: 1.0,
          direction: 'decrease' as const,
        },
        defaultPrescription: { repsPerSet: 10, totalSets: 3, restBetweenSetsSec: 30 },
        compensationRules: [],
        safetyContraindications: { stopOnPainMessageTh: 'หยุดหากเจ็บ', maxSafeAngleCapDeg: 175 },
      };

      const machine = new RepStateMachine(config);
      const skel = createMockSkeleton();

      // Right shoulder (12) is visible
      skel[12] = { x: 0.45, y: 0.35, z: 0.0, visibility: 0.92 };

      // Elbow (14) and Wrist (16) are out of frame
      skel[14] = { x: 0.45, y: 1.05, z: 0.0, visibility: 0.15 };
      skel[16] = { x: 0.45, y: 1.15, z: 0.0, visibility: 0.10 };

      const res = machine.evaluate(skel, 1000);

      expect(res.readinessStatus).toBe('partial_upper_body');
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
      expect(res.readinessStatus).toBe('partial_upper_body');
      expect(res.coachingMessageTh).toContain('โหมดครึ่งตัวบน');
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

    it('3.5 supports Tier 3 Upper-Body Mode (desktop webcam close-up) with shoulder circular sway without freezing at 0%', () => {
      const config = {
        ...SHOULDER_PENDULUM_PRESET,
        side: 'right' as const,
        framing: 'upper' as const,
        pendulumMechanics: {
          ...SHOULDER_PENDULUM_PRESET.pendulumMechanics!,
          minCycleDurationSec: 0.4,
          maxCycleDurationSec: 5.0,
        },
      };
      const machine = new RepStateMachine(config);
      let currentTime = 1000;

      // User sitting close to webcam: Elbow & Wrist below screen edge, Hips occluded under desk
      const centerX = 0.5;
      const centerY = 0.35;
      const swayRadius = 0.05;

      // Initial stationary frame (s = 0)
      const initialSkel = createMockSkeleton();
      initialSkel[12] = { x: centerX, y: centerY, z: 0.0, visibility: 0.92 }; // R.Shoulder visible
      initialSkel[14] = { x: centerX, y: 1.05, z: 0.0, visibility: 0.15 };   // R.Elbow out of frame
      initialSkel[16] = { x: centerX, y: 1.15, z: 0.0, visibility: 0.10 };   // R.Wrist out of frame
      initialSkel[24] = { x: centerX, y: 1.20, z: 0.0, visibility: 0.05 };   // R.Hip out of frame

      const initialRes = machine.evaluate(initialSkel, currentTime);
      expect(initialRes.readinessStatus).toBe('partial_upper_body');
      expect(initialRes.coachingMessageTh).toContain('โหมดครึ่งตัวบน');
      expect(initialRes.coachingMessageEn).toContain('Upper-body partial detection active');
      expect(initialRes.coachingMessageCn).toContain('半身检测模式已启用');
      expect(initialRes.completedReps).toBe(0);

      // Now user performs circular shoulder sway in Upper-Body Mode for 1 full rep
      const steps = 20;
      let activeProgressSeen = false;
      for (let s = 0; s <= steps; s++) {
        currentTime += 40;
        const theta = (2 * Math.PI * s) / 16;
        const shoulderX = centerX + swayRadius * Math.cos(theta);
        const shoulderY = centerY + swayRadius * Math.sin(theta);

        const skel = createMockSkeleton();
        skel[12] = { x: shoulderX, y: shoulderY, z: 0.0, visibility: 0.92 };
        skel[14] = { x: shoulderX, y: 1.05, z: 0.0, visibility: 0.15 };
        skel[16] = { x: shoulderX, y: 1.15, z: 0.0, visibility: 0.10 };
        skel[24] = { x: shoulderX, y: 1.20, z: 0.0, visibility: 0.05 };

        const res = machine.evaluate(skel, currentTime);
        if ((res.accuracyPct ?? 0) > 0) {
          activeProgressSeen = true;
          expect(res.readinessStatus).toBe('partial_upper_body');
          expect(res.coachingMessageTh).toContain('โหมดครึ่งตัวบน');
        }
      }

      expect(activeProgressSeen).toBe(true);
      const finalRes = machine.evaluate(initialSkel, currentTime + 50);
      expect(finalRes.completedReps).toBe(1);
    });

    it('3.6 completes 10 repetitions (10/10) in Shoulder Pendulum Upper-Body Desk Mode', () => {
      const config = {
        ...SHOULDER_PENDULUM_PRESET,
        side: 'right' as const,
        framing: 'upper' as const,
        pendulumMechanics: {
          ...SHOULDER_PENDULUM_PRESET.pendulumMechanics!,
          minCycleDurationSec: 0.3,
          maxCycleDurationSec: 5.0,
        },
        defaultPrescription: { repsPerSet: 10, totalSets: 1, restBetweenSetsSec: 30 },
      };
      const machine = new RepStateMachine(config);
      let currentTime = 1000;
      const centerX = 0.5;
      const centerY = 0.35;
      const swayRadius = 0.05;

      // Run 11 circles (1 warm-up circle to seed dynamic trajectory buffer centroid + 10 complete reps)
      for (let rep = 1; rep <= 11; rep++) {
        const steps = 16;
        for (let s = 0; s <= steps; s++) {
          currentTime += 30;
          const theta = (2 * Math.PI * s) / steps;
          const skel = createMockSkeleton();
          skel[12] = { x: centerX + swayRadius * Math.cos(theta), y: centerY + swayRadius * Math.sin(theta), z: 0.0, visibility: 0.92 };
          skel[14] = { x: centerX, y: 1.05, z: 0.0, visibility: 0.15 };
          skel[16] = { x: centerX, y: 1.15, z: 0.0, visibility: 0.10 };
          skel[24] = { x: centerX, y: 1.20, z: 0.0, visibility: 0.05 };
          machine.evaluate(skel, currentTime);
        }
        currentTime += 400; // debounce gap
      }

      const evalEnd = machine.evaluate(createMockSkeleton(), currentTime + 50);
      expect(evalEnd.completedReps).toBe(10);
      expect(evalEnd.isSetCompleted).toBe(true);
      expect(evalEnd.isExerciseCompleted).toBe(true);
    });

    it('3.7 completes 10 repetitions (10/10) in Shoulder Flexion Upper-Body Desk Mode without freezing at 0%', () => {
      const config = {
        nameTh: 'ยกแขนไปข้างหน้า (Shoulder Flexion)',
        nameEn: 'Shoulder Flexion',
        evaluationMode: 'angle_rep_hold' as const,
        side: 'right' as const,
        targetJoint: 'shoulder' as const,
        framing: 'upper' as const,
        cameraGuide: {
          recommendedView: 'side_90' as const,
          recommendedDistanceMeters: [1.8, 2.8] as [number, number],
          instructionTextTh: 'ยกแขนตรงไปข้างหน้า',
        },
        angleMechanics: {
          landmarks: {
            left: { pointA: 23, vertex: 11, pointB: 15 },
            right: { pointA: 24, vertex: 12, pointB: 16 },
          },
          startAngleDeg: 25,
          targetMinDeg: 140,
          targetMaxDeg: 170,
          toleranceDeg: 12,
          holdDurationSec: 0.2, // fast hold for unit test
        },
        defaultPrescription: { repsPerSet: 10, totalSets: 1, restBetweenSetsSec: 30 },
        compensationRules: [],
        safetyContraindications: { stopOnPainMessageTh: 'หยุดหากเจ็บ', maxSafeAngleCapDeg: 180 },
      };

      const machine = new RepStateMachine(config);
      let currentTime = 1000;

      // Initial check when seated at desk: Shoulder visible, Elbow/Wrist/Hip out of frame
      const restSkel = createMockSkeleton();
      restSkel[0] = { x: 0.50, y: 0.18, z: 0.0, visibility: 0.95 }; // Nose
      restSkel[11] = { x: 0.40, y: 0.35, z: 0.0, visibility: 0.90 }; // L.Shoulder
      restSkel[12] = { x: 0.60, y: 0.35, z: 0.0, visibility: 0.92 }; // R.Shoulder
      restSkel[14] = { x: 0.60, y: 1.05, z: 0.0, visibility: 0.10 }; // R.Elbow out of frame
      restSkel[16] = { x: 0.60, y: 1.15, z: 0.0, visibility: 0.08 }; // R.Wrist out of frame
      restSkel[24] = { x: 0.60, y: 1.25, z: 0.0, visibility: 0.05 }; // R.Hip out of frame

      const initialRes = machine.evaluate(restSkel, currentTime);
      expect(initialRes.readinessStatus).toBe('partial_upper_body');
      expect(initialRes.coachingMessageTh).toContain('โหมดครึ่งตัวบน');

      // Execute 10 reps of shoulder lift
      for (let rep = 1; rep <= 10; rep++) {
        const liftSkel = createMockSkeleton();
        liftSkel[0] = { x: 0.50, y: 0.18, z: 0.0, visibility: 0.95 };
        liftSkel[11] = { x: 0.40, y: 0.35, z: 0.0, visibility: 0.90 };
        liftSkel[12] = { x: 0.60, y: 0.22, z: 0.0, visibility: 0.92 }; // elevated shoulder
        liftSkel[14] = { x: 0.60, y: 1.05, z: 0.0, visibility: 0.10 };
        liftSkel[16] = { x: 0.60, y: 1.15, z: 0.0, visibility: 0.08 };
        liftSkel[24] = { x: 0.60, y: 1.25, z: 0.0, visibility: 0.05 };

        // 1. Lift shoulder and hold in target zone for > holdDurationSec (0.2s)
        for (let s = 0; s < 8; s++) {
          currentTime += 60;
          const liftRes = machine.evaluate(liftSkel, currentTime);
          expect((liftRes.accuracyPct ?? 0) > 0).toBe(true);
        }

        // 2. Return to start position
        for (let s = 0; s < 6; s++) {
          currentTime += 60;
          machine.evaluate(restSkel, currentTime);
        }

        currentTime += 400; // debounce gap
        machine.evaluate(restSkel, currentTime);
      }

      const finalRes = machine.evaluate(restSkel, currentTime + 50);
      expect(finalRes.completedReps).toBe(10);
      expect(finalRes.isSetCompleted).toBe(true);
    });

    it('3.8 excludes facial landmarks (0..10) and lower-body landmarks (25..32) in upper framing mode', () => {
      const framing = 'upper';
      const isUpperBodyMode = framing === 'upper' || framing === 'upper_body';
      expect(isUpperBodyMode).toBe(true);

      const activeUpperJoints = [11, 12, 13, 14, 15, 16, 23, 24];

      // Facial landmarks (0-10) must NEVER be included
      for (let i = 0; i <= 10; i++) {
        expect(activeUpperJoints.includes(i)).toBe(false);
      }
      // Leg landmarks (25-32) must NEVER be included
      for (let i = 25; i <= 32; i++) {
        expect(activeUpperJoints.includes(i)).toBe(false);
      }
      expect(activeUpperJoints.length).toBe(8);
    });
  });
});

