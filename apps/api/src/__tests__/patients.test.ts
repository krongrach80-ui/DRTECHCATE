import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { resetAllFakeRepositories } from './fixtures/fakeRepositories';
import { defaultPatientRepository } from '../modules/patients/repository';
import { defaultDirectoryRepository } from '../modules/directory/repository';
import { resetAuthTestState } from '../middleware/authenticate';

describe('[UNIT] DrTech.Care System 5B: Patients & Registration Complete Test Suite', () => {
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
  // 1. Patient Creation & HN Sequence Generation
  // =========================================================================
  describe('1. Patient Creation & Sequence Numbering', () => {
    it('1.1 should create patient with status awaiting_face and issue sequential HN', async () => {
      // 1. PT-1 creates first patient
      const res1 = await request(app)
        .post('/api/patients')
        .set('Cookie', ['access_token=mock-token:pt-001:pt:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          first_name: 'พิชัย',
          last_name: 'ใจดี',
          age: 45,
          sex: 'male',
          phone: '081-234-5678',
          injury: 'Rotator cuff left side',
        });

      expect(res1.status).toBe(201);
      expect(res1.body.ok).toBe(true);
      expect(res1.body.data.hn).toBe('HN100001');
      expect(res1.body.data.registration_status).toBe('awaiting_face');
      expect(res1.body.data.responsible_pt_id).toBe('pt-001'); // automatically assigned
      expect(res1.body.data.phone).toBe('0812345678'); // normalized
      expect(res1.body.data.version).toBe(1);

      // 2. PT-1 creates second patient -> sequential HN
      const res2 = await request(app)
        .post('/api/patients')
        .set('Cookie', ['access_token=mock-token:pt-001:pt:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          first_name: 'สมศรี',
          last_name: 'มีสุข',
          age: 52,
          sex: 'female',
          phone: '+66899887766',
        });

      expect(res2.status).toBe(201);
      expect(res2.body.data.hn).toBe('HN100002');
      expect(res2.body.data.phone).toBe('0899887766'); // normalized from +66
    });
  });

  // =========================================================================
  // 2. Search & Thai Character Trigram Matching
  // =========================================================================
  describe('2. Patient Search with Thai Names & Phone Normalization', () => {
    beforeEach(async () => {
      // Seed patients with real Thai names
      await defaultPatientRepository.createPatient(
        {
          first_name: 'กิตติศักดิ์',
          last_name: 'วงศ์สุวรรณ',
          age: 38,
          phone: '081-111-2233',
        },
        'admin-001',
        'pt-001'
      );

      await defaultPatientRepository.createPatient(
        {
          first_name: 'ประภาส',
          last_name: 'ตั้งตรงจิตต์',
          age: 60,
          phone: '082-333-4455',
        },
        'admin-001',
        'pt-001'
      );

      await defaultPatientRepository.createPatient(
        {
          first_name: 'วิภาดา',
          last_name: 'รักสงบ',
          age: 29,
          phone: '089-777-8899',
        },
        'admin-001',
        'pt-001'
      );
    });

    it('2.1 should find patient by Thai first name', async () => {
      const res = await request(app)
        .get('/api/patients?q=กิตติศักดิ์')
        .set('Cookie', ['access_token=mock-token:admin-001:admin:active']);

      expect(res.status).toBe(200);
      expect(res.body.patients.length).toBe(1);
      expect(res.body.patients[0].first_name).toBe('กิตติศักดิ์');
    });

    it('2.2 should find patient by Thai surname substring', async () => {
      const res = await request(app)
        .get('/api/patients?q=ตั้งตรง')
        .set('Cookie', ['access_token=mock-token:admin-001:admin:active']);

      expect(res.status).toBe(200);
      expect(res.body.patients.length).toBe(1);
      expect(res.body.patients[0].last_name).toBe('ตั้งตรงจิตต์');
    });

    it('2.3 should find patient by normalized phone query', async () => {
      // Search with hyphens for unhyphenated stored phone
      const res = await request(app)
        .get('/api/patients?q=089-777-8899')
        .set('Cookie', ['access_token=mock-token:admin-001:admin:active']);

      expect(res.status).toBe(200);
      expect(res.body.patients.length).toBe(1);
      expect(res.body.patients[0].first_name).toBe('วิภาดา');
    });
  });

  // =========================================================================
  // 3. PT Ownership Boundaries & Multi-PT Data Isolation (DoD Item)
  // =========================================================================
  describe('3. PT Role Isolation & Data Boundary Enforcement', () => {
    it('3.1 SPEC INVARIANT: PT cannot see or modify another PTs patients (2 PTs Test)', async () => {
      // 1. PT-1 creates patient 1
      const p1Res = await request(app)
        .post('/api/patients')
        .set('Cookie', ['access_token=mock-token:pt-001:pt:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          first_name: 'คนไข้ของ',
          last_name: 'นักกายภาพคนที่หนึ่ง',
        });

      const p1Id = p1Res.body.data.id;

      // 2. PT-2 creates patient 2
      const p2Res = await request(app)
        .post('/api/patients')
        .set('Cookie', ['access_token=mock-token:pt-002:pt:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          first_name: 'คนไข้ของ',
          last_name: 'นักกายภาพคนที่สอง',
        });

      const p2Id = p2Res.body.data.id;

      // 3. PT-2 attempts to view PT-1 patient -> 403 Forbidden
      const pt2ViewPt1 = await request(app)
        .get(`/api/patients/${p1Id}`)
        .set('Cookie', ['access_token=mock-token:pt-002:pt:active']);

      expect(pt2ViewPt1.status).toBe(403);
      expect(pt2ViewPt1.body.error.code).toBe('FORBIDDEN');

      // 4. PT-2 attempts to edit PT-1 patient -> 403 Forbidden
      const pt2EditPt1 = await request(app)
        .patch(`/api/patients/${p1Id}`)
        .set('Cookie', ['access_token=mock-token:pt-002:pt:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          first_name: 'พยายามแอบแก้',
          version: 1,
        });

      expect(pt2EditPt1.status).toBe(403);
      expect(pt2EditPt1.body.error.code).toBe('FORBIDDEN');

      // 5. PT-2 lists patients: MUST ONLY see patient 2, never patient 1
      const pt2List = await request(app)
        .get('/api/patients')
        .set('Cookie', ['access_token=mock-token:pt-002:pt:active']);

      expect(pt2List.status).toBe(200);
      expect(pt2List.body.patients.some((p: { id: string }) => p.id === p2Id)).toBe(true);
      expect(pt2List.body.patients.some((p: { id: string }) => p.id === p1Id)).toBe(false);

      // 6. Admin can see both patients
      const adminList = await request(app)
        .get('/api/patients')
        .set('Cookie', ['access_token=mock-token:admin-001:admin:active']);

      expect(adminList.status).toBe(200);
      expect(adminList.body.patients.some((p: { id: string }) => p.id === p1Id)).toBe(true);
      expect(adminList.body.patients.some((p: { id: string }) => p.id === p2Id)).toBe(true);
    });

    it('3.2 should grant access to destination PT during active case transfer window', async () => {
      // 1. PT-1 creates patient
      const pRes = await request(app)
        .post('/api/patients')
        .set('Cookie', ['access_token=mock-token:pt-001:pt:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          first_name: 'เคสฝาก',
          last_name: 'ชั่วคราว',
        });

      const patientId = pRes.body.data.id;

      // Before delegation: PT-2 cannot access
      const accessBefore = await request(app)
        .get(`/api/patients/${patientId}`)
        .set('Cookie', ['access_token=mock-token:pt-002:pt:active']);
      expect(accessBefore.status).toBe(403);

      // 2. PT-1 transfers case to PT-2 for today
      const today = new Date().toISOString().split('T')[0];
      await defaultDirectoryRepository.createCaseTransfer(
        {
          patient_id: patientId,
          to_pt_id: 'pt-002',
          start_date: today,
          end_date: today,
        },
        'pt-001',
        'pt-001'
      );

      // During active transfer: PT-2 can view patient
      const accessDuring = await request(app)
        .get(`/api/patients/${patientId}`)
        .set('Cookie', ['access_token=mock-token:pt-002:pt:active']);
      expect(accessDuring.status).toBe(200);
      expect(accessDuring.body.data.first_name).toBe('เคสฝาก');
    });
  });

  // =========================================================================
  // 4. Optimistic Locking & Concurrent Conflict Protection (DoD Item)
  // =========================================================================
  describe('4. Optimistic Concurrency Control (Version Match / 409 Conflict)', () => {
    it('4.1 SPEC INVARIANT: Two users editing same patient concurrently must receive 409 without overwriting', async () => {
      // 1. Create a patient
      const createRes = await request(app)
        .post('/api/patients')
        .set('Cookie', ['access_token=mock-token:admin-001:admin:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          first_name: 'พิชัย',
          last_name: 'ใจเย็น',
          age: 50,
        });

      const patientId = createRes.body.data.id;
      expect(createRes.body.data.version).toBe(1);

      // 2. User A and User B both read the record at Version 1
      const initialRecord = (await request(app)
        .get(`/api/patients/${patientId}`)
        .set('Cookie', ['access_token=mock-token:admin-001:admin:active'])).body.data;
      expect(initialRecord.version).toBe(1);

      // 3. User A submits update with version: 1 -> SUCCEEDS (version increments to 2)
      const updateARes = await request(app)
        .patch(`/api/patients/${patientId}`)
        .set('Cookie', ['access_token=mock-token:admin-001:admin:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          injury: 'Updated by User A: Shoulder Sprain Grade 2',
          version: 1,
        });

      expect(updateARes.status).toBe(200);
      expect(updateARes.body.data.version).toBe(2);
      expect(updateARes.body.data.injury).toContain('User A');

      // 4. User B submits concurrent update with stale version: 1 -> REJECTED WITH 409 CONFLICT
      const updateBRes = await request(app)
        .patch(`/api/patients/${patientId}`)
        .set('Cookie', ['access_token=mock-token:admin-001:admin:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          injury: 'Overwritten by User B: Knee Strain',
          version: 1, // STALE VERSION
        });

      expect(updateBRes.status).toBe(409);
      expect(updateBRes.body.error.code).toBe('CONFLICT');
      expect(updateBRes.body.error.message).toContain('modified by another user');

      // Verify that User A's data was NOT overwritten
      const checkRes = await request(app)
        .get(`/api/patients/${patientId}`)
        .set('Cookie', ['access_token=mock-token:admin-001:admin:active']);

      expect(checkRes.body.data.version).toBe(2);
      expect(checkRes.body.data.injury).toContain('User A');

      // 5. User B reloads record, receives version 2, and updates with version: 2 -> SUCCEEDS (version increments to 3)
      const updateBRetryRes = await request(app)
        .patch(`/api/patients/${patientId}`)
        .set('Cookie', ['access_token=mock-token:admin-001:admin:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          injury: 'Successfully merged by User B after refresh',
          version: 2,
        });

      expect(updateBRetryRes.status).toBe(200);
      expect(updateBRetryRes.body.data.version).toBe(3);
      expect(updateBRetryRes.body.data.injury).toContain('User B');
    });
  });

  // =========================================================================
  // 5. Send-to-Kiosk, Checkin, Archive, & PDPA Biometric Deletion
  // =========================================================================
  describe('5. Kiosk Dispatch, Check-in, Archive & PDPA Erasure', () => {
    it('5.1 should issue 10-minute enrollment ticket for send-to-kiosk', async () => {
      const pRes = await request(app)
        .post('/api/patients')
        .set('Cookie', ['access_token=mock-token:admin-001:admin:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          first_name: 'ตู้',
          last_name: 'ลงทะเบียน',
        });

      const patientId = pRes.body.data.id;

      const res = await request(app)
        .post(`/api/patients/${patientId}/send-to-kiosk`)
        .set('Cookie', ['access_token=mock-token:admin-001:admin:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ kiosk_id: 'kiosk-01' });

      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.kiosk_id).toBe('kiosk-01');
      expect(res.body.data.patient_id).toBe(patientId);

      const expiresAt = new Date(res.body.data.expires_at).getTime();
      const diffMinutes = (expiresAt - Date.now()) / (1000 * 60);
      expect(diffMinutes).toBeGreaterThan(9);
      expect(diffMinutes).toBeLessThanOrEqual(10.5);
    });

    it('5.2 should perform counter check-in to enter today candidate pool', async () => {
      const pRes = await request(app)
        .post('/api/patients')
        .set('Cookie', ['access_token=mock-token:admin-001:admin:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          first_name: 'เช็คอิน',
          last_name: 'ประจำวัน',
        });

      const patientId = pRes.body.data.id;

      const res = await request(app)
        .post(`/api/patients/${patientId}/checkin`)
        .set('Cookie', ['access_token=mock-token:admin-001:admin:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ kiosk_id: 'kiosk-01' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.patient_id).toBe(patientId);
    });

    it('5.3 should soft-archive patient instead of hard deleting', async () => {
      const pRes = await request(app)
        .post('/api/patients')
        .set('Cookie', ['access_token=mock-token:admin-001:admin:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          first_name: 'คนไข้',
          last_name: 'เตรียมอาร์ไคฟ์',
        });

      const patientId = pRes.body.data.id;

      const res = await request(app)
        .post(`/api/patients/${patientId}/archive`)
        .set('Cookie', ['access_token=mock-token:admin-001:admin:active'])
        .set('X-Requested-With', 'XMLHttpRequest');

      expect(res.status).toBe(200);
      expect(res.body.data.registration_status).toBe('archived');
    });

    it('5.4 should delete biometrics and reset status to awaiting_face (PDPA compliance)', async () => {
      const pRes = await request(app)
        .post('/api/patients')
        .set('Cookie', ['access_token=mock-token:admin-001:admin:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          first_name: 'ลบ',
          last_name: 'ชีวมาตร',
        });

      const patientId = pRes.body.data.id;

      // Set to active/enrolled first
      await defaultPatientRepository.updatePatient(
        patientId,
        { registration_status: 'active', version: 1 },
        1
      );

      // PDPA delete biometrics via /api/face/:patientId
      const deleteRes = await request(app)
        .delete(`/api/face/${patientId}`)
        .set('Cookie', ['access_token=mock-token:admin-001:admin:active'])
        .set('X-Requested-With', 'XMLHttpRequest');

      expect(deleteRes.status).toBe(200);
      expect(deleteRes.body.ok).toBe(true);

      // Verify status reset to awaiting_face
      const getRes = await request(app)
        .get(`/api/patients/${patientId}`)
        .set('Cookie', ['access_token=mock-token:admin-001:admin:active']);

      expect(getRes.body.data.registration_status).toBe('awaiting_face');
    });

    it('5.5 should transition face_enrolled to active when demographics are completed later via PATCH', async () => {
      // 1. Create patient with missing info (only first and last name)
      const pRes = await request(app)
        .post('/api/patients')
        .set('Cookie', ['access_token=mock-token:admin-001:admin:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          first_name: 'กฤษดา',
          last_name: 'ยังไม่ครบ',
        });

      const patientId = pRes.body.data.id;
      expect(pRes.body.data.registration_status).toBe('awaiting_face');

      // 2. Simulate face enrolled first while demographics still incomplete -> face_enrolled
      await defaultPatientRepository.updatePatient(
        patientId,
        { registration_status: 'face_enrolled', version: 1 },
        1
      );

      let cur = await defaultPatientRepository.getPatientById(patientId);
      expect(cur?.registration_status).toBe('face_enrolled');
      expect(cur?.version).toBe(2);

      // 3. Partial update that is still incomplete (missing sex, injury) -> stays face_enrolled
      const partialRes = await request(app)
        .patch(`/api/patients/${patientId}`)
        .set('Cookie', ['access_token=mock-token:admin-001:admin:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          age: 35,
          version: 2,
        });

      expect(partialRes.status).toBe(200);
      expect(partialRes.body.data.registration_status).toBe('face_enrolled');
      expect(partialRes.body.data.version).toBe(3);

      // 4. Complete all remaining fields (sex, injury) -> transitions to active!
      const completeRes = await request(app)
        .patch(`/api/patients/${patientId}`)
        .set('Cookie', ['access_token=mock-token:admin-001:admin:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          sex: 'male',
          injury: 'Lumbar disc herniation',
          version: 3,
        });

      expect(completeRes.status).toBe(200);
      expect(completeRes.body.data.registration_status).toBe('active');
      expect(completeRes.body.data.version).toBe(4);
      expect(completeRes.body.data.started_at).toBeDefined();
    });
  });
});
