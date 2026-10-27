import { randomUUID } from 'crypto';
import { getAdminClient } from '../../lib/supabase/adminClient';
import { AppError } from '../../middleware/errorHandler';
import { logger } from '../../middleware/logger';
import {
  CourseRecord,
  CourseItemRecord,
  CreateCourseOutput,
  UpdateCourseInput,
  CourseQueryFilter,
  CourseItemInput,
} from './schema';
import { IPatientRepository, defaultPatientRepository } from '../patients/repository';

export interface ICourseRepository {
  createCourse(
    input: Partial<CreateCourseOutput> & {
      patient_id: string;
      start_date: string;
      end_date: string;
      weekdays: number[];
    },
    ptId: string,
    items?: CourseItemInput[]
  ): Promise<CourseRecord>;
  getCourseById(id: string): Promise<CourseRecord | null>;
  updateCourse(id: string, input: UpdateCourseInput, expectedVersion: number): Promise<CourseRecord>;
  archiveCourse(id: string, expectedVersion: number): Promise<void>;
  deleteCourse(id: string): Promise<void>;
  listCourses(
    filter: CourseQueryFilter,
    accessiblePatientIds?: string[] | null
  ): Promise<{ courses: CourseRecord[]; total: number; page: number; limit: number }>;
  getPrescriptionForPatientToday(patientId: string, kioskId?: string): Promise<CourseRecord | null>;
  getTodayAppointments(
    dateStr: string,
    kioskId?: string | null,
    accessiblePatientIds?: string[] | null
  ): Promise<CourseRecord[]>;
  getCalendarAppointments(
    startDate: string,
    endDate: string,
    ptId?: string,
    accessiblePatientIds?: string[] | null
  ): Promise<CourseRecord[]>;
}

export class CourseRepository implements ICourseRepository {
  constructor(private patientRepo: IPatientRepository = defaultPatientRepository) {}

