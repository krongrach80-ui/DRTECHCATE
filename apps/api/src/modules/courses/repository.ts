import { randomUUID } from 'crypto';
import { getAdminClient } from '../../lib/supabase/adminClient';
import { AppError } from '../../middleware/errorHandler';
import {
  CourseRecord,
  CourseItemRecord,
  CreateCourseOutput,
  UpdateCourseInput,
  CourseQueryFilter,
  CourseItemInput,
} from './schema';
import { PatientRepository, defaultPatientRepository } from '../patients/repository';

export class CourseRepository {
  private inMemoryCourses: Map<string, CourseRecord> = new Map();
  private inMemoryCourseItems: Map<string, CourseItemRecord[]> = new Map();

  constructor(private patientRepo: PatientRepository = defaultPatientRepository) {}

  clearInMemory(): void {
    this.inMemoryCourses.clear();
    this.inMemoryCourseItems.clear();
  }

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
    const nowIso = new Date().toISOString();
    const courseId = randomUUID();

    // 1. Database attempt
    try {
      const adminClient = getAdminClient();
      const { data, error } = await adminClient
        .from('courses')
        .insert({
          patient_id: input.patient_id,
          pt_id: ptId,
          start_date: input.start_date,
          end_date: input.end_date,
          weekdays: input.weekdays,
          start_time: input.start_time || null,
          kiosk_id: input.kiosk_id || null,
          include_minigame: input.include_minigame ?? false,
          modpack_id: input.modpack_id || null,
          status: 'active',
          version: 1,
        })
        .select('*')
        .single();

      if (!error && data) {
        const createdItems: CourseItemRecord[] = [];
        if (items.length > 0) {
          const itemInserts = items.map((it, idx) => ({
            course_id: data.id,
            exercise_id: it.exercise_id,
            sets: it.sets ?? 3,
            reps: it.reps ?? 10,
            position: it.position ?? idx + 1,
          }));

          const { data: itemData } = await adminClient
            .from('course_items')
            .insert(itemInserts)
            .select('*');

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
          patient: patient ? {
            id: patient.id,
            hn: patient.hn,
            first_name: patient.first_name,
            last_name: patient.last_name,
            phone: patient.phone,
          } : null,
        };
      }
    } catch {
      // fallback to in-memory
    }

    // In-Memory implementation
    const createdItems: CourseItemRecord[] = items.map((it, idx) => ({
      id: randomUUID(),
      course_id: courseId,
      exercise_id: it.exercise_id,
      sets: it.sets ?? 3,
      reps: it.reps ?? 10,
      position: it.position ?? idx + 1,
      created_at: nowIso,
    }));

    const patient = await this.patientRepo.getPatientById(input.patient_id);

    const record: CourseRecord = {
      id: courseId,
      patient_id: input.patient_id,
      pt_id: ptId,
      start_date: input.start_date,
      end_date: input.end_date,
      weekdays: input.weekdays,
      start_time: input.start_time || null,
      kiosk_id: input.kiosk_id || null,
      include_minigame: input.include_minigame ?? false,
      modpack_id: input.modpack_id || null,
      status: 'active',
      version: 1,
      goals: input.goals || null,
      progression_criteria: input.progression_criteria || null,
      created_at: nowIso,
      updated_at: nowIso,
      items: createdItems,
      patient: patient ? {
        id: patient.id,
        hn: patient.hn,
        first_name: patient.first_name,
        last_name: patient.last_name,
        phone: patient.phone,
      } : null,
    };

    this.inMemoryCourses.set(courseId, record);
    this.inMemoryCourseItems.set(courseId, createdItems);

