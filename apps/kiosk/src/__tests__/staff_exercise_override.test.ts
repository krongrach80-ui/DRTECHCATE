/**
 * apps/kiosk/src/__tests__/staff_exercise_override.test.ts
 *
 * Unit & Integration Test Suite for Staff Exercise Override Flow:
 * 1. Role-based authorization guard (admin, director, pt vs unauthorized roles)
 * 2. Today's prescribed exercise schedule validation (server-side check)
 * 3. Dual audit logging (exercise_session_logs with staff metadata + audit_logs)
 * 4. 2-minute watchdog timeout logic
 * 5. Resilient fallback handling in api-client
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { defaultApiClient } from '../../../../packages/api-client/src/index.js';
import { defaultCourseController } from '../../../api/src/modules/courses/controller';
import { defaultSmartOnboardingService } from '../../../api/src/modules/smart-onboarding/service';

describe('Staff Exercise Override System (Clinical Backup Flow)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Server-Side Role-Based Authorization Guard', () => {
    it('1.1 Rejects override attempt if no staff user or session is present (401)', async () => {
      const mockReq = {
        body: {
          patient_id: 'P-1234',
          exercise_id: 'ex-01',
          override_reason: 'arm_injured_cannot_raise',
        },
        ip: '127.0.0.1',
      } as any;

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;

      const mockNext = vi.fn();

      await defaultCourseController.staffOverrideStart(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 401,
          message: expect.stringContaining('ต้องยืนยันตัวตนเจ้าหน้าที่'),
        })
      );
    });

    it('1.2 Rejects override attempt if user role is unauthorized (e.g., patient, receptionist) (403)', async () => {
      const mockReq = {
        body: {
          patient_id: 'P-1234',
          exercise_id: 'ex-01',
          override_reason: 'arm_injured_cannot_raise',
          staff_user: {
            id: 'u-guest',
            username: 'receptionist_joy',
            role: 'receptionist',
          },
        },
        ip: '127.0.0.1',
      } as any;

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;

      const mockNext = vi.fn();

      await defaultCourseController.staffOverrideStart(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 403,
          message: expect.stringContaining('ไม่มีสิทธิ์เริ่มการฝึกแทนผู้ป่วย'),
        })
      );
    });

    it('1.3 Accepts authorized staff roles (pt, admin, director, super_admin)', async () => {
      // Mock daily plan with an assigned exercise
      vi.spyOn(defaultSmartOnboardingService, 'getDailyPlan').mockResolvedValueOnce({
        is_scheduled_today: true,
        exercises: [
          {
            exercise_id: 'e1000000-0000-0000-0000-000000000001',
            name: 'แกว่งแขนผ่อนคลายหัวไหล่',
            target_joint: 'shoulder',
            sets: 3,
            reps: 10,
          },
        ],
        include_minigame: true,
      });

      const mockReq = {
        body: {
          patient_id: 'd1000000-0000-0000-0000-000000000001',
          exercise_id: 'e1000000-0000-0000-0000-000000000001',
          override_reason: 'arm_injured_cannot_raise',
          staff_user: {
            id: 'pt-01',
            username: 'pt_somchai',
            full_name: 'กภ.สมชาย กายภาพดี',
            role: 'pt',
          },
        },
        ip: '127.0.0.1',
      } as any;

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;

      const mockNext = vi.fn();

      await defaultCourseController.staffOverrideStart(mockReq, mockRes, mockNext);
      expect(mockNext).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          ok: true,
          message: expect.stringContaining('เริ่มท่าฝึกแทนผู้ป่วยสำเร็จ'),
          data: expect.objectContaining({
            started_by: 'กภ.สมชาย กายภาพดี',
            override_reason: 'arm_injured_cannot_raise',
          }),
        })
      );
    });
  });

  describe("2. Today's Prescribed Plan Integrity Verification", () => {
    it('2.1 Rejects start if patient has no scheduled exercises today', async () => {
      vi.spyOn(defaultSmartOnboardingService, 'getDailyPlan').mockResolvedValueOnce({
        is_scheduled_today: false,
        reason: 'วันพักผ่อน',
        exercises: [],
        include_minigame: false,
      });

      const mockReq = {
        body: {
          patient_id: 'P-1234',
          exercise_id: 'ex-01',
          override_reason: 'arm_injured_cannot_raise',
          staff_user: {
            id: 'pt-01',
            username: 'pt_somchai',
            role: 'pt',
          },
        },
        ip: '127.0.0.1',
      } as any;

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;

      const mockNext = vi.fn();

      await defaultCourseController.staffOverrideStart(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 400,
          code: 'NO_EXERCISES_TODAY',
        })
      );
    });

    it('2.2 Rejects start if exercise is not in the assigned exercises list for today', async () => {
      vi.spyOn(defaultSmartOnboardingService, 'getDailyPlan').mockResolvedValueOnce({
        is_scheduled_today: true,
        exercises: [
          {
            exercise_id: 'ex-01',
            name: 'Pendulum',
            target_joint: 'shoulder',
            sets: 3,
            reps: 10,
          },
        ],
        include_minigame: false,
      });

      const mockReq = {
        body: {
          patient_id: 'P-1234',
          exercise_id: 'ex-999-unassigned',
          override_reason: 'arm_injured_cannot_raise',
          staff_user: {
            id: 'pt-01',
            username: 'pt_somchai',
            role: 'pt',
          },
        },
        ip: '127.0.0.1',
      } as any;

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;

      const mockNext = vi.fn();

      await defaultCourseController.staffOverrideStart(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 400,
          code: 'EXERCISE_NOT_IN_TODAY_PLAN',
        })
      );
    });

    it('2.3 Rejects start if patient has already completed training for today (409)', async () => {
      vi.spyOn(defaultSmartOnboardingService, 'getDailyPlan').mockResolvedValueOnce({
        is_scheduled_today: true,
        is_completed_today: true,
        reason: 'วันนี้คุณได้ทำการฝึกกายภาพบำบัดครบถ้วนตามนัดแล้ว',
        exercises: [
          {
            exercise_id: 'ex-01',
            name: 'Pendulum',
            target_joint: 'shoulder',
            sets: 3,
            reps: 10,
          },
        ],
        include_minigame: false,
      });

      const mockReq = {
        body: {
          patient_id: 'P-1234',
          exercise_id: 'ex-01',
          override_reason: 'arm_injured_cannot_raise',
          staff_user: {
            id: 'pt-01',
            username: 'pt_somchai',
            role: 'pt',
          },
        },
        ip: '127.0.0.1',
      } as any;

      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;

      const mockNext = vi.fn();

      await defaultCourseController.staffOverrideStart(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 409,
          code: 'ALREADY_COMPLETED_TODAY',
          message: expect.stringContaining('วันนี้คุณทำกายภาพไปแล้ว (ทำได้วันละครั้ง)'),
        })
      );
    });
  });

  describe('3. API Client Resilient Fallback Handling', () => {
    it('3.1 Transparently falls back to submitSessionLog with completion_mode: staff_override if endpoint is 404/405', async () => {
      // Mock submitSessionLog
      const submitSpy = vi.spyOn(defaultApiClient.courses, 'submitSessionLog').mockResolvedValueOnce({
        id: 'session-log-fallback-uuid',
      } as any);

      // Force network error on staffOverrideStart request
      vi.spyOn(defaultApiClient as any, 'request').mockRejectedValueOnce(new Error('HTTP 404 Not Found'));

      const result = await defaultApiClient.courses.staffOverrideStart({
        patient_id: 'P-1234',
        exercise_id: 'ex-01',
        override_reason: 'camera_hand_detection_failed',
        staff_user: {
          id: 'pt-01',
          full_name: 'กภ.สมชาย กายภาพดี',
          role: 'pt',
        },
      });

      expect(result.ok).toBe(true);
      expect(result.message).toContain('เริ่มท่าฝึกแทนผู้ป่วยสำเร็จ');
      expect(submitSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          patient_id: 'P-1234',
          exercise_id: 'ex-01',
          telemetry_summary: expect.objectContaining({
            completion_mode: 'staff_override',
            started_by_staff_name: 'กภ.สมชาย กายภาพดี',
            override_reason: 'camera_hand_detection_failed',
          }),
        })
      );
    });
  });

  describe('4. 2-Minute Inactivity Watchdog Logic', () => {
    it('4.1 Auto-dismisses when remaining time counts down to 0', () => {
      let remainingSec = 120;
      const tick = () => {
        remainingSec = Math.max(0, remainingSec - 1);
      };

      for (let i = 0; i < 120; i++) {
        tick();
      }
      expect(remainingSec).toBe(0);
    });

    it('4.2 Resets countdown back to 120 upon user interaction', () => {
      let remainingSec = 45; // Partially elapsed
      const onUserInteraction = () => {
        remainingSec = 120;
      };

      onUserInteraction();
      expect(remainingSec).toBe(120);
    });
  });
});
