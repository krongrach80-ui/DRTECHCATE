/**
 * packages/pose-engine/src/__tests__/exercise_coaching_cues.test.ts
 *
 * Verification suite for exercise-specific coaching messages, directional icons,
 * skeleton head joints/connections, and neutral fallbacks across movement phases.
 */

import { describe, it, expect } from 'vitest';
import {
  getExerciseCoachingCues,
  EXERCISE_COACHING_REGISTRY,
} from '../presets/exercises.config';
import {
  HEAD_POSE_CONNECTIONS,
  HEAD_JOINT_INDICES,
  KEYPOINT_NAME_MAP,
} from '../../../../apps/kiosk/src/views/DynamicExerciseSessionView';

describe('Exercise Coaching Cues & Directional Indicators', () => {
  describe('1. Seated Cervical Rotation Specific Coaching', () => {
    it('provides head rotation coaching with directional left arrow for left side', () => {
      const cues = getExerciseCoachingCues('seated-cervical-rotation', 'left');
      expect(cues.movingMessageTh).toBe('ค่อยๆ หันศีรษะไปทางซ้ายช้าๆ...');
      expect(cues.movingIcon).toBe('⬅️');
      expect(cues.movingMessageEn).toBe('Slowly rotate head to the left...');
      expect(cues.movingMessageCn).toBe('缓慢向左转头...');
      expect(cues.movingMessageTh).not.toContain('แขน');
      expect(cues.movingMessageTh).not.toContain('ขา');
    });

    it('provides head rotation coaching with directional right arrow for right side', () => {
      const cues = getExerciseCoachingCues('seated-cervical-rotation', 'right');
      expect(cues.movingMessageTh).toBe('ค่อยๆ หันศีรษะไปทางขวาช้าๆ...');
      expect(cues.movingIcon).toBe('➡️');
      expect(cues.movingMessageEn).toBe('Slowly rotate head to the right...');
      expect(cues.movingMessageCn).toBe('缓慢向右转头...');
      expect(cues.movingMessageTh).not.toContain('แขน');
      expect(cues.movingMessageTh).not.toContain('ขา');
    });

    it('provides seated posture for idle and return cues for cervical rotation', () => {
      const cues = getExerciseCoachingCues('seated-cervical-rotation');
      expect(cues.idleMessageTh).toBe('นั่งตัวตรง มองตรงมาที่กล้อง');
      expect(cues.idleIcon).toBe('👤');
      expect(cues.returningMessageTh).toBe('ค่อยๆ หันกลับมามองตรง');
      expect(cues.returningIcon).toBe('↔️');
      expect(cues.holdingMessageTh).toBe('ค้างไว้สักครู่');
      expect(cues.framingMessageTh).toBe('กรุณาให้เห็นใบหน้า ศีรษะ และหัวไหล่ชัดเจน');
    });
  });

  describe('2. All 10 Catalog Exercises have Specific Visual & Text Cues', () => {
    const catalogExerciseIds = [
      'standing-shoulder-abduction',
      'shoulder-abduction',
      'shoulder-flexion',
      'standing-bilateral-shoulder-flexion',
      'seated-knee-extension',
      'standing-calf-raise',
      'seated-cervical-rotation',
      'elbow-flexion',
      'trunk-flexion',
      'shoulder-pendulum',
    ];

    it.each(catalogExerciseIds)('exercise "%s" has complete trilingual cues and valid icons', (id) => {
      const cues = getExerciseCoachingCues(id, 'right');
      expect(cues.idleMessageTh).toBeTruthy();
      expect(cues.idleMessageEn).toBeTruthy();
      expect(cues.idleMessageCn).toBeTruthy();
      expect(cues.idleIcon).toBeTruthy();

      expect(cues.movingMessageTh).toBeTruthy();
      expect(cues.movingMessageEn).toBeTruthy();
      expect(cues.movingMessageCn).toBeTruthy();
      expect(cues.movingIcon).toBeTruthy();

      expect(cues.holdingMessageTh).toBeTruthy();
      expect(cues.holdingMessageEn).toBeTruthy();
      expect(cues.holdingMessageCn).toBeTruthy();
      expect(cues.holdingIcon).toBeTruthy();

      expect(cues.returningMessageTh).toBeTruthy();
      expect(cues.returningMessageEn).toBeTruthy();
      expect(cues.returningMessageCn).toBeTruthy();
      expect(cues.returningIcon).toBeTruthy();
    });

    it('lower-body exercises never instruct to raise arms', () => {
      const knee = getExerciseCoachingCues('seated-knee-extension');
      expect(knee.movingMessageTh).toContain('เข่า');
      expect(knee.movingMessageTh).not.toContain('แขน');

      const calf = getExerciseCoachingCues('standing-calf-raise');
      expect(calf.movingMessageTh).toContain('ส้นเท้า');
      expect(calf.movingMessageTh).not.toContain('แขน');
    });

    it('arm exercises instruct appropriately without referring to head or legs', () => {
      const shoulderAbduct = getExerciseCoachingCues('shoulder-abduction', 'left');
      expect(shoulderAbduct.movingMessageTh).toContain('กางแขน');
      expect(shoulderAbduct.movingIcon).toBe('↗️');

      const elbow = getExerciseCoachingCues('elbow-flexion', 'right');
      expect(elbow.movingMessageTh).toContain('ข้อศอก');
      expect(elbow.movingIcon).toBe('⤴️');
      expect(elbow.idleIcon).toBe('💪');
    });
  });

  describe('3. Neutral Fallback for Unconfigured or Custom Exercises', () => {
    it('returns organ-neutral message without assuming arm or leg', () => {
      const fallback = getExerciseCoachingCues('unknown-custom-exercise-xyz');
      expect(fallback.movingMessageTh).toBe('ทำท่าช้าๆ ตามภาพตัวอย่าง...');
      expect(fallback.movingMessageEn).toBe('Move smoothly as shown in the guide...');
      expect(fallback.movingMessageCn).toBe('请参考示例平稳做动作...');
      expect(fallback.movingIcon).toBe('🎯');

      expect(fallback.idleMessageTh).toBe('จัดท่าทางให้พร้อมตามภาพตัวอย่าง แล้วเริ่มทำช้าๆ');
      expect(fallback.idleIcon).toBe('✨');

      expect(fallback.returningMessageTh).toBe('ค่อยๆ ผ่อนกลับสู่ตำแหน่งเริ่มต้น');
      expect(fallback.returningIcon).toBe('↩️');

      expect(fallback.movingMessageTh).not.toContain('แขน');
      expect(fallback.movingMessageTh).not.toContain('ขา');
      expect(fallback.movingMessageTh).not.toContain('ศีรษะ');
    });

    it('handles null/undefined gracefully', () => {
      const cuesNull = getExerciseCoachingCues(null);
      expect(cuesNull.movingMessageTh).toBe('ทำท่าช้าๆ ตามภาพตัวอย่าง...');
      const cuesUndefined = getExerciseCoachingCues(undefined);
      expect(cuesUndefined.movingMessageTh).toBe('ทำท่าช้าๆ ตามภาพตัวอย่าง...');
    });
  });

  describe('4. Skeleton Head Joints & Connections for Cervical Movement', () => {
    it('defines head pose connections covering nose, ears, and neck bridge to shoulders', () => {
      expect(HEAD_POSE_CONNECTIONS).toEqual([
        [7, 0],
        [8, 0],
        [7, 8],
        [0, 11],
        [0, 12],
      ]);
    });

    it('defines head joint indices as 0 (nose), 7 (left ear), 8 (right ear)', () => {
      expect(HEAD_JOINT_INDICES).toEqual([0, 7, 8]);
    });

    it('includes nose/face in KEYPOINT_NAME_MAP', () => {
      expect(KEYPOINT_NAME_MAP[0]).toEqual({
        th: 'ใบหน้า/จมูก',
        en: 'Face/Nose',
        cn: '面部/鼻尖',
      });
    });
  });
});
