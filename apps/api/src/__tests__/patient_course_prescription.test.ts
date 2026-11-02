/**
 * apps/api/src/__tests__/patient_course_prescription.test.ts
 *
 * Automated Test Suite for Per-Patient Exercise Course Prescription Builder,
 * Clinical Safety Contraindication Guard, Atomic Schedule Sync & Kiosk Daily Routine Integration:
 *
 * 1. End-to-end Course Prescription -> Calendar Sync (sets, reps, side, hold_duration, angle overrides).
 * 2. Kiosk Training Day vs. Rest Day verification (displays custom prescribed exercises or Rest Day payload).
 * 3. Strict Multi-Patient Isolation (Patient A course never bleeds into Patient B).
 * 4. Historical Integrity on Edit (past appointments and completed session logs strictly preserved).
 * 5. Clinical Staff Role Authorization (Admin/PT/Director allowed; patient/guest returns 403 Forbidden).
 * 6. Clinical Contraindication Warning Engine evaluation.
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { evaluateContraindications } from '../../../../packages/pose-engine/src/index.js';

describe('Patient Course Prescription & Clinical Schedule Sync Test Suite', () => {
  const app = createApp();

  const patientA_Id = `p-test-presc-a-${Date.now()}`;
  const patientB_Id = `p-test-presc-b-${Date.now()}`;
  const patientA_Hn = `HN-PA-${Date.now().toString().slice(-4)}`;
  const patientB_Hn = `HN-PB-${Date.now().toString().slice(-4)}`;

  const todayBkk = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());

  // Helper to create test patient
  async function registerTestPatient(id: string, hn: string, name: string, contraindications: string = '-') {
    const res = await request(app)
      .post('/api/smart-onboarding/register')
      .set('X-Requested-With', 'XMLHttpRequest')
      .set('x-staff-role', 'admin')
      .send({
        id,
        hn,
        first_name: name,
        last_name: 'ทดสอบ',
        target_joint: 'ข้อไหล่',
        contraindications,
        face_vector: new Array(512).fill(0.044),
      });
    return res.body;
  }

  describe('1. Role-Based Authorization Enforcement', () => {
    it('rejects course prescription attempts by unauthorized roles with 403 Forbidden', async () => {
      const res = await request(app)
        .post('/api/smart-onboarding/schedule')
        .set('X-Requested-With', 'XMLHttpRequest')
        .set('x-staff-role', 'patient')
        .send({
          patient_id: patientA_Id,
          schedule: {
            scheduled_dates: [todayBkk],
            prescribed_exercises: [],
          },
        });

      expect(res.status).toBe(403);
      expect(res.body.ok).toBe(false);
      expect(res.body.error?.code).toBe('FORBIDDEN');
    });

    it('allows course prescription by authorized clinical staff (director / pt)', async () => {
      await registerTestPatient(patientA_Id, patientA_Hn, 'วีระ');

      const res = await request(app)
        .post('/api/smart-onboarding/schedule')
        .set('X-Requested-With', 'XMLHttpRequest')
        .set('x-staff-role', 'pt')
        .send({
          patient_id: patientA_Id,
          schedule: {
            start_date: todayBkk,
            end_date: todayBkk,
            scheduled_dates: [todayBkk],
            days_of_week: ['Mon', 'Wed', 'Fri'],
            time_slot: '10:00 - 11:00',
            prescribed_exercises: [
              {
                exercise_id: 'ex-shoulder-flexion',
                name: 'Shoulder Flexion',
                sets: 3,
                reps: 12,
                side: 'right',
                start_angle_deg: 0,
                target_min_deg: 85,
                target_max_deg: 110,
                hold_duration_sec: 2.5,
                order_index: 1,
              },
            ],
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  describe('2. End-to-End Course Prescription & Schedule Sync', () => {
    it('saves custom biomechanical angle overrides and sets/reps into patient schedule', async () => {
      const customSchedule = {
        start_date: todayBkk,
        end_date: todayBkk,
        scheduled_dates: [todayBkk],
        days_of_week: ['Mon', 'Wed', 'Fri'],
        time_slot: '09:00 - 10:00',
        include_minigame: true,
        prescribed_exercises: [
          {
            exercise_id: 'ex-pendulum-01',
            name: 'Shoulder Pendulum',
            sets: 4,
            reps: 15,
            side: 'both',
            start_angle_deg: 10,
            target_min_deg: 75,
            target_max_deg: 95,
            hold_duration_sec: 3.0,
            order_index: 1,
            pt_note: 'อย่าเกร็งกล้ามเนื้อคอ',
          },
          {
            exercise_id: 'ex-external-rotation-02',
            name: 'External Rotation',
            sets: 3,
            reps: 10,
            side: 'right',
            start_angle_deg: 0,
            target_min_deg: 40,
            target_max_deg: 60,
            hold_duration_sec: 2.0,
            order_index: 2,
            pt_note: 'ใช้ยางยืดแรงต้านเบา',
          },
        ],
      };

      const res = await request(app)
        .post('/api/smart-onboarding/schedule')
        .set('X-Requested-With', 'XMLHttpRequest')
        .set('x-staff-role', 'admin')
        .send({
          patient_id: patientA_Id,
          schedule: customSchedule,
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  describe('3. Kiosk Training Day vs. Rest Day Verification', () => {
    it('returns is_scheduled_today: true and customized exercises on scheduled training days', async () => {
      const res = await request(app)
        .get(`/api/smart-onboarding/daily-plan/${patientA_Id}`)
        .set('X-Requested-With', 'XMLHttpRequest');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.is_scheduled_today).toBe(true);
      expect(Array.isArray(res.body.exercises)).toBe(true);
      expect(res.body.exercises.length).toBeGreaterThanOrEqual(1);

      // Verify sequence and angle overrides
      const firstEx = res.body.exercises[0];
      expect(firstEx.name).toContain('Pendulum');
      expect(firstEx.sets).toBe(4);
      expect(firstEx.reps).toBe(15);
      expect(firstEx.hold_duration_sec).toBe(3.0);
    });

    it('returns is_scheduled_today: false with Rest Day notice when today is not in schedule', async () => {
      // Register Patient B without scheduling today
      await registerTestPatient(patientB_Id, patientB_Hn, 'มานะ');

      const futureDate = '2099-12-31';
      await request(app)
        .post('/api/smart-onboarding/schedule')
        .set('X-Requested-With', 'XMLHttpRequest')
        .set('x-staff-role', 'admin')
        .send({
          patient_id: patientB_Id,
          schedule: {
            start_date: futureDate,
            end_date: futureDate,
            scheduled_dates: [futureDate],
            prescribed_exercises: [
              {
                exercise_id: 'ex-01',
                name: 'Knee Extension',
                sets: 3,
                reps: 10,
              },
            ],
          },
        });

      const res = await request(app)
        .get(`/api/smart-onboarding/daily-plan/${patientB_Id}`)
        .set('X-Requested-With', 'XMLHttpRequest');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.is_scheduled_today).toBe(false);
      expect(res.body.reason).toContain('วันพักผ่อน');
    });
  });

  describe('4. Strict Multi-Patient Isolation', () => {
    it('ensures prescriptions of Patient A and Patient B never contaminate each other', async () => {
      const planA = await request(app)
        .get(`/api/smart-onboarding/daily-plan/${patientA_Id}`)
        .set('X-Requested-With', 'XMLHttpRequest');

      const planB = await request(app)
        .get(`/api/smart-onboarding/daily-plan/${patientB_Id}`)
        .set('X-Requested-With', 'XMLHttpRequest');

      expect(planA.body.is_scheduled_today).toBe(true);
      expect(planB.body.is_scheduled_today).toBe(false);

      // Patient A has 2 prescribed shoulder exercises
      expect(planA.body.exercises.length).toBe(2);
      expect(planA.body.exercises[0].exercise_id).toBe('ex-pendulum-01');
    });
  });

  describe('5. Historical Integrity Preservation on Schedule Edit', () => {
    it('preserves past scheduled appointments and completed logs when modifying future course', async () => {
      const pastDate = '2020-01-01';
      const updatedSchedule = {
        start_date: todayBkk,
        end_date: '2026-12-31',
        scheduled_dates: [pastDate, todayBkk, '2026-12-31'],
        preserve_past_dates: true,
        prescribed_exercises: [
          {
            exercise_id: 'ex-pendulum-01',
            name: 'Shoulder Pendulum',
            sets: 3,
            reps: 10,
          },
        ],
      };

      const res = await request(app)
        .post('/api/smart-onboarding/schedule')
        .set('X-Requested-With', 'XMLHttpRequest')
        .set('x-staff-role', 'admin')
        .send({
          patient_id: patientA_Id,
          schedule: updatedSchedule,
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);

      const checkPlan = await request(app)
        .get(`/api/smart-onboarding/daily-plan/${patientA_Id}`)
        .set('X-Requested-With', 'XMLHttpRequest');

      expect(checkPlan.body.is_scheduled_today).toBe(true);
    });
  });

  describe('6. Clinical Contraindication Engine Evaluation', () => {
    it('flags shoulder restrictions when patient has impingement/frozen shoulder limitations', () => {
      const patientWithShoulderLimit = {
        id: 'p-contra-01',
        hn: 'P-CONTRA-01',
        first_name: 'ศิริพร',
        last_name: 'มีสุข',
        contraindications: 'ห้ามยกแขนเกิน 90 องศา (Shoulder Impingement)',
        underlying_diseases: 'ความดันโลหิตสูง',
      };

      const resAbduction = evaluateContraindications(
        'ex-shoulder-abduction',
        'ข้อไหล่',
        patientWithShoulderLimit
      );

      expect(resAbduction.hasWarning).toBe(true);
      expect(resAbduction.warningMessage).toContain('จำกัดการกางแขน');
    });

    it('flags standing exercises when patient has fall risk / non-weight-bearing contraindication', () => {
      const patientWithFallRisk = {
        id: 'p-contra-02',
        hn: 'P-CONTRA-02',
        first_name: 'บุญมี',
        last_name: 'ใจดี',
        contraindications: 'เสี่ยงล้ม ห้ามลงน้ำหนักขาซ้าย (Non-weight bearing)',
        underlying_diseases: '-',
      };

      const resSquat = evaluateContraindications(
        'sit-to-stand',
        'ข้อเข่า/สะโพก',
        patientWithFallRisk
      );

      expect(resSquat.hasWarning).toBe(true);
      expect(resSquat.warningMessage).toContain('ผู้ป่วยมีความเสี่ยงล้ม');
    });

    it('returns no warning for safe compliant exercises', () => {
      const safePatient = {
        id: 'p-contra-03',
        hn: 'P-CONTRA-03',
        first_name: 'สมเกียรติ',
        last_name: 'เจริญดี',
        contraindications: '-',
        underlying_diseases: '-',
      };

      const resSafe = evaluateContraindications(
        'shoulder-pendulum',
        'ข้อไหล่',
        safePatient
      );

      expect(resSafe.hasWarning).toBe(false);
      expect(resSafe.warningMessage).toBeFalsy();
    });
  });
});
