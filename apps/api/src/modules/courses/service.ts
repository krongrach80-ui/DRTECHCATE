import { AppError } from '../../middleware/errorHandler';
import { UserSession } from '../../middleware/authenticate';
import { AuditService, defaultAuditService } from '../audit/service';
import {
  CourseRecord,
  CreateCourseOutput,
  UpdateCourseInput,
  CourseQueryFilter,
  TodayAppointmentsFilter,
  CalendarViewFilter,
  CourseItemInput,
  SessionLogInput,
  SessionLogRecord,
  SessionLogQuery,
} from './schema';
import { defaultCourseRepository, ICourseRepository } from './repository';
import { defaultPatientRepository, IPatientRepository } from '../patients/repository';
import { defaultDirectoryRepository, IDirectoryRepository } from '../directory/repository';

export class CourseService {
  constructor(
    private repo: ICourseRepository = defaultCourseRepository,
    private patientRepo: IPatientRepository = defaultPatientRepository,
    private directoryRepo: IDirectoryRepository = defaultDirectoryRepository,
    private auditService: AuditService = defaultAuditService
  ) {}

  setRepository(repo: ICourseRepository) {
    this.repo = repo;
  }

  setPatientRepository(repo: IPatientRepository) {
    this.patientRepo = repo;
  }

  setDirectoryRepository(repo: IDirectoryRepository) {
    this.directoryRepo = repo;
  }

  // =========================================================================
  // 1. CREATE COURSE (PRESCRIPTION PLAN)
  // Spec Section 4 & 8.2 & Trigger: PT can ONLY prescribe for active patients
  // =========================================================================
  async createCourse(
    input: CreateCourseOutput,
    actor: UserSession,
    ipAddress?: string
  ): Promise<CourseRecord> {
    const patient = await this.patientRepo.getPatientById(input.patient_id);
    if (!patient) {
      throw new AppError('Patient not found', 404, 'PATIENT_NOT_FOUND');
    }
    input.patient_id = patient.id; // Always use resolved UUID

    let ptId = input.pt_id || actor.id;

    if (actor.role === 'pt') {
      // 1. Invariant: PT cannot create a course for a patient they do not actively manage
      const hasAccess = await this.patientRepo.isPatientAccessibleByPt(patient.id, actor.id);
      if (!hasAccess) {
        throw new AppError(
          'Forbidden: Physiotherapist cannot create or assign a course to a patient who is not under their active care.',
          403,
          'FORBIDDEN'
        );
      }

      // 2. Invariant: PT cannot assign under another PT ID
      if (input.pt_id && input.pt_id !== actor.id) {
        throw new AppError(
          'Forbidden: Physiotherapist cannot assign a course under another PT ID.',
          403,
          'FORBIDDEN'
        );
      }

      ptId = actor.id;
    } else if (actor.role === 'admin' || actor.role === 'director' || actor.role === 'superadmin') {
      ptId = input.pt_id || patient.responsible_pt_id || actor.id;
    }

    // 3. Snapshot exercises from modpack if modpack_id provided and items empty
    let itemsToSave: CourseItemInput[] = input.items || [];
    if (input.modpack_id && itemsToSave.length === 0) {
      const modpack = await this.directoryRepo.getModpackById(input.modpack_id);
      if (modpack && modpack.items) {
        itemsToSave = modpack.items.map((mItem) => ({
          exercise_id: mItem.exercise_id,
          sets: mItem.sets,
          reps: mItem.reps,
          position: mItem.position,
        }));
      }
    }

    const course = await this.repo.createCourse(input, ptId, itemsToSave);

    await this.auditService.write({
      actor_type: 'staff',
      action: 'course.create',
      actor_id: actor.id,
      entity: 'course',
      entity_id: course.id,
      ip: ipAddress,
      metadata: {
        patient_id: course.patient_id,
        pt_id: course.pt_id,
        start_date: course.start_date,
        end_date: course.end_date,
        weekdays: course.weekdays,
        items_count: itemsToSave.length,
      },
    });

    return course;
  }

  // =========================================================================
  // 2. GET COURSE BY ID
  // =========================================================================
  async getCourseById(id: string, actor: UserSession): Promise<CourseRecord> {
    const course = await this.repo.getCourseById(id);
    if (!course) {
      throw new AppError('Course not found', 404, 'COURSE_NOT_FOUND');
    }

    if (actor.role === 'pt') {
      const hasAccess = await this.patientRepo.isPatientAccessibleByPt(course.patient_id, actor.id);
      if (!hasAccess) {
        throw new AppError(
          'Forbidden: You do not have access to view this course.',
          403,
          'FORBIDDEN'
        );
      }
    }

    return course;
  }

