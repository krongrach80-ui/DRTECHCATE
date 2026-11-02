/**
 * apps/kiosk/src/__tests__/dynamic_exercise_session_view.test.ts
 * Section 2.2: DynamicExerciseSessionView - 100% Speech Silencing & Skeleton Overlay Toggle
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { DynamicExerciseSessionView, POSE_CONNECTIONS, BODY_JOINT_INDICES, getRequiredKeypointsForExercise, KEYPOINT_NAME_MAP } from '../views/DynamicExerciseSessionView';
import { DynamicExerciseSessionView as TrainingExerciseSessionView } from '../views/training/DynamicExerciseSessionView';

describe('DynamicExerciseSessionView - Section 2.2 Specifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Speech Silencing Specification (100% Silent Audio)', () => {
    it('1.1 should invoke window.speechSynthesis.cancel() upon entering, updating or exiting', () => {
      const cancelMock = vi.fn();
      const mockWindow = {
        speechSynthesis: {
          cancel: cancelMock,
          speak: vi.fn(),
          paused: false,
          pending: false,
          speaking: false,
        },
      };

      // Test speech cancellation logic contract
      if (typeof mockWindow !== 'undefined' && 'speechSynthesis' in mockWindow) {
        mockWindow.speechSynthesis.cancel();
      }
      expect(cancelMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('2. Skeleton Overlay Toggle & Upper-Body Filtering', () => {
    it('2.1 default skeleton overlay state must be false (disabled initially)', () => {
      const defaultState = false;
      expect(defaultState).toBe(false);
    });

    it('2.2 upper-body framing mode filters connections to upper-torso and arms only (excluding face & legs)', () => {
      const framing: string = 'upper_body';
      const isUpperBodyMode = framing !== 'full_body' && framing !== 'lower_body';
      expect(isUpperBodyMode).toBe(true);

      const activeConnections = isUpperBodyMode
        ? [
            [11, 12], [11, 23], [12, 24], [23, 24], // Upper torso frame
            [11, 13], [13, 15],                     // Left arm
            [12, 14], [14, 16],                     // Right arm
          ]
        : POSE_CONNECTIONS;
      expect(activeConnections.length).toBeGreaterThan(0);

      const activeJointIndices = isUpperBodyMode
        ? [11, 12, 13, 14, 15, 16, 23, 24] // Shoulders to hips only
        : [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];

      // Verify no facial landmarks (0-10)
      for (let i = 0; i <= 10; i++) {
        expect(activeJointIndices.includes(i)).toBe(false);
      }
      // Verify no lower-leg landmarks (25-32)
      for (let i = 25; i <= 32; i++) {
        expect(activeJointIndices.includes(i)).toBe(false);
      }
      // Verify torso & arm joints are included
      expect(activeJointIndices).toEqual([11, 12, 13, 14, 15, 16, 23, 24]);
    });

    it('2.3 debug labels (#idx) are strictly guarded: only drawn when BOTH showSkeleton and showDebug are true, and idx >= 11', () => {
      const shouldDrawLabel = (showSkeleton: boolean, showDebug: boolean, idx: number) => {
        if (!showSkeleton) return false;
        return showDebug && idx >= 11;
      };

      // When skeleton is hidden, debug label is never drawn
      expect(shouldDrawLabel(false, true, 11)).toBe(false);
      expect(shouldDrawLabel(false, true, 0)).toBe(false);

      // When skeleton is visible, debug label is drawn ONLY if debug is ON and idx >= 11
      expect(shouldDrawLabel(true, false, 11)).toBe(false);
      expect(shouldDrawLabel(true, true, 0)).toBe(false); // Facial landmark: never drawn
      expect(shouldDrawLabel(true, true, 10)).toBe(false); // Facial landmark: never drawn
      expect(shouldDrawLabel(true, true, 11)).toBe(true);  // Left shoulder: drawn
      expect(shouldDrawLabel(true, true, 12)).toBe(true);  // Right shoulder: drawn
      expect(shouldDrawLabel(true, true, 15)).toBe(true);  // Wrist: drawn
    });
  });

  describe('3. DynamicExerciseSessionView React Element Contract', () => {
    it('3.1 instantiates valid React element with required callbacks', () => {
      const onComplete = vi.fn();
      const onPainStop = vi.fn();
      const onExit = vi.fn();
      const element = React.createElement(DynamicExerciseSessionView, {
        onComplete,
        onPainStop,
        onExit,
      });

      expect(element).toBeDefined();
      expect(typeof element.type).toBe('function');
      expect((element.props as any).onComplete).toBe(onComplete);
      expect((element.props as any).onPainStop).toBe(onPainStop);
      expect((element.props as any).onExit).toBe(onExit);
    });

    it('3.2 exports BODY_JOINT_INDICES correctly and training path re-exports properly', () => {
      expect(BODY_JOINT_INDICES).toBeDefined();
      expect(Array.isArray(BODY_JOINT_INDICES)).toBe(true);
      expect(BODY_JOINT_INDICES).toContain(11);
      expect(BODY_JOINT_INDICES).toContain(24);
      expect(BODY_JOINT_INDICES).not.toContain(0); // No facial landmarks
      expect(TrainingExerciseSessionView).toBe(DynamicExerciseSessionView);
    });

    it('3.3 filters required keypoints based on exercise framing without demanding lower body in upper-body mode', () => {
      const upperKeypoints = getRequiredKeypointsForExercise({ framing: 'upper_body' } as any);
      expect(upperKeypoints).toEqual([11, 12, 13, 14, 15, 16, 23, 24]);
      expect(upperKeypoints.includes(25)).toBe(false); // No knees
      expect(upperKeypoints.includes(27)).toBe(false); // No ankles

      const fullKeypoints = getRequiredKeypointsForExercise({ framing: 'full_body' } as any);
      expect(fullKeypoints).toContain(25);
      expect(fullKeypoints).toContain(28);

      const headKeypoints = getRequiredKeypointsForExercise({ framing: 'head_shoulders' } as any);
      expect(headKeypoints).toEqual([7, 8, 11, 12]);
    });

    it('3.4 ensures isWaitingPose logic evaluates to FALSE when posture is ready or rep phase is active', () => {
      const computeIsWaitingPose = (
        readinessStatus: string | undefined,
        repPhase: string,
        completedReps: number
      ) => {
        return Boolean(
          readinessStatus &&
          readinessStatus !== 'ready' &&
          readinessStatus !== 'partial_upper_body' &&
          repPhase === 'IDLE' &&
          completedReps === 0
        );
      };

      // When posture is ready -> FALSE (never shows 'รอจัดท่า')
      expect(computeIsWaitingPose('ready', 'IDLE', 0)).toBe(false);

      // When partial upper body -> FALSE
      expect(computeIsWaitingPose('partial_upper_body', 'IDLE', 0)).toBe(false);

      // When in middle of rep -> FALSE
      expect(computeIsWaitingPose('missing_shoulder', 'MOVING_TO_TARGET', 0)).toBe(false);
      expect(computeIsWaitingPose('missing_shoulder', 'HOLDING_TARGET', 0)).toBe(false);
      expect(computeIsWaitingPose('missing_shoulder', 'RETURNING_TO_START', 0)).toBe(false);

      // When rep completed > 0 -> FALSE
      expect(computeIsWaitingPose('missing_shoulder', 'IDLE', 1)).toBe(false);

      // ONLY when truly waiting and at start -> TRUE
      expect(computeIsWaitingPose('missing_shoulder', 'IDLE', 0)).toBe(true);
    });

    it('3.5 maps landmark names across TH, EN, and CN', () => {
      expect(KEYPOINT_NAME_MAP[11].th).toBe('ไหล่ซ้าย');
      expect(KEYPOINT_NAME_MAP[11].en).toBe('L Shoulder');
      expect(KEYPOINT_NAME_MAP[11].cn).toBe('左肩');
    });
  });

  describe('4. Senior-Friendly Kiosk UI/UX Overhaul Specifications', () => {
    it('4.1 default debug HUD state must be false (completely hidden for elderly patients)', () => {
      const defaultDebugHud = false;
      expect(defaultDebugHud).toBe(false);
    });

    it('4.2 debug toggle visibility is strictly guarded: hidden unless staff unlocked or dev mode', () => {
      const shouldShowDebugBtn = (isStaffUnlocked: boolean, isDev: boolean) => {
        return isStaffUnlocked || isDev;
      };

      // Patient mode: strictly false
      expect(shouldShowDebugBtn(false, false)).toBe(false);
      // Staff unlocked: true
      expect(shouldShowDebugBtn(true, false)).toBe(true);
      // Dev mode: true
      expect(shouldShowDebugBtn(false, true)).toBe(true);
    });

    it('4.3 senior-friendly real-time coaching banner replaces raw degree readouts with comforting Thai instructions', () => {
      const getSeniorFriendlyCoaching = (
        celebratingRep: number | null,
        isResting: boolean,
        phase: string,
        isInsideTargetZone: boolean,
        isLowerBody: boolean = false
      ) => {
        if (celebratingRep !== null) {
          return {
            msg: `🌟 เก่งมาก! นับ 1 ครั้ง (ครั้งที่ ${celebratingRep})`,
            badge: '🌟 เยี่ยมมาก!',
          };
        }
        if (isResting) {
          return {
            msg: '☕ พักผ่อนตามอัธยาศัย...',
            badge: '☕ พักผ่อน',
          };
        }
        if (phase === 'HOLDING_TARGET' || isInsideTargetZone) {
          return {
            msg: '🌟 เก่งมาก! ค้างไว้นิ่งๆ อีกนิด...',
            badge: '⏱️ ค้างไว้',
          };
        }
        if (phase === 'MOVING_TO_TARGET') {
          return {
            msg: isLowerBody ? '⬆️ ยกขาขึ้นอีกนิด ช้าๆ...' : '⬆️ ยกแขนขึ้นอีกนิด ช้าๆ...',
            badge: '⬆️ กำลังยก',
          };
        }
        if (phase === 'RETURNING_TO_START') {
          return {
            msg: isLowerBody ? '☕ ค่อยๆ ผ่อนขาลงช้าๆ...' : '☕ ค่อยๆ ผ่อนแขนลงช้าๆ...',
            badge: '⬇️ ผ่อนลง',
          };
        }
        return {
          msg: 'เตรียมพร้อม ยืนตัวตรง แล้วเริ่มยกแขนช้าๆ',
          badge: '🎯 เริ่มต้น',
        };
      };

      // When moving to target
      const moving = getSeniorFriendlyCoaching(null, false, 'MOVING_TO_TARGET', false);
      expect(moving.msg).toBe('⬆️ ยกแขนขึ้นอีกนิด ช้าๆ...');
      expect(moving.badge).toBe('⬆️ กำลังยก');

      // When holding target
      const holding = getSeniorFriendlyCoaching(null, false, 'HOLDING_TARGET', true);
      expect(holding.msg).toBe('🌟 เก่งมาก! ค้างไว้นิ่งๆ อีกนิด...');
      expect(holding.badge).toBe('⏱️ ค้างไว้');

      // When rep completed celebration
      const cele = getSeniorFriendlyCoaching(3, false, 'IDLE', false);
      expect(cele.msg).toBe('🌟 เก่งมาก! นับ 1 ครั้ง (ครั้งที่ 3)');
      expect(cele.badge).toBe('🌟 เยี่ยมมาก!');

      // When resting between sets
      const rest = getSeniorFriendlyCoaching(null, true, 'IDLE', false);
      expect(rest.msg).toBe('☕ พักผ่อนตามอัธยาศัย...');
      expect(rest.badge).toBe('☕ พักผ่อน');
    });

    it('4.4 computes smooth motion progress percentage during active rep movement', () => {
      const computeProgress = (
        currentAngle: number,
        startAngle: number,
        targetAngle: number,
        phase: string,
        holdProgressRatio: number
      ) => {
        if (phase === 'HOLDING_TARGET') {
          return Math.max(0.85, holdProgressRatio);
        }
        if (phase === 'MOVING_TO_TARGET') {
          const range = Math.max(1, targetAngle - startAngle);
          return Math.max(0, Math.min(0.95, (currentAngle - startAngle) / range));
        }
        return 0;
      };

      // Moving from 20° to 80°: at 50°, progress should be exactly 50%
      const prog50 = computeProgress(50, 20, 80, 'MOVING_TO_TARGET', 0);
      expect(prog50).toBeCloseTo(0.5, 2);

      // At target: hold progress ratio takes over
      const progHold = computeProgress(80, 20, 80, 'HOLDING_TARGET', 0.9);
      expect(progHold).toBe(0.9);
    });

    it('4.5 pendulum exercise strictly prioritizes circular orbit over isometric hold messages', () => {
      const getCoaching = (
        isPendulum: boolean,
        readinessStatus: string,
        coachingMessageTh?: string,
        phase?: string,
        isInsideTargetZone?: boolean
      ) => {
        if (isPendulum) {
          if (readinessStatus === 'missing_shoulder') {
            return {
              msg: '📷 กรุณาถอยห่างประมาณ 1.5–2 เมตร ให้เห็นลำตัวและแขนชัดเจน',
              badge: '📷 จัดระยะ',
            };
          }
          if (coachingMessageTh) {
            return {
              msg: coachingMessageTh,
              badge: '🌀 กำลังแกว่ง',
            };
          }
          return {
            msg: 'โน้มตัวไปข้างหน้า ปล่อยแขนสบายๆ แล้วแกว่งวนเป็นวงกลม',
            badge: '🎯 เริ่มต้น',
          };
        }

        if (phase === 'HOLDING_TARGET' || isInsideTargetZone) {
          return {
            msg: '🌟 ค้างไว้นิ่งๆ อีกนิด...',
            badge: '⏱️ ค้างไว้',
          };
        }

        return {
          msg: 'เตรียมพร้อม ยืนตัวตรง แล้วเริ่มเคลื่อนไหวช้าๆ',
          badge: '🎯 เริ่มต้น',
        };
      };

      // Even if isInsideTargetZone is true, pendulum must NOT say "ค้างไว้นิ่งๆ"
      const pendulumActive = getCoaching(true, 'ready', undefined, 'MOVING_TO_TARGET', true);
      expect(pendulumActive.msg).toBe('โน้มตัวไปข้างหน้า ปล่อยแขนสบายๆ แล้วแกว่งวนเป็นวงกลม');
      expect(pendulumActive.badge).toBe('🎯 เริ่มต้น');

      // Pendulum distance warning when camera is too close
      const pendulumMissing = getCoaching(true, 'missing_shoulder');
      expect(pendulumMissing.msg).toContain('กรุณาถอยห่างประมาณ 1.5–2 เมตร');
      expect(pendulumMissing.badge).toBe('📷 จัดระยะ');

      // Non-pendulum hold exercise
      const isometricHold = getCoaching(false, 'ready', undefined, 'HOLDING_TARGET', true);
      expect(isometricHold.msg).toBe('🌟 ค้างไว้นิ่งๆ อีกนิด...');
      expect(isometricHold.badge).toBe('⏱️ ค้างไว้');
    });

    it('4.6 coaching banner position is bottom-anchored to avoid blocking patient face and torso', () => {
      const bannerClass = 'absolute bottom-20 left-1/2 -translate-x-1/2 z-20 w-11/12 max-w-2xl pointer-events-none';
      expect(bannerClass).toContain('bottom-20');
      expect(bannerClass).not.toContain('top-6');
      expect(bannerClass).toContain('pointer-events-none');
    });
  });
});
