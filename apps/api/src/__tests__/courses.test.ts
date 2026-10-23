import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { resetAllFakeRepositories } from './fixtures/fakeRepositories';
import { defaultCourseRepository } from '../modules/courses/repository';
import { defaultPatientRepository } from '../modules/patients/repository';
import { defaultDirectoryRepository } from '../modules/directory/repository';
import { resetAuthTestState } from '../middleware/authenticate';

describe('[UNIT] DrTech.Care System 6: Courses & Scheduling Complete Test Suite', () => {
  const app = createApp();

  beforeAll(() => {
    (process.env as Record<string, string>).NODE_ENV = 'test';
    process.env.SUPABASE_URL = 'http://127.0.0.1:54321';
    process.env.SUPABASE_ANON_KEY = 'sb_publishable_RIM7hit0_ZY0y5fBCK_Uuw_bEJY7H5I';
    process.env.INTERNAL_EMAIL_DOMAIN = 'drtech.care';
    process.env.FACE_T_ACCEPT = '0.60';
    process.env.FACE_T_REJECT = '0.45';
    process.env.FACE_T_MARGIN = '0.10';
    process.env.FACE_T_ENROLL_CONSISTENCY = '0.75';
    process.env.FACE_T_DUPLICATE = '0.85';
    process.env.FACE_CHALLENGE_EXPIRE_SECONDS = '60';
  });

  beforeEach(() => {
    resetAllFakeRepositories();
    resetAuthTestState();
  });

  // =========================================================================
  // 1. Permission Invariants: PT cannot prescribe for other PT's patients
  // =========================================================================
  describe('1. Course Prescription Role Boundaries & Permissions', () => {
    it('1.1 SPEC INVARIANT: PT cannot create a course for a patient not under their active care', async () => {
      // 1. PT-1 creates a patient
      const patient = await defaultPatientRepository.createPatient(
        { first_name: 'วิชัย', last_name: 'คนไข้หมอหนึ่ง' },
        'pt-001',
        'pt-001'
      );

      // 2. PT-2 attempts to create a course for PT-1's patient -> 403 Forbidden
      const res = await request(app)
        .post('/api/courses')
        .set('Cookie', ['access_token=mock-token:pt-002:pt:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          patient_id: patient.id,
          start_date: '2026-11-01',
          end_date: '2026-11-30',
          weekdays: [1, 3, 5],
          items: [{ exercise_id: 'ex-001', sets: 3, reps: 10, position: 1 }],
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toContain('not under their active care');
    });

    it('1.2 SPEC INVARIANT: PT cannot prescribe under another PT ID', async () => {
      // PT-1 creates a patient
      const patient = await defaultPatientRepository.createPatient(
        { first_name: 'สมจิตต์', last_name: 'รักการกายภาพ' },
        'pt-001',
        'pt-001'
      );

      // PT-1 attempts to specify pt_id: 'pt-002'
      const res = await request(app)
        .post('/api/courses')
        .set('Cookie', ['access_token=mock-token:pt-001:pt:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          patient_id: patient.id,
          pt_id: 'pt-002', // FORBIDDEN
          start_date: '2026-11-01',
          end_date: '2026-11-30',
          weekdays: [1, 3, 5],
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toContain('another PT ID');
    });

    it('1.3 should allow PT to create a course for their own patient', async () => {
      const patient = await defaultPatientRepository.createPatient(
        { first_name: 'กานดา', last_name: 'เจริญสุข' },
        'pt-001',
        'pt-001'
      );

      const res = await request(app)
        .post('/api/courses')
        .set('Cookie', ['access_token=mock-token:pt-001:pt:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          patient_id: patient.id,
          start_date: '2026-11-01',
          end_date: '2026-11-30',
          weekdays: [1, 3, 5],
          start_time: '09:30',
          kiosk_id: 'kiosk-01',
          include_minigame: true,
          goals: 'Restore shoulder abduction to 120 degrees',
          progression_criteria: 'Pain level < 3/10 for 3 consecutive sessions',
          items: [
            { exercise_id: 'ex-shoulder-01', sets: 3, reps: 12, position: 1 },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.patient_id).toBe(patient.id);
      expect(res.body.data.pt_id).toBe('pt-001');
      expect(res.body.data.weekdays).toEqual([1, 3, 5]);
      expect(res.body.data.start_time).toBe('09:30');
      expect(res.body.data.include_minigame).toBe(true);
      expect(res.body.data.items.length).toBe(1);
    });

    it('1.4 should allow delegate PT to create course during active case transfer', async () => {
      // PT-1 patient
      const patient = await defaultPatientRepository.createPatient(
        { first_name: 'เคสโอน', last_name: 'ชั่วคราว' },
        'pt-001',
        'pt-001'
      );

      const today = new Date().toISOString().split('T')[0];

      // Delegate case to PT-2 for today
      await defaultDirectoryRepository.createCaseTransfer(
        {
          patient_id: patient.id,
          to_pt_id: 'pt-002',
          start_date: today,
          end_date: today,
        },
        'pt-001',
        'pt-001'
      );

      // PT-2 can now prescribe for this patient
      const res = await request(app)
        .post('/api/courses')
        .set('Cookie', ['access_token=mock-token:pt-002:pt:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          patient_id: patient.id,
          start_date: today,
          end_date: today,
          weekdays: ['mon', 'wed', 'fri', 'today'],
        });

      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.pt_id).toBe('pt-002');
    });
  });

  // =========================================================================
  // 2. Modpack Snapshotting & Weekday Normalization
  // =========================================================================
  describe('2. Modpack Snapshotting & Configuration', () => {
    it('2.1 should snapshot exercises from modpack when modpack_id is provided', async () => {
      const patient = await defaultPatientRepository.createPatient(
        { first_name: 'ชัชวาล', last_name: 'มั่นคง' },
        'pt-001',
        'pt-001'
      );

      // Create modpack with 2 items
      const modpack = await defaultDirectoryRepository.createModpack(
        {
          name: 'Knee Rehab Bundle A',
          items: [
            { exercise_id: 'ex-knee-01', sets: 4, reps: 15, position: 1 },
            { exercise_id: 'ex-knee-02', sets: 3, reps: 10, position: 2 },
          ],
        },
        'pt-001'
      );

      // Create course referencing modpack
      const res = await request(app)
        .post('/api/courses')
        .set('Cookie', ['access_token=mock-token:pt-001:pt:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          patient_id: patient.id,
          start_date: '2026-11-01',
          end_date: '2026-11-30',
          weekdays: ['monday', 'wednesday', 'friday'],
          modpack_id: modpack.id,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.weekdays).toEqual([1, 3, 5]);
      expect(res.body.data.items.length).toBe(2);
      expect(res.body.data.items[0].exercise_id).toBe('ex-knee-01');
      expect(res.body.data.items[1].exercise_id).toBe('ex-knee-02');
    });

    it('2.2 should reject invalid date ordering (end_date < start_date)', async () => {
      const patient = await defaultPatientRepository.createPatient(
        { first_name: 'ทดสอบ', last_name: 'วันที่ผิด' },
        'pt-001',
        'pt-001'
      );

      const res = await request(app)
        .post('/api/courses')
        .set('Cookie', ['access_token=mock-token:pt-001:pt:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          patient_id: patient.id,
          start_date: '2026-11-30',
          end_date: '2026-11-10', // < start_date
          weekdays: [1, 2],
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // =========================================================================
  // 3. Today's Appointments View (DoD Requirement)
  // =========================================================================
  describe('3. Today Appointments Filtering (DoD Item: days_of_week and date window)', () => {
    it('3.1 SPEC INVARIANT: today appointments MUST match current weekday, active window, and kiosk filter', async () => {
      // Reference date: Wednesday 2026-11-18 (Day of week = 3)
      const targetDate = '2026-11-18';
      const targetDayOfWeek = 3; // Wednesday

      const p1 = await defaultPatientRepository.createPatient(
        { first_name: 'คนไข้ตรงวัน', last_name: 'พุธ' },
        'admin-001',
        'pt-001'
      );
      const p2 = await defaultPatientRepository.createPatient(
        { first_name: 'คนไข้วันอังคาร', last_name: 'อังคาร' },
        'admin-001',
        'pt-001'
      );
      const p3 = await defaultPatientRepository.createPatient(
        { first_name: 'คนไข้หมดอายุ', last_name: 'ก่อนหน้า' },
        'admin-001',
        'pt-001'
      );
      const p4 = await defaultPatientRepository.createPatient(
        { first_name: 'คนไข้อนุญาตทุกตู้', last_name: 'พุธ' },
        'admin-001',
        'pt-001'
      );

      // 1. Course 1: Active window 2026-11-01 to 2026-11-30, includes Wednesday (3), kiosk: 'kiosk-01' -> SHOULD MATCH
      await defaultCourseRepository.createCourse(
        {
          patient_id: p1.id,
          start_date: '2026-11-01',
          end_date: '2026-11-30',
          weekdays: [1, targetDayOfWeek, 5], // Mon, Wed, Fri
          kiosk_id: 'kiosk-01',
          include_minigame: false,
        },
        'pt-001'
      );

      // 2. Course 2: Active window, but weekdays are Tue/Thu [2, 4] -> MUST NOT MATCH ON WEDNESDAY
      await defaultCourseRepository.createCourse(
        {
          patient_id: p2.id,
          start_date: '2026-11-01',
          end_date: '2026-11-30',
          weekdays: [2, 4], // Tue, Thu
          kiosk_id: 'kiosk-01',
          include_minigame: false,
        },
        'pt-001'
      );

      // 3. Course 3: Weekdays include Wednesday, but date range already expired (ended 2026-11-10) -> MUST NOT MATCH
      await defaultCourseRepository.createCourse(
        {
          patient_id: p3.id,
          start_date: '2026-11-01',
          end_date: '2026-11-10', // Expired before 2026-11-18
          weekdays: [targetDayOfWeek],
          kiosk_id: 'kiosk-01',
          include_minigame: false,
        },
        'pt-001'
      );

      // 4. Course 4: Active window, Wednesday, kiosk_id: null (Any kiosk) -> SHOULD MATCH
      await defaultCourseRepository.createCourse(
        {
          patient_id: p4.id,
          start_date: '2026-11-01',
          end_date: '2026-11-30',
          weekdays: [targetDayOfWeek],
          kiosk_id: null, // Any kiosk
          include_minigame: true,
        },
        'pt-001'
      );

      // Query today's appointments for 2026-11-18 at kiosk-01
      const res = await request(app)
        .get(`/api/courses/today?date=${targetDate}&kiosk_id=kiosk-01`)
        .set('Cookie', ['access_token=mock-token:admin-001:admin:active']);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);

      const matchedPatientIds = res.body.data.map((c: { patient_id: string }) => c.patient_id);

      // P1 (Wed, kiosk-01) matches
      expect(matchedPatientIds).toContain(p1.id);
      // P4 (Wed, kiosk null / any) matches
      expect(matchedPatientIds).toContain(p4.id);

      // P2 (Wrong weekday) MUST NOT be present
      expect(matchedPatientIds).not.toContain(p2.id);
      // P3 (Expired date) MUST NOT be present
      expect(matchedPatientIds).not.toContain(p3.id);

      expect(res.body.data.length).toBe(2);
    });
  });

  // =========================================================================
  // 4. Calendar View & Course Management
  // =========================================================================
  describe('4. Calendar View & Course Lifecycle', () => {
    it('4.1 should return calendar appointments within requested month', async () => {
      const patient = await defaultPatientRepository.createPatient(
        { first_name: 'ปฏิทิน', last_name: 'นัดหมาย' },
        'admin-001',
        'pt-001'
      );

      await defaultCourseRepository.createCourse(
        {
          patient_id: patient.id,
          start_date: '2026-11-01',
          end_date: '2026-11-30',
          weekdays: [1, 3, 5],
          kiosk_id: 'kiosk-02',
          include_minigame: false,
        },
        'pt-001'
      );

      const res = await request(app)
        .get('/api/courses/calendar?month=2026-11')
        .set('Cookie', ['access_token=mock-token:admin-001:admin:active']);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].patient_id).toBe(patient.id);
    });

    it('4.2 should allow updating and cancelling a course', async () => {
      const patient = await defaultPatientRepository.createPatient(
        { first_name: 'ยกเลิก', last_name: 'แผนการรักษา' },
        'pt-001',
        'pt-001'
      );

      const course = await defaultCourseRepository.createCourse(
        {
          patient_id: patient.id,
          start_date: '2026-11-01',
          end_date: '2026-11-30',
          weekdays: [1, 2],
          include_minigame: false,
        },
        'pt-001'
      );

      // 1. Update goals and items
      const updateRes = await request(app)
        .patch(`/api/courses/${course.id}`)
        .set('Cookie', ['access_token=mock-token:pt-001:pt:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          goals: 'Updated treatment goal: Pain free overhead reach',
          version: 1,
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.goals).toContain('Pain free overhead reach');
      expect(updateRes.body.data.version).toBe(2);

      // 2. Cancel course
      const deleteRes = await request(app)
        .delete(`/api/courses/${course.id}`)
        .set('Cookie', ['access_token=mock-token:pt-001:pt:active'])
        .set('X-Requested-With', 'XMLHttpRequest');

      expect(deleteRes.status).toBe(200);

      // Verify status is now cancelled
      const getRes = await request(app)
        .get(`/api/courses/${course.id}`)
        .set('Cookie', ['access_token=mock-token:pt-001:pt:active']);

      expect(getRes.body.data.status).toBe('cancelled');
    });
  });
});