  // =========================================================================
  // 3. UPDATE COURSE
  // =========================================================================
  async updateCourse(
    id: string,
    input: UpdateCourseInput,
    actor: UserSession,
    ipAddress?: string
  ): Promise<CourseRecord> {
    const existing = await this.getCourseById(id, actor);

    // PT can only update their own assigned courses
    if (actor.role === 'pt' && existing.pt_id !== actor.id) {
      const hasAccess = await this.patientRepo.isPatientAccessibleByPt(existing.patient_id, actor.id);
      if (!hasAccess) {
        throw new AppError(
          'Forbidden: You cannot modify a course assigned by another physiotherapist.',
          403,
          'FORBIDDEN'
        );
      }
    }

    const updated = await this.repo.updateCourse(id, input, input.version ?? existing.version);

    await this.auditService.write({
      actor_type: 'staff',
      action: 'course.update',
      actor_id: actor.id,
      entity: 'course',
      entity_id: updated.id,
      ip: ipAddress,
      metadata: {
        status: updated.status,
        version: updated.version,
      },
    });

    return updated;
  }

  // =========================================================================
  // 4. CANCEL / DELETE COURSE
  // =========================================================================
  async deleteCourse(id: string, actor: UserSession, ipAddress?: string): Promise<void> {
    const existing = await this.getCourseById(id, actor);

    if (actor.role === 'pt' && existing.pt_id !== actor.id) {
      throw new AppError('Forbidden: You cannot delete another PT course.', 403, 'FORBIDDEN');
    }

    await this.repo.deleteCourse(id);

    await this.auditService.write({
      actor_type: 'staff',
      action: 'course.delete',
      actor_id: actor.id,
      entity: 'course',
      entity_id: id,
      ip: ipAddress,
      metadata: { patient_id: existing.patient_id },
    });
  }

  // =========================================================================
  // 5. LIST COURSES
  // =========================================================================
  async listCourses(
    filter: CourseQueryFilter,
    actor: UserSession
  ): Promise<{ courses: CourseRecord[]; total: number; page: number; limit: number }> {
    let accessibleIds: string[] | null = null;
    if (actor.role === 'pt') {
      accessibleIds = await this.patientRepo.getAccessiblePatientIdsForPt(actor.id);
    }
    return this.repo.listCourses(filter, accessibleIds);
  }

  // =========================================================================
  // 6. TODAY'S APPOINTMENTS (CANDIDATE SET PRUNING & RECEPTION DASHBOARD)
  // =========================================================================
  async getTodayAppointments(
    filter: TodayAppointmentsFilter,
    actor: UserSession
  ): Promise<CourseRecord[]> {
    const dateStr = filter.date || new Date().toISOString().split('T')[0];

    let accessibleIds: string[] | null = null;
    if (actor.role === 'pt') {
      accessibleIds = await this.patientRepo.getAccessiblePatientIdsForPt(actor.id);
    }

    return this.repo.getTodayAppointments(dateStr, filter.kiosk_id, accessibleIds);
  }

  // =========================================================================
  // 7. CALENDAR APPOINTMENTS VIEW
  // =========================================================================
  async getCalendarView(
    filter: CalendarViewFilter,
    actor: UserSession
  ): Promise<CourseRecord[]> {
    let startDate: string;
    let endDate: string;

    if (filter.month) {
      startDate = `${filter.month}-01`;
      endDate = `${filter.month}-31`;
    } else {
      const today = new Date().toISOString().split('T')[0];
      startDate = filter.start_date || today;
      endDate = filter.end_date || today;
    }

    let accessibleIds: string[] | null = null;
    if (actor.role === 'pt') {
      accessibleIds = await this.patientRepo.getAccessiblePatientIdsForPt(actor.id);
    }

    return this.repo.getCalendarAppointments(startDate, endDate, filter.pt_id, accessibleIds);
  }

  async deleteCourseDay(id: string, date: string, actor: UserSession): Promise<void> {
    const course = await this.repo.getCourseById(id);
    if (!course) {
      throw new AppError('Course not found', 404, 'COURSE_NOT_FOUND');
    }
    if (actor.role === 'pt') {
      const isAccessible = await this.patientRepo.isPatientAccessibleByPt(course.patient_id, actor.id);
      if (!isAccessible) {
        throw new AppError('Forbidden: patient not assigned to this PT', 403, 'FORBIDDEN');
      }
    }
    await this.repo.deleteCourseDay(id, date);
  }

  // =========================================================================
  // 6. EXERCISE SESSION LOGS (TELEMETRY PERSISTENCE & ANALYTICS)
  // =========================================================================
  async submitSessionLog(input: SessionLogInput, clientIp?: string): Promise<SessionLogRecord> {
    const log = await this.repo.createSessionLog(input);
    try {
      await this.auditService.write({
        actor_type: 'patient',
        actor_id: input.patient_id,
        action: 'exercise_session_logged',
        entity: 'exercise_session_logs',
        entity_id: log.id,
        ip: clientIp || null,
        metadata: {
          completion_mode: input.completion_mode,
          pain_reported: input.pain_reported,
          correct_reps: input.correct_reps,
          max_angle: input.max_angle_achieved,
        },
      });
    } catch {
      // audit logging should not block clinical session submission
    }
    return log;
  }

  async getSessionLogs(query: SessionLogQuery): Promise<SessionLogRecord[]> {
    return this.repo.listSessionLogs(query);
  }
}

export let defaultCourseService = new CourseService();
export const setDefaultCourseService = (service: CourseService) => {
  defaultCourseService = service;
};
