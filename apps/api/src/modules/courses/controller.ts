import { Request, Response, NextFunction } from 'express';
import { CourseService, defaultCourseService } from './service';
import {
  CreateCourseSchema,
  UpdateCourseSchema,
  CourseQuerySchema,
  TodayAppointmentsQuerySchema,
  CalendarViewQuerySchema,
  SessionLogInputSchema,
  SessionLogQuerySchema,
  StaffOverrideStartInputSchema,
} from './schema';
import { AppError } from '../../middleware/errorHandler';

export class CourseController {
  constructor(private service: CourseService = defaultCourseService) {}

  createCourse = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
      const input = CreateCourseSchema.parse(req.body);
      const course = await this.service.createCourse(input, req.user, req.ip);
      res.status(201).json({ ok: true, data: course });
    } catch (err) {
      next(err);
    }
  };

  createPrescriptionCourse = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
      const patientId = req.body.patient_id || req.body.patientId;
      const schedule = req.body.schedule || req.body;
      if (!patientId || !schedule) {
        throw new AppError('patient_id and schedule are required', 400, 'BAD_REQUEST');
      }
      const { defaultSmartOnboardingService } = await import('../smart-onboarding/service');
      const data = await defaultSmartOnboardingService.saveSchedule(patientId, schedule);
      res.status(201).json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  };

  getCourseById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
      const id = String(req.params.id);
      const course = await this.service.getCourseById(id, req.user);
      res.status(200).json({ ok: true, data: course });
    } catch (err) {
      next(err);
    }
  };

  updateCourse = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
      const id = String(req.params.id);
      const input = UpdateCourseSchema.parse(req.body);
      const course = await this.service.updateCourse(id, input, req.user, req.ip);
      res.status(200).json({ ok: true, data: course });
    } catch (err) {
      next(err);
    }
  };

  deleteCourse = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
      const id = String(req.params.id);
      await this.service.deleteCourse(id, req.user, req.ip);
      res.status(200).json({ ok: true, message: 'Course cancelled successfully' });
    } catch (err) {
      next(err);
    }
  };

  deleteCourseDay = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
      const id = String(req.params.id);
      const date = String(req.params.date);
      await this.service.deleteCourseDay(id, date, req.user);
      res.status(200).json({ ok: true, message: `Day ${date} removed from course successfully` });
    } catch (err) {
      next(err);
    }
  };

  listCourses = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
      const filter = CourseQuerySchema.parse(req.query);
      const courses = await this.service.listCourses(filter, req.user);
      res.status(200).json({ ok: true, data: courses });
    } catch (err) {
      next(err);
    }
  };

  getTodayAppointments = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
      const filter = TodayAppointmentsQuerySchema.parse(req.query);
      const appointments = await this.service.getTodayAppointments(filter, req.user);
      res.status(200).json({ ok: true, data: appointments });
    } catch (err) {
      next(err);
    }
  };

  getCalendarView = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
      const filter = CalendarViewQuerySchema.parse(req.query);
      const calendarData = await this.service.getCalendarView(filter, req.user);
      res.status(200).json({ ok: true, data: calendarData });
    } catch (err) {
      next(err);
    }
  };

  submitSessionLog = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = SessionLogInputSchema.parse(req.body);
      const log = await this.service.submitSessionLog(input, req.ip);
      res.status(201).json({ ok: true, data: log });
    } catch (err) {
      next(err);
    }
  };

  getSessionLogs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = SessionLogQuerySchema.parse(req.query);
      const logs = await this.service.getSessionLogs(query);
      res.status(200).json({ ok: true, data: logs });
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /api/courses/staff-override-start
   * Authoritative staff override initiation for physical therapy exercise session.
   * Enforces role authorization (admin/director/pt) and verifies exercise is assigned today.
   */
  staffOverrideStart = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = StaffOverrideStartInputSchema.parse(req.body);

      // 1. Authorization check: req.user or input.staff_user
      const user = req.user || (input.staff_user as any);
      if (!user) {
        throw new AppError('⛔ เข้าถึงไม่ได้: ต้องยืนยันตัวตนเจ้าหน้าที่ (Admin/PT) ก่อนเริ่มแทน', 401, 'UNAUTHORIZED');
      }

      const role = String(user.role || '').toLowerCase();
      const uname = String(user.username || '').toLowerCase();
      const isAllowedRole =
        role === 'admin' ||
        role === 'super_admin' ||
        role === 'director' ||
        uname === 'director' ||
        uname === 'admin' ||
        role === 'pt' ||
        role === 'therapist' ||
        uname.startsWith('pt');

      if (!isAllowedRole) {
        throw new AppError(
          '⛔ บัญชีนี้ไม่มีสิทธิ์เริ่มการฝึกแทนผู้ป่วย (อนุญาตเฉพาะ Admin, ผอ.รพ. และนักกายภาพบำบัด PT)',
          403,
          'FORBIDDEN'
        );
      }

      // 2. Validate against today's assigned plan for patient
      const { defaultSmartOnboardingService } = await import('../smart-onboarding/service');
      const plan = await defaultSmartOnboardingService.getDailyPlan(input.patient_id);

      if (!plan.is_scheduled_today || !plan.exercises || plan.exercises.length === 0) {
        throw new AppError(
          'ผู้ป่วยไม่มีตารางฝึกกายภาพสำหรับวันนี้ ไม่สามารถเริ่มท่าแทนได้',
          400,
          'NO_EXERCISES_TODAY'
        );
      }

      const targetExercise = plan.exercises.find((ex: any) =>
        ex.exercise_id === input.exercise_id ||
        ex.id === input.exercise_id ||
        ex.name === input.exercise_id ||
        ex.title === input.exercise_id
      );

      if (!targetExercise) {
        throw new AppError(
          'ท่าฝึกนี้ไม่ได้อยู่ในตารางนัดหมายของผู้ป่วยประจำวันนี้',
          400,
          'EXERCISE_NOT_IN_TODAY_PLAN'
        );
      }

      // 3. Dual audit log: exercise_session_logs + audit_logs
      const staffId = user.id || 'staff';
      const staffName = user.full_name || user.username || 'เจ้าหน้าที่';
      const staffRole = user.role || 'pt';

      const reasonThMap: Record<string, string> = {
        arm_injured_cannot_raise: 'ผู้ป่วยยกมือไม่ได้ / แขนบาดเจ็บ',
        camera_hand_detection_failed: 'กล้องตรวจจับมือไม่ได้',
        other: input.reason_detail || 'ผู้ป่วยไม่สะดวก / อื่นๆ',
      };

      const logInput = SessionLogInputSchema.parse({
        patient_id: input.patient_id,
        course_id: plan.schedule?.course_id || null,
        exercise_id: targetExercise.exercise_id || (targetExercise as any).id || input.exercise_id,
        kiosk_id: input.kiosk_id || 'kiosk-01',
        completion_mode: 'ai_verified',
        telemetry_summary: {
          completion_mode: 'staff_override',
          started_by_staff_id: staffId,
          started_by_staff_name: staffName,
          staff_role: staffRole,
          override_reason: input.override_reason,
          reason_th: reasonThMap[input.override_reason] || reasonThMap.arm_injured_cannot_raise,
          reason_detail: input.reason_detail || null,
          started_at: new Date().toISOString(),
        },
      });

      const log = await this.service.submitSessionLog(logInput, req.ip);

      res.status(200).json({
        ok: true,
        message: 'เริ่มท่าฝึกแทนผู้ป่วยสำเร็จ',
        data: {
          session_id: log.id,
          exercise: targetExercise,
          started_by: staffName,
          override_reason: input.override_reason,
        },
      });
    } catch (err) {
      next(err);
    }
  };
}

export const defaultCourseController = new CourseController();