    return record;
  }

  // =========================================================================
  // 2. GET COURSE BY ID
  // =========================================================================
  async getCourseById(id: string): Promise<CourseRecord | null> {
    try {
      const adminClient = getAdminClient();
      const { data, error } = await adminClient
        .from('courses')
        .select(`
          *,
          items:course_items(*),
          patient:patients(id, hn, first_name, last_name, phone),
          pt:profiles!pt_id(id, full_name, username)
        `)
        .eq('id', id)
        .maybeSingle();

      if (!error && data) {
        return data as CourseRecord;
      }
    } catch {
      // fallback
    }

    const c = this.inMemoryCourses.get(id);
    if (!c) return null;
    const items = this.inMemoryCourseItems.get(id) || [];
    const patient = await this.patientRepo.getPatientById(c.patient_id);

    return {
      ...c,
      items,
      patient: patient ? {
        id: patient.id,
        hn: patient.hn,
        first_name: patient.first_name,
        last_name: patient.last_name,
        phone: patient.phone,
      } : null,
    };
  }

  // =========================================================================
  // 3. UPDATE COURSE
  // =========================================================================
  async updateCourse(
    id: string,
    input: UpdateCourseInput,
    expectedVersion?: number
  ): Promise<CourseRecord> {
    const existing = await this.getCourseById(id);
    if (!existing) {
      throw new AppError('Course not found', 404, 'COURSE_NOT_FOUND');
    }

    if (expectedVersion !== undefined && existing.version !== expectedVersion) {
      throw new AppError(
        `Conflict: Course was modified by another user (expected version ${expectedVersion}, current version is ${existing.version}).`,
        409,
        'CONFLICT'
      );
    }

    const nowIso = new Date().toISOString();
    const updated: CourseRecord = {
      ...existing,
      start_date: input.start_date ?? existing.start_date,
      end_date: input.end_date ?? existing.end_date,
      weekdays: input.weekdays ?? existing.weekdays,
      start_time: input.start_time !== undefined ? input.start_time : existing.start_time,
      kiosk_id: input.kiosk_id !== undefined ? input.kiosk_id : existing.kiosk_id,
      include_minigame: input.include_minigame ?? existing.include_minigame,
      modpack_id: input.modpack_id !== undefined ? input.modpack_id : existing.modpack_id,
      status: input.status ?? existing.status,
      goals: input.goals !== undefined ? input.goals : existing.goals,
      progression_criteria: input.progression_criteria !== undefined ? input.progression_criteria : existing.progression_criteria,
      version: existing.version + 1,
      updated_at: nowIso,
    };

    if (input.items) {
      const newItems: CourseItemRecord[] = input.items.map((it, idx) => ({
        id: randomUUID(),
        course_id: id,
        exercise_id: it.exercise_id,
        sets: it.sets ?? 3,
        reps: it.reps ?? 10,
        position: it.position ?? idx + 1,
        created_at: nowIso,
      }));
      this.inMemoryCourseItems.set(id, newItems);
      updated.items = newItems;
    }

    this.inMemoryCourses.set(id, updated);

    try {
      const adminClient = getAdminClient();
      await adminClient
        .from('courses')
        .update({
          start_date: updated.start_date,
          end_date: updated.end_date,
          weekdays: updated.weekdays,
          start_time: updated.start_time,
          kiosk_id: updated.kiosk_id,
          include_minigame: updated.include_minigame,
          modpack_id: updated.modpack_id,
          status: updated.status,
          version: updated.version,
          updated_at: nowIso,
        })
        .eq('id', id);
    } catch {
      // fallback
    }

    return updated;
  }

  // =========================================================================
  // 4. CANCEL / DELETE COURSE
  // =========================================================================
  async deleteCourse(id: string): Promise<void> {
    const existing = await this.getCourseById(id);
    if (!existing) {
      throw new AppError('Course not found', 404, 'COURSE_NOT_FOUND');
    }

    existing.status = 'cancelled';
    existing.updated_at = new Date().toISOString();
    this.inMemoryCourses.set(id, existing);

    try {
      const adminClient = getAdminClient();
      await adminClient.from('courses').update({ status: 'cancelled' }).eq('id', id);
    } catch {
      // fallback
    }
  }

  // =========================================================================
  // 5. LIST COURSES (WITH FILTERS & PATIENT ACCESS CHECKS)
  // =========================================================================
  async listCourses(
    filter: CourseQueryFilter,
    accessiblePatientIds?: string[] | null
  ): Promise<CourseRecord[]> {
    let list = Array.from(this.inMemoryCourses.values());

    if (accessiblePatientIds !== null && accessiblePatientIds !== undefined) {
      const allowed = new Set(accessiblePatientIds);
      list = list.filter((c) => allowed.has(c.patient_id));
    }

    if (filter.patient_id) {
      list = list.filter((c) => c.patient_id === filter.patient_id);
    }

    if (filter.pt_id) {
      list = list.filter((c) => c.pt_id === filter.pt_id);
    }

    if (filter.status) {
      list = list.filter((c) => c.status === filter.status);
    }

    if (filter.kiosk_id) {
      list = list.filter((c) => c.kiosk_id === filter.kiosk_id);
    }

    if (filter.from_date) {
      list = list.filter((c) => c.end_date >= filter.from_date!);
    }

    if (filter.to_date) {
      list = list.filter((c) => c.start_date <= filter.to_date!);
    }

    // Populate patient summary
    const results: CourseRecord[] = [];
    for (const c of list) {
      const patient = await this.patientRepo.getPatientById(c.patient_id);
      results.push({
        ...c,
        items: this.inMemoryCourseItems.get(c.id) || [],
        patient: patient ? {
          id: patient.id,
          hn: patient.hn,
          first_name: patient.first_name,
          last_name: patient.last_name,
          phone: patient.phone,
        } : null,
      });
    }

    return results;
  }

  // =========================================================================
  // 6. TODAY'S APPOINTMENTS (CANDIDATE SET PRUNING & RECEPTION DASHBOARD)
  // Master Prompt v3 Line 200 & 330:
  // Active today, weekday matches, kiosk_id matches or is null, patient active
  // =========================================================================
  async getTodayAppointments(
    dateStr: string,
    kioskId?: string | null,
    accessiblePatientIds?: string[] | null
  ): Promise<CourseRecord[]> {
    // Determine 0-6 day of week
    // Note: Use UTC / local date parsing safely
    const [y, m, d] = dateStr.split('-').map(Number);
    const dateObj = new Date(Date.UTC(y, m - 1, d));
    const dayOfWeek = dateObj.getUTCDay(); // 0 = Sun, 1 = Mon ... 6 = Sat

    let list = Array.from(this.inMemoryCourses.values()).filter((c) => {
      // 1. Must be active
      if (c.status !== 'active') return false;

      // 2. Date must be within [start_date, end_date]
      if (c.start_date > dateStr || c.end_date < dateStr) return false;

      // 3. Weekday must match
      if (!c.weekdays.includes(dayOfWeek)) return false;

      // 4. Kiosk filter (if kioskId given, match exact kiosk or null)
      if (kioskId !== undefined && kioskId !== null) {
        if (c.kiosk_id !== null && c.kiosk_id !== kioskId) {
          return false;
        }
      }

      return true;
    });

    // 5. Accessible patient scope (for PT role)
    if (accessiblePatientIds !== null && accessiblePatientIds !== undefined) {
      const allowed = new Set(accessiblePatientIds);
      list = list.filter((c) => allowed.has(c.patient_id));
    }

    // Populate patient summaries
    const results: CourseRecord[] = [];
    for (const c of list) {
      const patient = await this.patientRepo.getPatientById(c.patient_id);
      results.push({
        ...c,
        items: this.inMemoryCourseItems.get(c.id) || [],
        patient: patient ? {
          id: patient.id,
          hn: patient.hn,
          first_name: patient.first_name,
          last_name: patient.last_name,
          phone: patient.phone,
        } : null,
      });
    }

    return results;
  }

  // =========================================================================
  // 7. CALENDAR VIEW (MONTH / DATE RANGE)
  // =========================================================================
  async getCalendarAppointments(
    startDate: string,
    endDate: string,
    ptId?: string,
    accessiblePatientIds?: string[] | null
  ): Promise<CourseRecord[]> {
    let list = Array.from(this.inMemoryCourses.values()).filter((c) => {
      if (c.status === 'cancelled') return false;
      return c.start_date <= endDate && c.end_date >= startDate;
    });

    if (ptId) {
      list = list.filter((c) => c.pt_id === ptId);
    }

    if (accessiblePatientIds !== null && accessiblePatientIds !== undefined) {
      const allowed = new Set(accessiblePatientIds);
      list = list.filter((c) => allowed.has(c.patient_id));
    }

    const results: CourseRecord[] = [];
    for (const c of list) {
      const patient = await this.patientRepo.getPatientById(c.patient_id);
      results.push({
        ...c,
        items: this.inMemoryCourseItems.get(c.id) || [],
        patient: patient ? {
          id: patient.id,
          hn: patient.hn,
          first_name: patient.first_name,
          last_name: patient.last_name,
          phone: patient.phone,
        } : null,
      });
    }

    return results;
  }
}

export const defaultCourseRepository = new CourseRepository();