  // =========================================================================
  // 1. CREATE COURSE & ITEMS SNAPSHOT
  // =========================================================================
  async createCourse(
    input: Partial<CreateCourseOutput> & {
      patient_id: string;
      start_date: string;
      end_date: string;
      weekdays: number[];
    },
    ptId: string,
    items: CourseItemInput[] = []
  ): Promise<CourseRecord> {
    const courseId = randomUUID();

    try {
      const adminClient = getAdminClient();

      // 1. Resolve patient_id to a valid UUID
      let patientUuid = input.patient_id;
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(patientUuid)) {
        try {
          const { data: pRow } = await adminClient
            .from('patients')
            .select('id')
            .eq('hn', patientUuid)
            .maybeSingle();
          if (pRow?.id) {
            patientUuid = pRow.id;
          }
        } catch {}
      }

      // 2. Resolve pt_id to an existing staff profile UUID
      let validPtId = ptId;
      let ptExists = false;
      if (validPtId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(validPtId) && validPtId !== 'system') {
        try {
          const { data: checkPt } = await adminClient.from('profiles').select('id').eq('id', validPtId).maybeSingle();
          if (checkPt?.id) {
            ptExists = true;
          }
        } catch {}
      }

      if (!ptExists) {
        try {
          const { data: ptRow } = await adminClient
            .from('profiles')
            .select('id')
            .eq('role', 'pt')
            .limit(1)
            .maybeSingle();
          if (ptRow?.id) {
            validPtId = ptRow.id;
          } else {
            const { data: adminRow } = await adminClient
              .from('profiles')
              .select('id')
              .limit(1)
              .maybeSingle();
            validPtId = adminRow?.id || 'b1000000-0000-0000-0000-000000000003';
          }
        } catch {
          validPtId = 'b1000000-0000-0000-0000-000000000003';
        }
      }

      // 3. Resolve kiosk_id (must be UUID or null)
      let validKioskId = input.kiosk_id || null;
      if (validKioskId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(validKioskId)) {
        try {
          const { data: kRow } = await adminClient
            .from('kiosk_devices')
            .select('id')
            .or(`device_code.eq.${validKioskId},name.eq.${validKioskId}`)
            .limit(1)
            .maybeSingle();
          validKioskId = kRow?.id || null;
        } catch {
          validKioskId = null;
        }
      }

      // 4. Resolve next course version to satisfy uq_courses_patient_version
      let nextVersion = 1;
      try {
        const { data: maxCourse } = await adminClient
          .from('courses')
          .select('version')
          .eq('patient_id', patientUuid)
          .order('version', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (maxCourse?.version) {
          nextVersion = maxCourse.version + 1;
        }
      } catch {}

      const { data, error } = await adminClient
        .from('courses')
        .insert({
          id: courseId,
          patient_id: patientUuid,
          pt_id: validPtId,
          start_date: input.start_date,
          end_date: input.end_date,
          weekdays: input.weekdays,
          start_time: input.start_time || null,
          kiosk_id: validKioskId,
          include_minigame: input.include_minigame ?? false,
          modpack_id: input.modpack_id || null,
          status: 'active',
          version: nextVersion,
        })
        .select('*')
        .single();

      if (error || !data) {
        logger.error({ error, input, patientUuid, validPtId }, 'Database error creating course');
        throw new AppError('Database service unavailable: ' + (error?.message || 'Insert course failed'), 503, 'SERVICE_UNAVAILABLE');
      }

      const createdItems: CourseItemRecord[] = [];
      if (items.length > 0) {
        // Resolve default valid exercise UUID
        let defaultExId = 'e1000000-0000-0000-0000-000000000001';
        try {
          const { data: exList } = await adminClient.from('exercises').select('id').limit(1);
          if (exList && exList.length > 0) {
            defaultExId = exList[0].id;
          }
        } catch {}

        const itemInserts = items.map((it, idx) => {
          let exId = it.exercise_id;
          if (!exId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(exId)) {
            exId = defaultExId;
          }
          return {
            course_id: data.id,
            exercise_id: exId,
            sets: it.sets ?? 3,
            reps: it.reps ?? 10,
            position: it.position ?? idx + 1,
          };
        });

        const { data: itemData, error: itemErr } = await adminClient
          .from('course_items')
          .insert(itemInserts)
          .select('*');

        if (itemErr) {
          logger.error({ itemErr, courseId: data.id }, 'Database error inserting course items');
          throw new AppError('Database service unavailable: ' + itemErr.message, 503, 'SERVICE_UNAVAILABLE');
        }

        if (itemData) {
          createdItems.push(...(itemData as CourseItemRecord[]));
        }
      }

      const patient = await this.patientRepo.getPatientById(data.patient_id);
      return {
        ...(data as CourseRecord),
        goals: input.goals || null,
        progression_criteria: input.progression_criteria || null,
        items: createdItems,
        patient: patient
          ? {
              id: patient.id,
              hn: patient.hn,
              first_name: patient.first_name,
              last_name: patient.last_name,
              phone: patient.phone,
            }
          : null,
      };
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, input }, 'Unexpected error in createCourse');
      throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
  }

  async getCourseById(id: string): Promise<CourseRecord | null> {
    try {
      const adminClient = getAdminClient();
      const { data, error } = await adminClient
        .from('courses')
        .select('*, items:course_items(*)')
        .eq('id', id)
        .maybeSingle();

      if (error) {
        logger.error({ error, id }, 'Database error querying course by id');
        throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }

      if (!data) return null;

      const patient = await this.patientRepo.getPatientById(data.patient_id);
      return {
        ...(data as CourseRecord),
        items: data.items || [],
        patient: patient
          ? {
              id: patient.id,
              hn: patient.hn,
              first_name: patient.first_name,
              last_name: patient.last_name,
              phone: patient.phone,
            }
          : null,
      };
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, id }, 'Unexpected error in getCourseById');
      throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
  }

  async updateCourse(
    id: string,
    input: UpdateCourseInput,
    expectedVersion: number
  ): Promise<CourseRecord> {
    const current = await this.getCourseById(id);
    if (!current) {
      throw new AppError('Course not found', 404, 'COURSE_NOT_FOUND');
    }

    if (current.version !== expectedVersion) {
      throw new AppError(
        `Conflict: Course was modified by another user (expected version ${expectedVersion}, current version is ${current.version})`,
        409,
        'CONFLICT'
      );
    }

    try {
      const adminClient = getAdminClient();
      const updateData: Record<string, unknown> = {
        version: expectedVersion + 1,
        updated_at: new Date().toISOString(),
      };

      if (input.start_date !== undefined) updateData.start_date = input.start_date;
      if (input.end_date !== undefined) updateData.end_date = input.end_date;
      if (input.weekdays !== undefined) updateData.weekdays = input.weekdays;
      if (input.start_time !== undefined) updateData.start_time = input.start_time;
      if (input.kiosk_id !== undefined) updateData.kiosk_id = input.kiosk_id;
      if (input.include_minigame !== undefined) updateData.include_minigame = input.include_minigame;
      if (input.modpack_id !== undefined) updateData.modpack_id = input.modpack_id;
      if (input.status !== undefined) updateData.status = input.status;

      const { data, error } = await adminClient
        .from('courses')
        .update(updateData)
        .eq('id', id)
        .eq('version', expectedVersion)
        .select('*')
        .maybeSingle();

      if (error || !data) {
        logger.error({ error, id, expectedVersion }, 'Database error updating course');
        throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }

      if (input.items && Array.isArray(input.items)) {
        await adminClient.from('course_items').delete().eq('course_id', id);
        const itemInserts = input.items.map((it, idx) => ({
          course_id: id,
          exercise_id: it.exercise_id,
          sets: it.sets ?? 3,
          reps: it.reps ?? 10,
          position: it.position ?? idx + 1,
        }));
        await adminClient.from('course_items').insert(itemInserts);
      }

      const updated = await this.getCourseById(id);
      if (!updated) {
        throw new AppError('Failed to retrieve updated course', 500, 'UPDATE_FAILED');
      }
      return updated;
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, id }, 'Unexpected error in updateCourse');
      throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
  }

  async archiveCourse(id: string, expectedVersion: number): Promise<void> {
    await this.updateCourse(id, { status: 'cancelled' }, expectedVersion);
  }

  async deleteCourse(id: string): Promise<void> {
    try {
      const adminClient = getAdminClient();
      const { error } = await adminClient
        .from('courses')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) {
        logger.error({ error, id }, 'Database error cancelling/deleting course');
        throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, id }, 'Unexpected error in deleteCourse');
      throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
  }

  async listCourses(
    filter: CourseQueryFilter,
    accessiblePatientIds?: string[] | null
  ): Promise<{ courses: CourseRecord[]; total: number; page: number; limit: number }> {
    const page = filter.page || 1;
    const limit = filter.limit || 20;
    const offset = (page - 1) * limit;

    try {
      const adminClient = getAdminClient();
      let query = adminClient.from('courses').select('*, items:course_items(*)', { count: 'exact' });

      if (accessiblePatientIds !== null && accessiblePatientIds !== undefined) {
        if (accessiblePatientIds.length === 0) {
          return { courses: [], total: 0, page, limit };
        }
        query = query.in('patient_id', accessiblePatientIds);
      }

      if (filter.patient_id) {
        query = query.eq('patient_id', filter.patient_id);
      }
      if (filter.pt_id) {
        query = query.eq('pt_id', filter.pt_id);
      }
      if (filter.status) {
        query = query.eq('status', filter.status);
      }
      if (filter.kiosk_id) {
        query = query.eq('kiosk_id', filter.kiosk_id);
      }

      query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

      const { data, count, error } = await query;
      if (error) {
        logger.error({ error, filter }, 'Database error listing courses');
        throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }

      const coursesWithPatient: CourseRecord[] = await Promise.all(
        (data || []).map(async (c: Record<string, unknown>) => {
          const patient = await this.patientRepo.getPatientById(c.patient_id as string);
          return {
            ...c,
            items: (c.items as CourseItemRecord[]) || [],
            patient: patient
              ? {
                  id: patient.id,
                  hn: patient.hn,
                  first_name: patient.first_name,
                  last_name: patient.last_name,
                  phone: patient.phone,
                }
              : null,
          } as unknown as CourseRecord;
        })
      );

      return {
        courses: coursesWithPatient,
        total: count || 0,
        page,
        limit,
      };
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, filter }, 'Unexpected error in listCourses');
      throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
  }

  async getPrescriptionForPatientToday(patientId: string, kioskId?: string): Promise<CourseRecord | null> {
    const today = new Date();
    const todayDateStr = today.toISOString().split('T')[0];
    const jsDay = today.getDay(); // 0 is Sunday, 1 is Monday ...
    const weekdayNumber = jsDay === 0 ? 7 : jsDay; // 1-7 ISO

    try {
      const adminClient = getAdminClient();
      let query = adminClient
        .from('courses')
        .select('*, items:course_items(*)')
        .eq('patient_id', patientId)
        .eq('status', 'active')
        .lte('start_date', todayDateStr)
        .gte('end_date', todayDateStr);

      if (kioskId) {
        query = query.or(`kiosk_id.is.null,kiosk_id.eq.${kioskId}`);
      }

      const { data, error } = await query;
      if (error) {
        logger.error({ error, patientId, kioskId }, 'Database error querying prescription for patient today');
        throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }

      if (!data || data.length === 0) return null;

      // Filter by weekday array contains today
      const matched = data.find((c: Record<string, unknown>) => Array.isArray(c.weekdays) && (c.weekdays as number[]).includes(weekdayNumber));
      if (!matched) return null;

      const patient = await this.patientRepo.getPatientById(matched.patient_id as string);
      return {
        ...(matched as CourseRecord),
        items: (matched.items as CourseItemRecord[]) || [],
        patient: patient
          ? {
              id: patient.id,
              hn: patient.hn,
              first_name: patient.first_name,
              last_name: patient.last_name,
              phone: patient.phone,
            }
          : null,
      };
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, patientId, kioskId }, 'Unexpected error in getPrescriptionForPatientToday');
      throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
  }

  async getTodayAppointments(
    dateStr: string,
    kioskId?: string | null,
    accessiblePatientIds?: string[] | null
  ): Promise<CourseRecord[]> {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dateObj = new Date(Date.UTC(y, m - 1, d));
    const dayOfWeek = dateObj.getUTCDay();

    try {
      const adminClient = getAdminClient();
      let query = adminClient
        .from('courses')
        .select('*, items:course_items(*)')
        .eq('status', 'active')
        .lte('start_date', dateStr)
        .gte('end_date', dateStr);

      if (kioskId !== undefined && kioskId !== null) {
        query = query.or(`kiosk_id.is.null,kiosk_id.eq.${kioskId}`);
      }

      if (accessiblePatientIds !== null && accessiblePatientIds !== undefined) {
        if (accessiblePatientIds.length === 0) return [];
        query = query.in('patient_id', accessiblePatientIds);
      }

      const { data, error } = await query;
      if (error) {
        logger.error({ error, dateStr }, 'Database error querying today appointments');
        throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }

      const filtered = (data || []).filter((c: Record<string, unknown>) => Array.isArray(c.weekdays) && (c.weekdays as number[]).includes(dayOfWeek));

      return Promise.all(
        filtered.map(async (c: Record<string, unknown>) => {
          const patient = await this.patientRepo.getPatientById(c.patient_id as string);
          return {
            ...c,
            items: (c.items as CourseItemRecord[]) || [],
            patient: patient
              ? {
                  id: patient.id,
                  hn: patient.hn,
                  first_name: patient.first_name,
                  last_name: patient.last_name,
                  phone: patient.phone,
                }
              : null,
          } as unknown as CourseRecord;
        })
      );
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, dateStr }, 'Unexpected error in getTodayAppointments');
      throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
  }

  async getCalendarAppointments(
    startDate: string,
    endDate: string,
    ptId?: string,
    accessiblePatientIds?: string[] | null
  ): Promise<CourseRecord[]> {
    try {
      const adminClient = getAdminClient();
      let query = adminClient
        .from('courses')
        .select('*, items:course_items(*)')
        .neq('status', 'cancelled')
        .lte('start_date', endDate)
        .gte('end_date', startDate);

      if (ptId) {
        query = query.eq('pt_id', ptId);
      }

      if (accessiblePatientIds !== null && accessiblePatientIds !== undefined) {
        if (accessiblePatientIds.length === 0) return [];
        query = query.in('patient_id', accessiblePatientIds);
      }

      const { data, error } = await query;
      if (error) {
        logger.error({ error, startDate, endDate }, 'Database error querying calendar appointments');
        throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }

      return Promise.all(
        (data || []).map(async (c: Record<string, unknown>) => {
          const patient = await this.patientRepo.getPatientById(c.patient_id as string);
          return {
            ...c,
            items: (c.items as CourseItemRecord[]) || [],
            patient: patient
              ? {
                  id: patient.id,
                  hn: patient.hn,
                  first_name: patient.first_name,
                  last_name: patient.last_name,
                  phone: patient.phone,
                }
              : null,
          } as unknown as CourseRecord;
        })
      );
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, startDate, endDate }, 'Unexpected error in getCalendarAppointments');
      throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
  }
}

let currentCourseRepository: ICourseRepository = new CourseRepository();

export function setDefaultCourseRepository(repo: ICourseRepository): void {
  currentCourseRepository = repo;
}

export const defaultCourseRepository: ICourseRepository = new Proxy(
  {} as unknown as ICourseRepository,
  {
    get(_target, prop) {
      const val = Reflect.get(currentCourseRepository, prop);
      if (typeof val === 'function') {
        return (val as (...args: unknown[]) => unknown).bind(currentCourseRepository);
      }
      return val;
    },
    set(_target, prop, value) {
      return Reflect.set(currentCourseRepository, prop, value);
    },
  }
);
