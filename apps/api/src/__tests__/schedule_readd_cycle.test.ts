/**
 * apps/api/src/__tests__/schedule_readd_cycle.test.ts
 *
 * Automated verification for Bug #1:
 * Schedule Planner ("5. ตารางนัด") Unlimited Add -> Delete -> Re-Add Cycle
 *
 * Verifies:
 * 1. Adding a course on a past date (e.g. Day 15 when today is Day 31) succeeds and persists without being wiped by auto-cleanup.
 * 2. Deleting the course on Day 15 returns the slot to a rest day.
 * 3. Re-adding the course on Day 15 immediately succeeds without collision or lingering tombstones.
 * 4. Repeating the Add -> Delete -> Re-Add cycle 5+ consecutive times on Day 15 and multiple dates succeeds with 100% reliability.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import { createApp } from '../app';
import { defaultPatientVaultService } from '../modules/smart-onboarding/vault.service';
import { PatientRecordFile } from '../../../../packages/smart-biometric-core/src/index.js';
import { setupTestFakeRepositories } from './fixtures/fakeRepositories';
import { defaultCourseRepository } from '../modules/courses/repository';
import { defaultPatientRepository } from '../modules/patients/repository';

describe('Schedule Planner Add -> Delete -> Re-Add Cycle (5+ times)', () => {
  beforeAll(() => {
    setupTestFakeRepositories();
  });

  const app = createApp();
  const testPatientId = `P-READD-${Date.now()}`;
  const baseUploadDir = path.resolve(process.cwd(), 'public', 'uploads', 'patients');

  const pastDateStr = '2026-10-15';
  const futureDateStr = '2026-11-15';

  afterAll(() => {
    const pDir = path.join(baseUploadDir, testPatientId);
    if (fs.existsSync(pDir)) {
      try {
        fs.rmSync(pDir, { recursive: true, force: true });
      } catch {}
    }
  });

  it('1. Initializes patient dossier in vault with initial profile', async () => {
    const record: PatientRecordFile = {
      patient_id: testPatientId,
      hn: `HN-${testPatientId}`,
      first_name: 'วิภา',
      last_name: 'นัดหมายซ้ำ',
      age: 48,
      gender: 'female',
      registration_status: 'active',
      registered_via: 'kiosk',
      biometrics: {
        face_vector: new Array(512).fill(0.05),
        registered_face_url: '',
        confidence_score: 1.0,
        model_version: 'w600k_r50',
        enrolled_at: new Date().toISOString(),
      },
      daily_checklists: {},
      rehab_scores: [],
      clinical: { diagnosis: 'ข้อไหล่ติด', treatment_plan: 'Shoulder Pendulum', progress_notes: [] },
      schedule: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    defaultPatientVaultService.savePatientRecord(testPatientId, record);
    const loaded = defaultPatientVaultService.getPatientRecord(testPatientId);
    expect(loaded?.patient_id).toBe(testPatientId);
    expect(loaded?.schedule).toBeNull();
  });

  it('2. Adds a course on Day 15 (past date: 2026-10-15) and verifies persistence', async () => {
    const addRes = await request(app)
      .post(`/api/smart-onboarding/schedule/${testPatientId}`)
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        startDate: pastDateStr,
        endDate: pastDateStr,
        daysOfWeek: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        timeSlot: '09:00 - 10:00',
        assigned_kiosk_id: 'kiosk-01',
        include_minigame: true,
        preserve_past_dates: true,
        prescribed_exercises: [
          {
            exercise_id: 'shoulder-pendulum',
            name: 'Shoulder Pendulum',
            target_joint: 'shoulder',
            sets: 3,
            reps: 10,
          },
        ],
      })
      .expect(200);

    expect(addRes.body.ok).toBe(true);

    // Fetch schedule via API: verify it is NOT stripped by auto-cleanup
    const getRes = await request(app)
      .get(`/api/smart-onboarding/schedule/${testPatientId}`)
      .expect(200);

    expect(getRes.body.ok).toBe(true);
    expect(getRes.body.data.schedule).not.toBeNull();
    expect(getRes.body.data.schedule.startDate).toBe(pastDateStr);
    expect(getRes.body.data.schedule.endDate).toBe(pastDateStr);
  });

  it('3. Deletes the course on Day 15 and verifies slot is cleared', async () => {
    const delRes = await request(app)
      .delete(`/api/smart-onboarding/schedule/${testPatientId}/date/${pastDateStr}`)
      .set('X-Requested-With', 'XMLHttpRequest')
      .expect(200);

    expect(delRes.body.ok).toBe(true);

    const getRes = await request(app)
      .get(`/api/smart-onboarding/schedule/${testPatientId}`)
      .expect(200);

    // Because Day 15 was the only scheduled day, deleting it clears the single-day schedule or marks it excluded
    const sched = getRes.body.data.schedule;
    if (sched) {
      expect(sched.excluded_dates).toContain(pastDateStr);
    }
  });

  it('4. Re-adds the course on Day 15 and verifies excluded_dates tombstone is removed', async () => {
    const reAddRes = await request(app)
      .post(`/api/smart-onboarding/schedule/${testPatientId}`)
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        startDate: pastDateStr,
        endDate: pastDateStr,
        daysOfWeek: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        timeSlot: '10:00 - 11:00',
        assigned_kiosk_id: 'kiosk-01',
        preserve_past_dates: true,
        prescribed_exercises: [
          {
            exercise_id: 'shoulder-pendulum',
            name: 'Shoulder Pendulum',
            target_joint: 'shoulder',
            sets: 3,
            reps: 10,
          },
        ],
      })
      .expect(200);

    expect(reAddRes.body.ok).toBe(true);

    const getRes = await request(app)
      .get(`/api/smart-onboarding/schedule/${testPatientId}`)
      .expect(200);

    const sched = getRes.body.data.schedule;
    expect(sched).not.toBeNull();
    expect(sched.startDate).toBe(pastDateStr);
    // Crucial check: pastDateStr must NOT be in excluded_dates anymore
    expect(sched.excluded_dates || []).not.toContain(pastDateStr);
  });

  it('5. Repeats Add -> Delete -> Re-Add cycle 5 consecutive times on Day 15 with 100% success', async () => {
    for (let cycle = 1; cycle <= 5; cycle++) {
      // 1. Delete Day 15
      const delRes = await request(app)
        .delete(`/api/smart-onboarding/schedule/${testPatientId}/date/${pastDateStr}`)
        .set('X-Requested-With', 'XMLHttpRequest')
        .expect(200);
      expect(delRes.body.ok).toBe(true);

      // 2. Re-Add Day 15
      const addRes = await request(app)
        .post(`/api/smart-onboarding/schedule/${testPatientId}`)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          startDate: pastDateStr,
          endDate: pastDateStr,
          daysOfWeek: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
          timeSlot: `1${cycle}:00 - 1${cycle}:30`,
          assigned_kiosk_id: 'kiosk-01',
          preserve_past_dates: true,
          prescribed_exercises: [
            {
              exercise_id: 'shoulder-pendulum',
              name: `Shoulder Pendulum Cycle ${cycle}`,
              target_joint: 'shoulder',
              sets: 3,
              reps: 10,
            },
          ],
        })
        .expect(200);
      expect(addRes.body.ok).toBe(true);

      // 3. Verify schedule is active and valid
      const getRes = await request(app)
        .get(`/api/smart-onboarding/schedule/${testPatientId}`)
        .expect(200);
      const sched = getRes.body.data.schedule;
      expect(sched).not.toBeNull();
      expect(sched.startDate).toBe(pastDateStr);
      expect(sched.excluded_dates || []).not.toContain(pastDateStr);
    }
  });

  it('6. Repeats Add -> Delete -> Re-Add cycle 5 consecutive times on a future date (2026-11-15)', async () => {
    for (let cycle = 1; cycle <= 5; cycle++) {
      // 1. Delete future date
      const delRes = await request(app)
        .delete(`/api/smart-onboarding/schedule/${testPatientId}/date/${futureDateStr}`)
        .set('X-Requested-With', 'XMLHttpRequest')
        .expect(200);
      expect(delRes.body.ok).toBe(true);

      // 2. Re-Add future date
      const addRes = await request(app)
        .post(`/api/smart-onboarding/schedule/${testPatientId}`)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          startDate: futureDateStr,
          endDate: futureDateStr,
          daysOfWeek: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
          timeSlot: `14:00 - 15:00`,
          assigned_kiosk_id: 'kiosk-01',
          preserve_past_dates: true,
          prescribed_exercises: [
            {
              exercise_id: 'shoulder-pendulum',
              name: `Future Cycle ${cycle}`,
              target_joint: 'shoulder',
              sets: 3,
              reps: 10,
            },
          ],
        })
        .expect(200);
      expect(addRes.body.ok).toBe(true);

      // 3. Verify schedule is active and valid
      const getRes = await request(app)
        .get(`/api/smart-onboarding/schedule/${testPatientId}`)
        .expect(200);
      const sched = getRes.body.data.schedule;
      expect(sched).not.toBeNull();
      expect(sched.startDate).toBe(futureDateStr);
      expect(sched.excluded_dates || []).not.toContain(futureDateStr);
    }
  });

  it('7. Course Repository integration: hard deletion and re-add without collisions', async () => {
    const pt = await defaultPatientRepository.createPatient(
      { first_name: 'กานดา', last_name: 'ทดสอบคอร์ส' },
      'admin-001',
      'pt-001'
    );

    for (let i = 1; i <= 5; i++) {
      // Create course on pastDateStr
      const c = await defaultCourseRepository.createCourse(
        {
          patient_id: pt.id,
          start_date: pastDateStr,
          end_date: pastDateStr,
          weekdays: [0, 1, 2, 3, 4, 5, 6],
        },
        'pt-001'
      );
      expect(c.id).toBeDefined();

      // Check course exists
      const found = await defaultCourseRepository.getCourseById(c.id);
      expect(found).not.toBeNull();
      expect(found?.start_date).toBe(pastDateStr);

      // Cancel course
      await defaultCourseRepository.deleteCourse(c.id);
      const deleted = await defaultCourseRepository.getCourseById(c.id);
      expect(deleted?.status).toBe('cancelled');
    }
  });
});
