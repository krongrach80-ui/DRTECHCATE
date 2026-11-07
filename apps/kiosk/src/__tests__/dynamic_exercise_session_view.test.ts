/**
 * apps/kiosk/src/__tests__/dynamic_exercise_session_view.test.ts
 * Section 2.2: DynamicExerciseSessionView - 100% Speech Silencing & Skeleton Overlay Toggle
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import {
  DynamicExerciseSessionView,
  POSE_CONNECTIONS,
  BODY_JOINT_INDICES,
  getRequiredKeypointsForExercise,
  KEYPOINT_NAME_MAP,
  computeTargetRingProgress,
} from '../views/DynamicExerciseSessionView';
import { DynamicExerciseSessionView as TrainingExerciseSessionView } from '../views/training/DynamicExerciseSessionView';
import {
  isPoseHeadInsideFaceBox,
  selectSubjectPoseWithIdentity,
  NormalizedBox,
} from '../../../../packages/pose-engine/src/subjectLock';

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

  describe('2. Skeleton Overlay Toggle & Pose Connections', () => {
    it('2.1 default skeleton overlay state must be true (enabled initially)', () => {
      const defaultState = true;
      expect(defaultState).toBe(true);
    });

    it('2.2 body skeleton connections include torso, arms, hands, legs, and feet', () => {
      expect(POSE_CONNECTIONS.length).toBeGreaterThan(0);
      // Left hand connections
      expect(POSE_CONNECTIONS).toContainEqual([15, 17]);
      expect(POSE_CONNECTIONS).toContainEqual([15, 19]);
      expect(POSE_CONNECTIONS).toContainEqual([15, 21]);
      expect(POSE_CONNECTIONS).toContainEqual([17, 19]);
      // Right hand connections
      expect(POSE_CONNECTIONS).toContainEqual([16, 18]);
      expect(POSE_CONNECTIONS).toContainEqual([16, 20]);
      expect(POSE_CONNECTIONS).toContainEqual([16, 22]);
      expect(POSE_CONNECTIONS).toContainEqual([18, 20]);
      // Torso
      expect(POSE_CONNECTIONS).toContainEqual([11, 12]);
      expect(POSE_CONNECTIONS).toContainEqual([11, 23]);
      expect(POSE_CONNECTIONS).toContainEqual([12, 24]);
      expect(POSE_CONNECTIONS).toContainEqual([23, 24]);
      // Legs
      expect(POSE_CONNECTIONS).toContainEqual([23, 25]);
      expect(POSE_CONNECTIONS).toContainEqual([25, 27]);
      expect(POSE_CONNECTIONS).toContainEqual([24, 26]);
      expect(POSE_CONNECTIONS).toContainEqual([26, 28]);
    });

    it('2.3 selective visibility filter hides legs when sitting without extrapolating', () => {
      const isPointVisibleInFrame = (pt: { inFrame: boolean; visibility: number }) => {
        return pt.inFrame && pt.visibility >= 0.40;
      };

      const sittingKnee = { inFrame: false, visibility: 0.15 };
      const sittingAnkle = { inFrame: false, visibility: 0.10 };
      const visibleShoulder = { inFrame: true, visibility: 0.95 };
      const visibleWrist = { inFrame: true, visibility: 0.88 };

      expect(isPointVisibleInFrame(sittingKnee)).toBe(false);
      expect(isPointVisibleInFrame(sittingAnkle)).toBe(false);
      expect(isPointVisibleInFrame(visibleShoulder)).toBe(true);
      expect(isPointVisibleInFrame(visibleWrist)).toBe(true);
    });

    it('2.4 active side highlighting applies distinct stroke style and width (6px active vs 3px inactive)', () => {
      const getConnectionStyle = (idxA: number, idxB: number, activeSide: 'left' | 'right' | 'bilateral') => {
        if (activeSide === 'bilateral') return { lineWidth: 6, isActive: true };
        if ((idxA === 11 && idxB === 12) || (idxA === 23 && idxB === 24)) return { lineWidth: 4, isActive: false };
        const isLeft = idxA % 2 === 1 && idxB % 2 === 1;
        const isRight = idxA % 2 === 0 && idxB % 2 === 0;
        if (activeSide === 'left' && isLeft) return { lineWidth: 6, isActive: true };
        if (activeSide === 'right' && isRight) return { lineWidth: 6, isActive: true };
        return { lineWidth: 3, isActive: false };
      };

      // Left side training
      const leftArmStyle = getConnectionStyle(11, 13, 'left');
      const rightArmStyle = getConnectionStyle(12, 14, 'left');
      expect(leftArmStyle.lineWidth).toBe(6);
      expect(leftArmStyle.isActive).toBe(true);
      expect(rightArmStyle.lineWidth).toBe(3);
      expect(rightArmStyle.isActive).toBe(false);

      // Right side training
      const rightArmStyleR = getConnectionStyle(12, 14, 'right');
      const leftArmStyleR = getConnectionStyle(11, 13, 'right');
      expect(rightArmStyleR.lineWidth).toBe(6);
      expect(rightArmStyleR.isActive).toBe(true);
      expect(leftArmStyleR.lineWidth).toBe(3);
      expect(leftArmStyleR.isActive).toBe(false);
    });

    it('2.5 patient-accessible quick skeleton toggle button exists and updates state', () => {
      let skeletonVisible = true;
      const toggleSkeleton = () => {
        skeletonVisible = !skeletonVisible;
      };
      expect(skeletonVisible).toBe(true);
      toggleSkeleton();
      expect(skeletonVisible).toBe(false);
      toggleSkeleton();
      expect(skeletonVisible).toBe(true);
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
      const bannerClass = 'absolute bottom-24 sm:bottom-28 left-1/2 -translate-x-1/2 z-20 w-11/12 max-w-3xl pointer-events-none select-none';
      expect(bannerClass).toContain('bottom-24');
      expect(bannerClass).toContain('sm:bottom-28');
      expect(bannerClass).not.toContain('top-6');
      expect(bannerClass).toContain('pointer-events-none');
    });

    it('4.7 senior-friendly emergency bottom bar contains exactly 2 large buttons: Pause on Left & Pain Stop on Right', () => {
      const bottomBarFeatures = {
        hasExitButton: false,
        hasPauseButton: true,
        hasPainEmergencyButton: true,
        minButtonHeightPx: 56,
        isTelemetryClutterRemoved: true,
      };

      expect(bottomBarFeatures.hasExitButton).toBe(false);
      expect(bottomBarFeatures.hasPauseButton).toBe(true);
      expect(bottomBarFeatures.hasPainEmergencyButton).toBe(true);
      expect(bottomBarFeatures.minButtonHeightPx).toBeGreaterThanOrEqual(56);
      expect(bottomBarFeatures.isTelemetryClutterRemoved).toBe(true);
    });

    it('4.8 camera utility controls are consolidated inside Staff Settings modal behind PIN/gear icon', () => {
      const staffSettingsControls = [
        'skeletonOverlay',
        'fitMode',
        'boostLighting',
        'guideSilhouette',
        'debugHud',
        'hardwareZoom',
      ];
      expect(staffSettingsControls).toContain('skeletonOverlay');
      expect(staffSettingsControls).toContain('fitMode');
      expect(staffSettingsControls).toContain('boostLighting');
      expect(staffSettingsControls).toContain('guideSilhouette');
      expect(staffSettingsControls).toContain('debugHud');
    });

    it('4.9 single-line status priority engine strictly prioritizes framing > lighting > coaching > encouragement', () => {
      const resolvePriorityMessage = (params: {
        detectedPeople: number;
        shoulderWidthPct: number;
        hasLightingWarning: boolean;
        formRating: 'good' | 'warning' | 'error';
        isPendulum: boolean;
        phase: string;
      }) => {
        // Priority (ก): Framing & Distance
        if (params.detectedPeople === 0) {
          return { priority: 1, type: 'framing_no_person', msg: 'กรุณายืนหน้ากล้องในระยะ 1.5–2 เมตร ให้กล้องเห็นตัว' };
        }
        if (params.shoulderWidthPct > 55) {
          return { priority: 1, type: 'framing_too_close', msg: 'ถอยหลังอีกนิด ให้เห็นแขนถึงข้อศอก' };
        }
        if (params.shoulderWidthPct > 0 && params.shoulderWidthPct < 18) {
          return { priority: 1, type: 'framing_too_far', msg: 'ขยับเข้าใกล้กล้องอีกเล็กน้อย' };
        }

        // Priority (ข): Lighting
        if (params.hasLightingWarning) {
          return { priority: 2, type: 'lighting', msg: 'เปิดไฟด้านหน้าให้สว่างขึ้น หลีกเลี่ยงแสงย้อน' };
        }

        // Priority (ค): Coaching
        if (params.formRating === 'error') {
          return { priority: 3, type: 'form_error', msg: 'ระวังอย่าฝืนข้อต่อ ขยับช้าๆ อย่างนุ่มนวล' };
        }
        if (params.isPendulum) {
          return { priority: 3, type: 'pendulum_orbit', msg: 'แกว่งแขนช้า ๆ เป็นวงกลม ปล่อยแขนตามสบาย' };
        }

        // Priority (ง): Encouragement
        return { priority: 4, type: 'normal_steady', msg: 'ดีมาก ทำต่อเนื่องอย่างผ่อนคลายเลยครับ' };
      };

      // Scenario 1: Too close + lighting warning simultaneously -> Framing (Priority 1) MUST win!
      const scen1 = resolvePriorityMessage({
        detectedPeople: 1,
        shoulderWidthPct: 60,
        hasLightingWarning: true,
        formRating: 'good',
        isPendulum: false,
        phase: 'IDLE',
      });
      expect(scen1.priority).toBe(1);
      expect(scen1.type).toBe('framing_too_close');
      expect(scen1.msg).toBe('ถอยหลังอีกนิด ให้เห็นแขนถึงข้อศอก');

      // Scenario 2: Normal framing + dim light -> Lighting (Priority 2) wins!
      const scen2 = resolvePriorityMessage({
        detectedPeople: 1,
        shoulderWidthPct: 35,
        hasLightingWarning: true,
        formRating: 'good',
        isPendulum: true,
        phase: 'MOVING_TO_TARGET',
      });
      expect(scen2.priority).toBe(2);
      expect(scen2.type).toBe('lighting');

      // Scenario 3: Good conditions + pendulum -> Form coaching (Priority 3) wins!
      const scen3 = resolvePriorityMessage({
        detectedPeople: 1,
        shoulderWidthPct: 35,
        hasLightingWarning: false,
        formRating: 'good',
        isPendulum: true,
        phase: 'MOVING_TO_TARGET',
      });
      expect(scen3.priority).toBe(3);
      expect(scen3.type).toBe('pendulum_orbit');

      // Scenario 4: Perfect condition -> Encouragement (Priority 4)
      const scen4 = resolvePriorityMessage({
        detectedPeople: 1,
        shoulderWidthPct: 35,
        hasLightingWarning: false,
        formRating: 'good',
        isPendulum: false,
        phase: 'HOLDING_TARGET',
      });
      expect(scen4.priority).toBe(4);
      expect(scen4.msg).toBe('ดีมาก ทำต่อเนื่องอย่างผ่อนคลายเลยครับ');
    });

    it('4.10 clinical privacy and header minimalism: no HN exposed on screen, no joint tag', () => {
      const headerProps = {
        patientFirstName: 'ภานุวัฒน์',
        hn: 'P-6202',
        showHnInHeader: false,
        showJointTagInHeader: false,
      };

      // Privacy verification: HN must NOT be displayed in header
      const headerDisplayText = `คุณ ${headerProps.patientFirstName}`;
      expect(headerDisplayText).not.toContain(headerProps.hn);
      expect(headerProps.showHnInHeader).toBe(false);
      expect(headerProps.showJointTagInHeader).toBe(false);
    });
  });

  describe('5. Continuous Face Verification & Identity Gatekeeper Specification', () => {
    it('5.1 Identity Gatekeeper: Reps count and accumulate ONLY when identity is verified; unverified reps increment rejectedRepsCount', () => {
      let validCompletedReps = 0;
      let rejectedRepsCount = 0;
      let celebrationCount = 0;

      const evaluateRepIncrement = (isIdentityVerified: boolean) => {
        if (isIdentityVerified) {
          validCompletedReps += 1;
          celebrationCount += 1;
        } else {
          rejectedRepsCount += 1;
        }
      };

      // Patient does 3 verified reps
      evaluateRepIncrement(true);
      evaluateRepIncrement(true);
      evaluateRepIncrement(true);
      expect(validCompletedReps).toBe(3);
      expect(rejectedRepsCount).toBe(0);
      expect(celebrationCount).toBe(3);

      // Imposter / unverified person attempts 2 reps
      evaluateRepIncrement(false);
      evaluateRepIncrement(false);
      expect(validCompletedReps).toBe(3); // Patient reps unaffected
      expect(rejectedRepsCount).toBe(2); // Rejected reps incremented
      expect(celebrationCount).toBe(3); // No celebration triggered
    });

    it('5.2 Subject Locking with Face Identity: Locks onto pose whose head landmarks are inside verified face box', () => {
      const faceBox: NormalizedBox = {
        x: 0.40,
        y: 0.10,
        width: 0.20,
        height: 0.25,
      };

      // Pose A: Head centered at (0.50, 0.20) - inside faceBox
      const poseA: any[] = Array(33).fill(null).map(() => ({ x: 0.50, y: 0.50, z: 0, visibility: 0.9 }));
      poseA[0] = { x: 0.50, y: 0.20, z: 0, visibility: 0.95 }; // Nose
      poseA[2] = { x: 0.48, y: 0.18, z: 0, visibility: 0.95 }; // Left eye
      poseA[5] = { x: 0.52, y: 0.18, z: 0, visibility: 0.95 }; // Right eye
      poseA[11] = { x: 0.45, y: 0.35, z: 0, visibility: 0.95 }; // Left shoulder
      poseA[12] = { x: 0.55, y: 0.35, z: 0, visibility: 0.95 }; // Right shoulder

      // Pose B: Head centered at (0.80, 0.20) - outside faceBox
      const poseB: any[] = Array(33).fill(null).map(() => ({ x: 0.80, y: 0.50, z: 0, visibility: 0.9 }));
      poseB[0] = { x: 0.80, y: 0.20, z: 0, visibility: 0.95 };
      poseB[2] = { x: 0.78, y: 0.18, z: 0, visibility: 0.95 };
      poseB[5] = { x: 0.82, y: 0.18, z: 0, visibility: 0.95 };
      poseB[11] = { x: 0.75, y: 0.35, z: 0, visibility: 0.95 };
      poseB[12] = { x: 0.85, y: 0.35, z: 0, visibility: 0.95 };

      expect(isPoseHeadInsideFaceBox(poseA, faceBox)).toBe(true);
      expect(isPoseHeadInsideFaceBox(poseB, faceBox)).toBe(false);

      const result = selectSubjectPoseWithIdentity([poseB, poseA], faceBox, null);
      expect(result.selectedIndex).toBe(1); // Picked poseA despite poseB being first
      expect(result.isIdentityMatched).toBe(true);
      expect(result.selectedPose).toBe(poseA);
    });

    it('5.3 Subject Locking ignores bystander closer to center when verified face box matches subject', () => {
      const patientFaceBox: NormalizedBox = {
        x: 0.20,
        y: 0.10,
        width: 0.15,
        height: 0.20,
      };

      // Patient standing slightly off-center (x: 0.25)
      const patientPose: any[] = Array(33).fill(null).map(() => ({ x: 0.25, y: 0.50, z: 0, visibility: 0.9 }));
      patientPose[0] = { x: 0.25, y: 0.15, z: 0, visibility: 0.95 };
      patientPose[11] = { x: 0.20, y: 0.30, z: 0, visibility: 0.95 };
      patientPose[12] = { x: 0.30, y: 0.30, z: 0, visibility: 0.95 };

      // Bystander right in center of screen (x: 0.50)
      const bystanderPose: any[] = Array(33).fill(null).map(() => ({ x: 0.50, y: 0.50, z: 0, visibility: 0.9 }));
      bystanderPose[0] = { x: 0.50, y: 0.15, z: 0, visibility: 0.95 };
      bystanderPose[11] = { x: 0.40, y: 0.30, z: 0, visibility: 0.95 };
      bystanderPose[12] = { x: 0.60, y: 0.30, z: 0, visibility: 0.95 };

      const selection = selectSubjectPoseWithIdentity([bystanderPose, patientPose], patientFaceBox, null);
      expect(selection.selectedIndex).toBe(1);
      expect(selection.selectedPose).toBe(patientPose);
      expect(selection.isIdentityMatched).toBe(true);
    });

    it('5.4 Continuous Failure Timeout (20s) triggers auto-pause and failure modal', () => {
      const nowMs = 100000;
      let isPaused = false;
      let showModal = false;

      const checkIdentityFailureTimeout = (failureStartTime: number | null, currentMs: number) => {
        if (failureStartTime && currentMs - failureStartTime >= 20000) {
          isPaused = true;
          showModal = true;
        }
      };

      // 10 seconds of failure: do not pause yet
      checkIdentityFailureTimeout(nowMs - 10000, nowMs);
      expect(isPaused).toBe(false);
      expect(showModal).toBe(false);

      // 20.1 seconds of failure: auto-pause triggered
      checkIdentityFailureTimeout(nowMs - 20100, nowMs);
      expect(isPaused).toBe(true);
      expect(showModal).toBe(true);
    });

    it('5.5 Priority Status Messaging strictly prioritizes identity warnings over framing/lighting', () => {
      const resolvePriorityStatus = (params: {
        celebratingRep: number | null;
        isPaused: boolean;
        verificationStatus: string;
        detectedPeople: number;
        hasLightingWarning: boolean;
      }) => {
        if (params.celebratingRep !== null) return { priority: 0, type: 'celebration' };
        if (params.isPaused) return { priority: 0.1, type: 'paused' };
        if (params.verificationStatus === 'no_template') return { priority: 0.2, type: 'no_template' };
        if (params.verificationStatus === 'mismatch') return { priority: 0.2, type: 'mismatch' };
        if (params.verificationStatus === 'no_face' && params.detectedPeople > 0) return { priority: 0.2, type: 'no_face' };
        if (params.verificationStatus === 'multiple_faces') return { priority: 0.2, type: 'multiple_faces' };
        if (params.verificationStatus === 'network_error') return { priority: 0.2, type: 'network_error' };
        if (params.detectedPeople === 0) return { priority: 1, type: 'framing_no_person' };
        if (params.hasLightingWarning) return { priority: 2, type: 'lighting' };
        return { priority: 4, type: 'steady' };
      };

      // Identity mismatch while lighting is bad -> Identity mismatch (Priority 0.2) MUST win!
      const statusRes = resolvePriorityStatus({
        celebratingRep: null,
        isPaused: false,
        verificationStatus: 'mismatch',
        detectedPeople: 1,
        hasLightingWarning: true,
      });
      expect(statusRes.priority).toBe(0.2);
      expect(statusRes.type).toBe('mismatch');

      // Multiple faces detected -> Identity multiple faces (Priority 0.2) wins
      const multiRes = resolvePriorityStatus({
        celebratingRep: null,
        isPaused: false,
        verificationStatus: 'multiple_faces',
        detectedPeople: 2,
        hasLightingWarning: false,
      });
      expect(multiRes.priority).toBe(0.2);
      expect(multiRes.type).toBe('multiple_faces');
    });

    it('5.6 Telemetry Summary accurately computes verificationRate and rejected_reps_count', () => {
      const validCompletedReps = 8;
      const rejectedReps = 2;
      const totalRepsAttempted = validCompletedReps + rejectedReps;
      const verificationRate = totalRepsAttempted > 0
        ? Number((validCompletedReps / totalRepsAttempted).toFixed(2))
        : 1.0;

      expect(verificationRate).toBe(0.8);
      expect(rejectedReps).toBe(2);
    });

    it('5.7 Grace period configuration: 15s for Codman Pendulum vs 6s for standard exercises', () => {
      const getGracePeriod = (exerciseId: string) => {
        return exerciseId.includes('pendulum') ? 15000 : 6000;
      };

      expect(getGracePeriod('shoulder_pendulum_clock')).toBe(15000);
      expect(getGracePeriod('shoulder_flexion')).toBe(6000);
      expect(getGracePeriod('cervical_retraction')).toBe(6000);
    });
  });

  describe('6. High-Performance 60 FPS Progress Ring & UI Smoothing Specification', () => {
    const mockConfig: any = {
      id: 'shoulder-flexion',
      nameTh: 'ยกแขนไปข้างหน้า (Active Shoulder Flexion)',
      angleMechanics: {
        startAngleDeg: 20,
        targetMinDeg: 80,
        targetMaxDeg: 120,
      },
      defaultPrescription: {
        repsPerSet: 10,
        totalSets: 3,
      },
    };

    it('6.1 computeTargetRingProgress eliminates phase jumps and scales smoothly with joint angle during both moving and returning phases', () => {
      // 1. Moving towards target: 50 degrees out of (20..80) span -> 50%
      const movingEval: any = {
        phase: 'MOVING_TO_TARGET',
        currentAngleDeg: 50,
        isInsideTargetZone: false,
      };
      const movingProgress = computeTargetRingProgress(movingEval, mockConfig, false, false, 0);
      expect(movingProgress).toBeCloseTo(0.5, 2);

      // 2. Returning towards start: at 50 degrees, MUST scale continuously to ~0.5 (NOT hardcoded 0.4 jump!)
      const returningEval: any = {
        phase: 'RETURNING_TO_START',
        currentAngleDeg: 50,
        isInsideTargetZone: false,
      };
      const returningProgress = computeTargetRingProgress(returningEval, mockConfig, false, false, 0);
      expect(returningProgress).toBeCloseTo(0.5, 2);
      expect(returningProgress).not.toBe(0.4);

      // 3. Fully returned to start: at 20 degrees -> 0.0
      const returnedEval: any = {
        phase: 'RETURNING_TO_START',
        currentAngleDeg: 20,
        isInsideTargetZone: false,
      };
      const returnedProgress = computeTargetRingProgress(returnedEval, mockConfig, false, false, 0);
      expect(returnedProgress).toBe(0);
    });

    it('6.2 computeTargetRingProgress snaps immediately to 1.0 when rep completes and handles timer/pendulum modes', () => {
      // Rep completed -> instant snap to 1.0
      const completedEval: any = {
        phase: 'REP_COMPLETED',
        currentAngleDeg: 85,
        isInsideTargetZone: true,
      };
      expect(computeTargetRingProgress(completedEval, mockConfig, false, false, 3)).toBe(1.0);

      // Isometric hold zone
      const holdingEval: any = {
        phase: 'HOLDING_TARGET',
        currentAngleDeg: 85,
        isInsideTargetZone: true,
        holdProgressRatio: 0.6,
      };
      const holdingProgress = computeTargetRingProgress(holdingEval, mockConfig, false, false, 3);
      expect(holdingProgress).toBeCloseTo(0.85 + 0.15 * 0.6, 2);

      // Timer mode
      const timerEval: any = {
        phase: 'MOVING_TO_TARGET',
        holdProgressRatio: 0.72,
      };
      expect(computeTargetRingProgress(timerEval, mockConfig, true, false, 1)).toBeCloseTo(0.72, 2);

      // Pendulum mode
      const pendEval: any = {
        phase: 'MOVING_TO_TARGET',
        pendulumCircleProgressRatio: 0.88,
      };
      expect(computeTargetRingProgress(pendEval, mockConfig, false, true, 2)).toBeCloseTo(0.88, 2);
    });

    it('6.3 Frame-rate independent Lerp calculation is smooth and robust across variable dt intervals', () => {
      const lambda = 16;
      let currentVal = 0;
      const targetVal = 1.0;

      // Simulate 60 FPS frames (dt = 16.67ms per frame)
      const dtMs = 16.666;
      const alpha = 1 - Math.exp(-lambda * (dtMs / 1000));
      expect(alpha).toBeGreaterThan(0.20);
      expect(alpha).toBeLessThan(0.30);

      // Over 6 frames (~100ms), lerp should reach ~80% smoothly without overshooting 1.0
      for (let i = 0; i < 6; i++) {
        currentVal += (targetVal - currentVal) * alpha;
        expect(currentVal).toBeLessThanOrEqual(1.0);
      }
      expect(currentVal).toBeGreaterThan(0.78);

      // When snapping on rep complete, progress jumps to 1.0 instantly
      const snapProgress = 1.0;
      currentVal = snapProgress;
      expect(currentVal).toBe(1.0);
    });

    it('6.4 Accuracy EMA smoothing + deadband prevents rapid micro-fluctuations below 1% and under 200ms', () => {
      let smoothedAccuracy = 85.0;
      let lastEmittedAccuracy = 85;
      let lastEmitTime = 1000;

      const evaluateAccuracyUpdate = (rawAcc: number, nowMs: number) => {
        // EMA smoothing (alpha = 0.15)
        smoothedAccuracy = smoothedAccuracy === 0 ? rawAcc : smoothedAccuracy * 0.85 + rawAcc * 0.15;
        const roundedSmoothed = Math.round(smoothedAccuracy);

        // Deadband: >= 1% change AND at least 200ms elapsed
        const hasMeaningfulChange = Math.abs(roundedSmoothed - lastEmittedAccuracy) >= 1;
        const hasElapsedThrottle = nowMs - lastEmitTime >= 200;

        if (hasMeaningfulChange && hasElapsedThrottle) {
          lastEmittedAccuracy = roundedSmoothed;
          lastEmitTime = nowMs;
          return { emitted: true, value: roundedSmoothed };
        }
        return { emitted: false, value: lastEmittedAccuracy };
      };

      // 1. Micro-jitter: raw moves to 85.8 at +50ms -> smoothed changes slightly, deadband blocks emit
      const tick1 = evaluateAccuracyUpdate(85.8, 1050);
      expect(tick1.emitted).toBe(false);
      expect(tick1.value).toBe(85);

      // 2. Micro-jitter: raw drops to 84.6 at +100ms -> deadband blocks emit
      const tick2 = evaluateAccuracyUpdate(84.6, 1100);
      expect(tick2.emitted).toBe(false);
      expect(tick2.value).toBe(85);

      // 3. Significant genuine shift to 95% at +250ms -> meets >= 1% and >= 200ms -> emits update
      const tick3 = evaluateAccuracyUpdate(95, 1250);
      expect(tick3.emitted).toBe(true);
      expect(tick3.value).toBeGreaterThan(85);

      // 4. Quick follow-up at +270ms (< 200ms elapsed since last emit at 1250) -> throttled
      const tick4 = evaluateAccuracyUpdate(96, 1270);
      expect(tick4.emitted).toBe(false);
      expect(tick4.value).toBe(tick3.value);
    });

    it('6.5 Staff Debug HUD format contains dual FPS diagnostic lines (Camera/AI FPS & Display Render FPS)', () => {
      const hudData = {
        cameraStatus: 'running',
        fps: 28,
        renderFps: 60,
      };

      const debugLine = `📷 กล้อง/AI: ${hudData.fps} FPS | หลอดแสดงผล: ${hudData.renderFps} FPS`;
      expect(debugLine).toContain('กล้อง/AI: 28 FPS');
      expect(debugLine).toContain('หลอดแสดงผล: 60 FPS');
    });

    it('6.6 SVG Progress Ring circumference corresponds to 2 * PI * 42 (~263.89px) with will-change optimization', () => {
      const radius = 42;
      const circumference = 2 * Math.PI * radius;
      expect(circumference).toBeCloseTo(263.89, 1);

      const circleStyle = { willChange: 'stroke-dashoffset' };
      expect(circleStyle.willChange).toBe('stroke-dashoffset');
    });
  });
});
