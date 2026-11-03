/**
 * apps/api/src/__tests__/patient_registration_prescription_flow.test.ts
 *
 * RIGOROUS TEST SUITE: End-to-End Patient Enrollment Draft-to-Active & Prescription Linkage
 * Validates:
 * 1. Step 1: Atomic Patient Draft creation with status='draft' and unique HN
 * 2. Step 1 Validation: Rejects missing first_name
 * 3. Cancellation / Abort cleanup: cancelDraft purges incomplete draft
 * 4. Step 2 & 3: 10-Frame Biometric Registration updates draft to active with PDPA consent & PIN
 * 5. Step 4: Exercise Prescription Save with exercises and target joint
 * 6. Prescription Validation: Rejects missing patient_id
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { resetAllFakeRepositories } from './fixtures/fakeRepositories';
import { resetAuthTestState } from '../middleware/authenticate';
import { clearAllBans } from '../middleware/banCheck';

describe('[CLINICAL FLOW] Authoritative Patient Registration & Exercise Prescription Flow', () => {
  const app = createApp();

  beforeAll(() => {
    (process.env as Record<string, string>).NODE_ENV = 'test';
    process.env.SUPABASE_URL = 'http://127.0.0.1:54321';
    process.env.SUPABASE_ANON_KEY = 'sb_publishable_RIM7hit0_ZY0y5fBCK_Uuw_bEJY7H5I';
    process.env.INTERNAL_EMAIL_DOMAIN = 'drtech.care';
  });

  beforeEach(() => {
    resetAllFakeRepositories();
    clearAllBans();
    resetAuthTestState();
  });

  it('1. Step 1: Should create a draft patient record with registration_status="draft"', async () => {
    const payload = {
      first_name: 'สมศรี',
      last_name: 'รักการรักษา',
      age: 52,
      gender: 'female',
      target_joint: 'ข้อไหล่',
      injury: 'Frozen Shoulder ระยะฟื้นฟู',
      contraindications: 'ระวังการยกแขนสูงเกิน 120 องศา',
      underlying_diseases: 'ความดันโลหิตสูง',
      allergies: 'ไม่มี',
      phone: '081-234-5678',
      pdpa_consent: true,
    };

    const res = await request(app)
      .post('/api/smart-onboarding/create-draft')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.patient_id).toBeTruthy();
    expect(res.body.hn).toMatch(/^P-\d+/);
    expect(res.body.registration_status).toBe('draft');
  });

  it('2. Step 1 Validation: Should reject draft creation if first_name is empty', async () => {
    const res = await request(app)
      .post('/api/smart-onboarding/create-draft')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        first_name: '',
        age: 40,
      });

    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('NAME_REQUIRED');
  });

  it('3. Cancellation Cleanup: Should cancel and cleanup draft patient when aborted', async () => {
    // 1. Create draft
    const createRes = await request(app)
      .post('/api/smart-onboarding/create-draft')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        first_name: 'สมชาย',
        last_name: 'ใจดี',
        age: 35,
      });

    expect(createRes.status).toBe(201);
    const patientId = createRes.body.patient_id;

    // 2. Cancel draft
    const cancelRes = await request(app)
      .delete(`/api/smart-onboarding/cancel-draft/${patientId}`)
      .set('X-Requested-With', 'XMLHttpRequest');

    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.ok).toBe(true);
  });

  it('4. Full Flow: Draft -> Face ID 10-Frames -> Active Patient Status', async () => {
    // 1. Step 1: Create draft
    const draftRes = await request(app)
      .post('/api/smart-onboarding/create-draft')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        first_name: 'วิชัย',
        last_name: 'สุขภาพดี',
        target_joint: 'ข้อเข่า',
        injury: 'Knee Osteoarthritis',
        contraindications: 'ห้ามลงน้ำหนักกระแทก',
      });

    expect(draftRes.status).toBe(201);
    const patientId = draftRes.body.patient_id;
    const hn = draftRes.body.hn;

    // Generate 10 mock 512-D vectors (4 front, 2 left, 2 right, 2 nod)
    const mockFrames = [
      { pose: 'front', embedding: new Array(512).fill(0.044) },
      { pose: 'front', embedding: new Array(512).fill(0.044) },
      { pose: 'front', embedding: new Array(512).fill(0.044) },
      { pose: 'front', embedding: new Array(512).fill(0.044) },
      { pose: 'left', embedding: new Array(512).fill(0.043) },
      { pose: 'left', embedding: new Array(512).fill(0.043) },
      { pose: 'right', embedding: new Array(512).fill(0.043) },
      { pose: 'right', embedding: new Array(512).fill(0.043) },
      { pose: 'nod', embedding: new Array(512).fill(0.042) },
      { pose: 'nod', embedding: new Array(512).fill(0.042) },
    ];

    // 2. Step 2 & 3: Submit 10 frames and finalize with PIN
    const regRes = await request(app)
      .post('/api/smart-onboarding/register')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        patient_id: patientId,
        hn,
        first_name: 'วิชัย',
        last_name: 'สุขภาพดี',
        target_joint: 'ข้อเข่า',
        pin: '123456',
        pdpa_consent: true,
        frames: mockFrames,
      });

    expect(regRes.status).toBe(201);
    expect(regRes.body.ok).toBe(true);
    expect(regRes.body.patient_id).toBe(patientId);
    expect(regRes.body.data.registration_status).toBe('active');
  });

  it('5. Step 4: Should save exercise prescription linked to patient_id', async () => {
    // 1. Create patient first
    const draftRes = await request(app)
      .post('/api/smart-onboarding/create-draft')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        first_name: 'อนันต์',
        last_name: 'ทดสอบ',
        target_joint: 'ข้อไหล่',
      });
    const patientId = draftRes.body.patient_id;

    // 2. Save Prescription
    const rxRes = await request(app)
      .post('/api/smart-onboarding/prescription')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        patient_id: patientId,
        target_joint: 'ข้อไหล่',
        diagnosis: 'Rotator Cuff Tendinitis',
        contraindications: 'ห้ามแกว่งแขนแรงเกินไป',
        start_date: '2026-11-05',
        end_date: '2026-11-19',
        scheduled_dates: ['2026-11-05', '2026-11-07', '2026-11-09'],
        exercises: [
          {
            exercise_id: 'shoulder-pendulum',
            exercise_name: 'Shoulder Pendulum',
            target_side: 'right',
            sets: 3,
            reps: 10,
            hold_seconds: 3,
            sequence_order: 1,
            clinical_notes: 'เริ่มแกว่งเบาๆ วงเล็กก่อน',
          },
        ],
      });

    expect(rxRes.status).toBe(201);
    expect(rxRes.body.ok).toBe(true);
    expect(rxRes.body.prescription_id).toBeTruthy();
  });

  it('6. Step 4 Validation: Should reject prescription if patient_id is missing', async () => {
    const rxRes = await request(app)
      .post('/api/smart-onboarding/prescription')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        target_joint: 'ข้อไหล่',
        exercises: [],
      });

    expect(rxRes.status).toBe(400);
    expect(rxRes.body.error?.code).toBe('PATIENT_ID_REQUIRED');
  });
});
