/**
 * apps/api/src/__tests__/appointment_sync_admin_to_pt.test.ts
 * Master Prompt: DR.TECH.CARE APPOINTMENT SYNC (ADMIN TO PT)
 * Comprehensive Verification Test Suite: Test Cases 1 through 9
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { resetAllFakeRepositories } from './fixtures/fakeRepositories';
import { defaultPatientRepository } from '../modules/patients/repository';
import { defaultCourseRepository } from '../modules/courses/repository';
import { resetAuthTestState } from '../middleware/authenticate';

describe('[MASTER VERIFICATION] Appointment Synchronization (Admin to PT)', () => {
  const app = createApp();

  const PT_1_ID = 'b1000000-0000-0000-0000-000000000001';
  const PT_2_ID = 'b1000000-0000-0000-0000-000000000002';
  const ADMIN_ID = 'a1000000-0000-0000-0000-000000000001';

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

  it('TEST 1 - 3: Admin adds appointment, records in DB, and assigns therapist correctly', async () => {
    // Register patient with no pre-assigned PT
    const patient = await defaultPatientRepository.createPatient(
      { first_name: 'สมศรี', last_name: 'รักษ์ไทย', injury: 'ปวดหลังส่วนล่าง' },
      ADMIN_ID
    );
    expect(patient.id).toBeDefined();

    // TEST 1: Admin creates an appointment/course assigned to PT_1
    const res = await request(app)
      .post('/api/courses')
      .set('Cookie', [`access_token=mock-token:${ADMIN_ID}:admin:active`])
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        patient_id: patient.id,
        pt_id: PT_1_ID,
        start_date: '2026-11-15',
        end_date: '2026-11-30',
        weekdays: [1, 3, 5],
        start_time: '10:00',
        items: [{ exercise_id: 'e1000000-0000-0000-0000-000000000001', sets: 3, reps: 10, position: 1 }],
      });

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);

    // TEST 2: Verify course record in DB
    const course = res.body.data;
    expect(course.id).toBeDefined();
    expect(course.patient_id).toBe(patient.id);
    expect(course.start_date).toBe('2026-11-15');
    expect(course.end_date).toBe('2026-11-30');
    expect(course.status).toBe('active');

    // TEST 3: Verify Assigned Therapist ID is PT_1_ID (not Admin's ID)
    expect(course.pt_id).toBe(PT_1_ID);
  });

  it('TEST 4 - 6: PT logs in, sees appointment in calendar, and preserves on browser refresh', async () => {
    // 1. Patient created by Admin and assigned to PT_1
    const patient = await defaultPatientRepository.createPatient(
      { first_name: 'อนันต์', last_name: 'ชูใจ', injury: 'ผ่าตัดข้อเข่า' },
      ADMIN_ID,
      PT_1_ID
    );

    // 2. Admin creates course for patient under PT_1
    const createRes = await request(app)
      .post('/api/courses')
      .set('Cookie', [`access_token=mock-token:${ADMIN_ID}:admin:active`])
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        patient_id: patient.id,
        pt_id: PT_1_ID,
        start_date: '2026-11-10',
        end_date: '2026-11-25',
        weekdays: [1, 2, 4],
        start_time: '14:00',
        items: [{ exercise_id: 'e1000000-0000-0000-0000-000000000002', sets: 3, reps: 12, position: 1 }],
      });
    expect(createRes.status).toBe(201);
    const courseId = createRes.body.data.id;

    // TEST 4: Login as PT_1 and query calendar
    const calRes1 = await request(app)
      .get('/api/courses/calendar?start_date=2026-11-01&end_date=2026-11-30')
      .set('Cookie', [`access_token=mock-token:${PT_1_ID}:pt:active`])
      .set('X-Requested-With', 'XMLHttpRequest');

    expect(calRes1.status).toBe(200);
    expect(calRes1.body.ok).toBe(true);
    const appointments1 = calRes1.body.data;

    // TEST 5: Verify appointment appears in PT_1's calendar
    const found = appointments1.find((c: any) => c.id === courseId);
    expect(found).toBeDefined();
    expect(found.pt_id).toBe(PT_1_ID);
    expect(found.patient_id).toBe(patient.id);

    // TEST 6: Simulate browser refresh (repeated fetch)
    const calRes2 = await request(app)
      .get('/api/courses/calendar?start_date=2026-11-01&end_date=2026-11-30')
      .set('Cookie', [`access_token=mock-token:${PT_1_ID}:pt:active`])
      .set('X-Requested-With', 'XMLHttpRequest');

    expect(calRes2.status).toBe(200);
    const appointments2 = calRes2.body.data;
    const foundAfterRefresh = appointments2.find((c: any) => c.id === courseId);
    expect(foundAfterRefresh).toBeDefined();
    expect(foundAfterRefresh.id).toBe(courseId);
  });

  it('TEST 7: Admin updates appointment date, and PT immediately sees the new schedule', async () => {
    const patient = await defaultPatientRepository.createPatient(
      { first_name: 'พรทิพย์', last_name: 'มีสุข', injury: 'ไหล่ติด' },
      ADMIN_ID,
      PT_1_ID
    );

    const course = await defaultCourseRepository.createCourse(
      {
        patient_id: patient.id,
        start_date: '2026-11-10',
        end_date: '2026-11-20',
        weekdays: [2, 4],
        start_time: '09:00',
      },
      PT_1_ID
    );

    // Admin updates schedule to new dates using PATCH
    const updateRes = await request(app)
      .patch(`/api/courses/${course.id}`)
      .set('Cookie', [`access_token=mock-token:${ADMIN_ID}:admin:active`])
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        start_date: '2026-11-12',
        end_date: '2026-11-28',
        weekdays: [1, 3, 5],
        start_time: '11:00',
        version: 1,
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.ok).toBe(true);
    expect(updateRes.body.data.start_date).toBe('2026-11-12');
    expect(updateRes.body.data.end_date).toBe('2026-11-28');

    // PT_1 queries calendar and sees updated dates
    const ptCal = await request(app)
      .get('/api/courses/calendar?start_date=2026-11-01&end_date=2026-11-30')
      .set('Cookie', [`access_token=mock-token:${PT_1_ID}:pt:active`])
      .set('X-Requested-With', 'XMLHttpRequest');

    const updatedCourseInPtCalendar = ptCal.body.data.find((c: any) => c.id === course.id);
    expect(updatedCourseInPtCalendar).toBeDefined();
    expect(updatedCourseInPtCalendar.start_date).toBe('2026-11-12');
    expect(updatedCourseInPtCalendar.end_date).toBe('2026-11-28');
    expect(updatedCourseInPtCalendar.start_time).toBe('11:00');
  });

  it('TEST 8: Admin cancels appointment, and PT sees updated cancelled status', async () => {
    const patient = await defaultPatientRepository.createPatient(
      { first_name: 'กิตติ', last_name: 'มั่นคง', injury: 'ฟื้นฟูกล้ามเนื้อ' },
      ADMIN_ID,
      PT_1_ID
    );

    const course = await defaultCourseRepository.createCourse(
      {
        patient_id: patient.id,
        start_date: '2026-11-10',
        end_date: '2026-11-20',
        weekdays: [1, 3],
      },
      PT_1_ID
    );

    // Admin cancels course using DELETE or PATCH
    const cancelRes = await request(app)
      .delete(`/api/courses/${course.id}`)
      .set('Cookie', [`access_token=mock-token:${ADMIN_ID}:admin:active`])
      .set('X-Requested-With', 'XMLHttpRequest');

    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.ok).toBe(true);

    // PT_1 queries calendar - cancelled course is excluded from active appointments
    const ptCal = await request(app)
      .get('/api/courses/calendar?start_date=2026-11-01&end_date=2026-11-30')
      .set('Cookie', [`access_token=mock-token:${PT_1_ID}:pt:active`])
      .set('X-Requested-With', 'XMLHttpRequest');

    const match = ptCal.body.data.find((c: any) => c.id === course.id);
    expect(match).toBeUndefined();
  });

  it('TEST 9: Multi-tenant PT isolation: PT-2 CANNOT see appointments assigned to PT-1', async () => {
    // Patient 1 assigned to PT_1
    const patient1 = await defaultPatientRepository.createPatient(
      { first_name: 'คนไข้', last_name: 'ของหมอหนึ่ง', injury: 'ปวดหลัง' },
      ADMIN_ID,
      PT_1_ID
    );
    const course1 = await defaultCourseRepository.createCourse(
      {
        patient_id: patient1.id,
        start_date: '2026-11-10',
        end_date: '2026-11-30',
        weekdays: [1, 3, 5],
      },
      PT_1_ID
    );

    // Patient 2 assigned to PT_2
    const patient2 = await defaultPatientRepository.createPatient(
      { first_name: 'คนไข้', last_name: 'ของหมอสอง', injury: 'ปวดเข่า' },
      ADMIN_ID,
      PT_2_ID
    );
    const course2 = await defaultCourseRepository.createCourse(
      {
        patient_id: patient2.id,
        start_date: '2026-11-10',
        end_date: '2026-11-30',
        weekdays: [2, 4],
      },
      PT_2_ID
    );

    // PT_2 queries calendar
    const pt2Cal = await request(app)
      .get('/api/courses/calendar?start_date=2026-11-01&end_date=2026-11-30')
      .set('Cookie', [`access_token=mock-token:${PT_2_ID}:pt:active`])
      .set('X-Requested-With', 'XMLHttpRequest');

    expect(pt2Cal.status).toBe(200);
    const pt2Appointments = pt2Cal.body.data;

    // PT_2 MUST see course2
    const foundCourse2 = pt2Appointments.find((c: any) => c.id === course2.id);
    expect(foundCourse2).toBeDefined();

    // PT_2 MUST NOT see course1 (assigned to PT_1)
    const foundCourse1 = pt2Appointments.find((c: any) => c.id === course1.id);
    expect(foundCourse1).toBeUndefined();
  });
});
