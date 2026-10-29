/**
 * apps/api/src/__tests__/schedule_cleanup_and_delete.test.ts
 * Integration tests for:
 * 1. Auto-cleanup past/expired schedule days (Asia/Bangkok)
 * 2. Manual deletion of single appointment date
 * 3. Clearing all schedule of a patient
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import { createApp } from '../app';
import { defaultPatientVaultService } from '../modules/smart-onboarding/vault.service';
import { PatientRecordFile } from '../../../../packages/smart-biometric-core/src/index.js';
import { setupTestFakeRepositories } from './fixtures/fakeRepositories';

describe('Schedule Auto-Cleanup & Manual Deletion Integration Tests', () => {
  beforeAll(() => {
    setupTestFakeRepositories();
  });

  const app = createApp();
  const testPatient1 = `P-CLEANUP-1-${Date.now()}`;
  const testPatient2 = `P-CLEANUP-2-${Date.now()}`;
  const baseUploadDir = path.resolve(process.cwd(), 'public', 'uploads', 'patients');

  const todayBkk = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
  const now = new Date();
  const yesterday = new Date(now.getTime() - 86400000);
  const yesterdayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(yesterday);

  const tomorrow = new Date(now.getTime() + 86400000);
  const tomorrowStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(tomorrow);

  const dayAfterTomorrow = new Date(now.getTime() + 86400000 * 2);
  const dayAfterTomorrowStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(dayAfterTomorrow);

  afterAll(() => {
    // Cleanup disk test vaults
    [testPatient1, testPatient2].forEach((pid) => {
      const pDir = path.join(baseUploadDir, pid);
      if (fs.existsSync(pDir)) {
        try {
          fs.rmSync(pDir, { recursive: true, force: true });
        } catch {}
      }
    });
  });

  describe('Test 1: Auto-Delete Past / Expired Schedules (Asia/Bangkok)', () => {
    it('1.1 should auto-clean expired schedules where end_date < today', async () => {
      // Create patient with schedule completely in the past (ended yesterday)
      const expiredRecord: PatientRecordFile = {
        patient_id: testPatient1,
        hn: `HN-${testPatient1}`,
        first_name: 'คนไข้',
        last_name: 'วันนัดอดีต',
        age: 60,
        gender: 'female',
        registration_status: 'active',
        registered_via: 'kiosk',
        biometrics: {
          face_vector: new Array(512).fill(0.01),
          registered_face_url: '',
          confidence_score: 1.0,
          model_version: 'w600k_r50',
          enrolled_at: new Date().toISOString(),
        },
        daily_checklists: {},
        rehab_scores: [],
        clinical: { diagnosis: 'ทดสอบ', treatment_plan: 'ทดสอบ', progress_notes: [] },
        schedule: {
          startDate: '2026-10-01',
          endDate: yesterdayStr,
          daysOfWeek: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
          timeSlot: '09:00 - 10:00',
          assigned_kiosk_id: 'kiosk-01',
          include_minigame: true,
          prescribed_exercises: [{ exercise_id: 'ex-1', name: 'ท่าทดสอบ', target_joint: 'shoulder', sets: 3, reps: 10 }],
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      defaultPatientVaultService.savePatientRecord(testPatient1, expiredRecord);

      // Verify schedule was initially present in memory
      const initial = defaultPatientVaultService.getPatientRecord(testPatient1);
      expect(initial?.schedule).toBeTruthy();
      expect(initial?.schedule?.endDate).toBe(yesterdayStr);

      // Call GET /api/smart-onboarding/schedule/:patientId
      const res = await request(app)
        .get(`/api/smart-onboarding/schedule/${testPatient1}`)
        .expect(200);

      // The expired schedule MUST be auto-deleted (null)
      expect(res.body.ok).toBe(true);
      expect(res.body.data.schedule).toBeNull();

      // Check vault file: schedule was cleaned up
      const afterCleanup = defaultPatientVaultService.getPatientRecord(testPatient1);
      expect(afterCleanup?.schedule).toBeNull();
    });

    it('1.2 should prune past start dates so ongoing schedule starts at today', async () => {
      // Create patient with schedule spanning from past (2026-10-01) to tomorrow
      const ongoingRecord: PatientRecordFile = {
        patient_id: testPatient2,
        hn: `HN-${testPatient2}`,
        first_name: 'คนไข้',
        last_name: 'กำลังรักษา',
        age: 55,
        gender: 'male',
        registration_status: 'active',
        registered_via: 'kiosk',
        biometrics: {
          face_vector: new Array(512).fill(0.02),
          registered_face_url: '',
          confidence_score: 1.0,
          model_version: 'w600k_r50',
          enrolled_at: new Date().toISOString(),
        },
        daily_checklists: {},
        rehab_scores: [],
        clinical: { diagnosis: 'ทดสอบ', treatment_plan: 'ทดสอบ', progress_notes: [] },
        schedule: {
          startDate: '2026-10-01',
          endDate: dayAfterTomorrowStr,
          daysOfWeek: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
          timeSlot: '10:00 - 11:00',
          assigned_kiosk_id: 'kiosk-01',
          include_minigame: true,
          prescribed_exercises: [{ exercise_id: 'ex-2', name: 'ยืดเหยียด', target_joint: 'knee', sets: 3, reps: 10 }],
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      defaultPatientVaultService.savePatientRecord(testPatient2, ongoingRecord);

      // Fetch schedule via API
      const res = await request(app)
        .get(`/api/smart-onboarding/schedule/${testPatient2}`)
        .expect(200);

      expect(res.body.ok).toBe(true);
      const sched = res.body.data.schedule;
      expect(sched).toBeTruthy();
      // Start date must be pruned to todayBkk so past dates are never scheduled
      expect(sched.startDate).toBe(todayBkk);
      expect(sched.endDate).toBe(dayAfterTomorrowStr);
    });
  });

  describe('Test 2: Manual Delete Appointment Date (Single Day Deletion)', () => {
    it('2.1 deletes an appointment on a specific future date and adds to excluded_dates', async () => {
      // Delete appointment for tomorrow
      const delRes = await request(app)
        .delete(`/api/smart-onboarding/schedule/${testPatient2}/date/${tomorrowStr}`)
        .set('X-Requested-With', 'XMLHttpRequest')
        .expect(200);

      expect(delRes.body.ok).toBe(true);
      expect(delRes.body.message).toContain(tomorrowStr);

      // Verify schedule excluded_dates includes tomorrow
      const getRes = await request(app)
        .get(`/api/smart-onboarding/schedule/${testPatient2}`)
        .expect(200);

      const sched = getRes.body.data.schedule;
      expect(sched.excluded_dates).toContain(tomorrowStr);

      // Verify getDailyPlan for tomorrow returns is_scheduled_today: false
      const planRes = await request(app)
        .get(`/api/smart-onboarding/daily-plan/${testPatient2}?date=${tomorrowStr}`)
        .expect(200);

      expect(planRes.body.data.is_scheduled_today).toBe(false);
    });
  });

  describe('Test 3: Clear All Schedule of Patient', () => {
    it('3.1 clears entire schedule of a patient via DELETE /api/smart-onboarding/schedule/:patientId', async () => {
      const clearRes = await request(app)
        .delete(`/api/smart-onboarding/schedule/${testPatient2}`)
        .set('X-Requested-With', 'XMLHttpRequest')
        .expect(200);

      expect(clearRes.body.ok).toBe(true);
      expect(clearRes.body.message).toContain('ล้างตารางนัด');

      // Subsequent GET schedule returns null
      const checkRes = await request(app)
        .get(`/api/smart-onboarding/schedule/${testPatient2}`)
        .expect(200);

      expect(checkRes.body.data.schedule).toBeNull();
    });
  });

  describe('Test 4: Courses API Delete Day & Auto-Cleanup', () => {
    it('4.1 deletes a day from a course via DELETE /api/courses/:id/days/:date', async () => {
      const patient = await (await import('../modules/patients/repository')).defaultPatientRepository.createPatient(
        { first_name: 'สมศรี', last_name: 'นัดหมายคอร์ส' },
        'admin-001',
        'pt-001'
      );

      const course = await (await import('../modules/courses/repository')).defaultCourseRepository.createCourse(
        {
          patient_id: patient.id,
          start_date: tomorrowStr,
          end_date: dayAfterTomorrowStr,
          weekdays: [0, 1, 2, 3, 4, 5, 6],
        },
        'pt-001'
      );

      const res = await request(app)
        .delete(`/api/courses/${course.id}/days/${tomorrowStr}`)
        .set('Cookie', ['access_token=mock-token:admin-001:admin:active'])
        .set('X-Requested-With', 'XMLHttpRequest');

      expect(res.status).toBe(200);

      expect(res.body.ok).toBe(true);
      expect(res.body.message).toContain(tomorrowStr);

      const updated = await (await import('../modules/courses/repository')).defaultCourseRepository.getCourseById(course.id);
      expect(updated?.start_date).toBe(dayAfterTomorrowStr);
    });
  });
});
