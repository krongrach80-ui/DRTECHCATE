/**
 * apps/api/src/__tests__/smart_onboarding_sync.test.ts
 * Master Prompt v4: Sovereign Isolated Medical-Grade Architecture Integration Suite
 * Tests:
 * 1. 5-Second Cooldown & Auto-Presence Biometric Login (Match >= 85% / Unrecognized Alert)
 * 2. Instant Face-First 10-Snap Account Creation (status: face_registered_pending_info)
 * 3. Dual-Channel Info Input (Option A / Option B) & First-Finisher Wins
 * 4. Isolated Patient-Centric Vault (public/uploads/patients/{patient_id}/)
 * 5. 10-Snapshot Rolling Retention in login_history/
 * 6. 3-Step Schedule Wizard, Modpacks & Dynamic Daily Rehab Plan
 * 7. Permanent Patient Deletion (DB row + Disk Folder removal)
 */

import { describe, it, expect, afterEach, afterAll } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import { createApp } from '../app';
import { defaultPatientVaultService } from '../modules/smart-onboarding/vault.service';
import {
  l2Normalize,
  cosineSimilarity,
  euclideanDistance,
  PatientRecordFile,
} from '../../../../packages/smart-biometric-core/src/index.js';

describe('[MASTER PROMPT v4] Smart Onboarding, Dual-Sync & Dynamic Rehab Engine', () => {
  const app = createApp();
  const testPatientId = `test-p4-${Date.now()}`;
  const uploadsDir = path.resolve(process.cwd(), 'public', 'uploads', 'patients');

  // Helper to create a normalized 512-dim vector
  function createNormalizedVector(seed: number): number[] {
    const raw = new Array(512).fill(0).map((_, i) => Math.sin(seed * (i + 1)));
    return l2Normalize(raw);
  }

  // Helper to construct a complete medical-grade PatientRecordFile
  function createTestVaultRecord(
    id: string,
    vector: number[],
    overrides: Partial<PatientRecordFile> = {}
  ): PatientRecordFile {
    return {
      patient_id: id,
      hn: `HN-${id}`,
      first_name: 'พิชัย',
      last_name: 'ทดสอบระบบ',
      age: 65,
      gender: 'male',
      registration_status: 'active',
      registered_via: 'smart_onboarding',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      biometrics: {
        face_vector: vector,
        registered_face_url: `/uploads/patients/${id}/profile_face.jpg`,
        confidence_score: 0.98,
        model_version: 'w600k_r50',
        enrolled_at: new Date().toISOString(),
      },
      daily_checklists: {},
      rehab_scores: [],
      clinical: { diagnosis: '', treatment_plan: '', progress_notes: [] },
      ...overrides,
    };
  }

  // Cleanup after each test
  afterEach(() => {
    try {
      const patientDir = path.join(uploadsDir, testPatientId);
      if (fs.existsSync(patientDir)) {
        fs.rmSync(patientDir, { recursive: true, force: true });
      }
    } catch {
      // ignore
    }
  });

  afterAll(() => {
    try {
      const dataDir = path.resolve(process.cwd(), 'data');
      if (fs.existsSync(dataDir)) {
        fs.rmSync(dataDir, { recursive: true, force: true });
      }
    } catch {
      // ignore
    }
  });

  describe('1. Biometric Vector Math & Mathematical Precision (Section 3)', () => {
    it('should compute cosine similarity and euclidean distance with exact precision', () => {
      const vecA = createNormalizedVector(1.0);
      const vecB = createNormalizedVector(1.0); // Identical

      const sim = cosineSimilarity(vecA, vecB);
      const dist = euclideanDistance(vecA, vecB);

      expect(sim).toBeCloseTo(1.0, 4);
      expect(dist).toBeCloseTo(0.0, 4);

      // Percentage formula consistency
      const percent = Math.max(0, Math.min(100, Math.round((1 - dist) * 100)));
      expect(percent).toBe(100);
    });

    it('should distinguish distinct identity vectors with high margin', () => {
      const vecA = createNormalizedVector(1.0);
      const vecC = createNormalizedVector(99.0); // Completely different

      const sim = cosineSimilarity(vecA, vecC);
      const dist = euclideanDistance(vecA, vecC);

      expect(sim).toBeLessThan(0.85);
      expect(dist).toBeGreaterThan(0.42);
    });
  });

  describe('2. Auto-Presence Login & Scan Login (Section 2 Step 1)', () => {
    it('should return unmatched friendly alert when no face matches in database', async () => {
      const unknownProbe = createNormalizedVector(12345.0);

      const res = await request(app)
        .post('/api/smart-onboarding/scan-login')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ probe: unknownProbe });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.matched).toBe(false);
      expect(res.body.message).toContain('ไม่พบบัญชีในระบบ กรุณาติดต่อแอดมิน หรือกดปุ่ม "ยังไม่มีบัญชี');
    });

    it('should successfully match when patient vault has matching biometric vector', async () => {
      // 1. Pre-register a test patient vault
      const registeredVector = createNormalizedVector(42.0);
      const vault = defaultPatientVaultService;
      vault.initPatientVault(
        testPatientId,
        createTestVaultRecord(testPatientId, registeredVector)
      );

      // 2. Scan with very close probe
      const probe = [...registeredVector];
      const res = await request(app)
        .post('/api/smart-onboarding/scan-login')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          probe,
          snapshot: 'data:image/jpeg;base64,' + Buffer.from('fake-snapshot-jpeg').toString('base64'),
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.matched).toBe(true);
      expect(res.body.patient.patient_id).toBe(testPatientId);
      expect(res.body.similarity).toBeGreaterThanOrEqual(0.85);
      expect(res.body.distance).toBeLessThanOrEqual(0.42);
      expect(res.body.similarityPercentage).toBeGreaterThanOrEqual(85);
    });
  });

  describe('3. Instant Face-First Account Creation & 10-Snap Vault (Section 2 Step 2 & Section 1)', () => {
    let createdPendingId: string;

    afterEach(async () => {
      if (createdPendingId) {
        try {
          await request(app)
            .delete(`/api/smart-onboarding/patient/${createdPendingId}`)
            .set('X-Requested-With', 'XMLHttpRequest');
        } catch {
          // ignore
        }
      }
    });

    it('should create pending account with 10 frames and setup vault directory', async () => {
      const baseVector = createNormalizedVector(77.0);
      const frames = [
        { pose: 'front', embedding: baseVector, jpeg_base64: 'fake-jpeg' },
        { pose: 'front', embedding: baseVector },
        { pose: 'front', embedding: baseVector },
        { pose: 'front', embedding: baseVector },
        { pose: 'left', embedding: baseVector },
        { pose: 'left', embedding: baseVector },
        { pose: 'right', embedding: baseVector },
        { pose: 'right', embedding: baseVector },
        { pose: 'nod', embedding: baseVector },
        { pose: 'nod', embedding: baseVector },
      ];

      const res = await request(app)
        .post('/api/smart-onboarding/create-pending')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ frames, model_version: 'w600k_r50' });

      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.registration_status).toBe('face_registered_pending_info');
      expect(res.body.data.patient_id).toBeDefined();

      createdPendingId = res.body.data.patient_id;

      // Verify physical disk structure
      const patientDir = path.join(uploadsDir, createdPendingId);
      expect(fs.existsSync(patientDir)).toBe(true);
      expect(fs.existsSync(path.join(patientDir, 'patient_record.json'))).toBe(true);
      expect(fs.existsSync(path.join(patientDir, 'login_history'))).toBe(true);

      // Verify list pending endpoint includes this new patient
      const pendingRes = await request(app).get('/api/smart-onboarding/pending-patients');
      expect(pendingRes.status).toBe(200);
      const found = pendingRes.body.data.some(
        (p: any) => p.patient_id === createdPendingId && p.registration_status === 'face_registered_pending_info'
      );
      expect(found).toBe(true);
    });

    it('should complete patient info via Dual-Channel (Option A/B) and switch status to active', async () => {
      // 1. Create pending account first
      const baseVector = createNormalizedVector(88.0);
      const createRes = await request(app)
        .post('/api/smart-onboarding/create-pending')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          frames: new Array(10).fill({ pose: 'front', embedding: baseVector }),
        });

      createdPendingId = createRes.body.data.patient_id;

      // 2. Complete info
      const completeRes = await request(app)
        .post('/api/smart-onboarding/complete-info')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          patient_id: createdPendingId,
          first_name: 'วิภาดา',
          last_name: 'ศรีสุข',
          age: 58,
          gender: 'female',
          phone: '089-999-8888',
          initial_symptoms: 'ปวดข้อเข่าข้างซ้าย',
        });

      expect(completeRes.status).toBe(200);
      expect(completeRes.body.ok).toBe(true);
      expect(completeRes.body.data.registration_status).toBe('active');
      expect(completeRes.body.data.first_name).toBe('วิภาดา');
      expect(completeRes.body.data.age).toBe(58);

      // 3. Confirm disk patient_record.json updated
      const record = defaultPatientVaultService.getPatientRecord(createdPendingId);
      expect(record?.registration_status).toBe('active');
      expect(record?.phone).toBe('089-999-8888');
    });
  });

  describe('4. 10-Snapshot Rolling Retention Policy (Section 1.2)', () => {
    it('should enforce strictly max 10 snapshots in login_history and auto-unlink oldest', () => {
      const vault = defaultPatientVaultService;
      vault.initPatientVault(
        testPatientId,
        createTestVaultRecord(testPatientId, createNormalizedVector(1.0), {
          first_name: 'ทดสอบ',
          last_name: 'โรลลิ่งสแนปช็อต',
        }),
        Buffer.from('fake-profile-face-data')
      );

      const historyDir = path.join(uploadsDir, testPatientId, 'login_history');

      // Record 15 consecutive login snapshots
      for (let i = 1; i <= 15; i++) {
        const dummyBuf = Buffer.from(`snapshot-payload-${i}`);
        vault.recordLoginSnapshot(testPatientId, dummyBuf);
      }

      const files = fs.readdirSync(historyDir).filter((f) => f.endsWith('.jpg'));
      // Invariant: Must not exceed 10
      expect(files.length).toBeLessThanOrEqual(10);
      expect(files.length).toBe(10);

      // Invariant: profile_face.jpg MUST NOT be touched or deleted
      const profileFacePath = path.join(uploadsDir, testPatientId, 'profile_face.jpg');
      expect(fs.existsSync(profileFacePath)).toBe(true);
    });
  });

  describe('5. 3-Step Schedule Wizard, Modpacks & Dynamic Daily Plan (Section 4)', () => {
    it('should save schedule with prescribed exercises and minigame toggle, then compute daily plan', async () => {
      // 1. Setup patient vault
      const vault = defaultPatientVaultService;
      vault.initPatientVault(
        testPatientId,
        createTestVaultRecord(testPatientId, createNormalizedVector(55.0), {
          first_name: 'มานะ',
          last_name: 'อดทน',
        })
      );

      // 2. Save schedule via 3-step wizard endpoint
      const todayDayOfWeek = new Date().toLocaleDateString('en-US', { weekday: 'short' }); // e.g. "Mon"
      const schedulePayload = {
        patient_id: testPatientId,
        schedule: {
          start_date: '2026-01-01',
          end_date: '2026-12-31',
          days_of_week: [todayDayOfWeek], // scheduled for today
          time_slot: '09:00 - 10:00',
          assigned_kiosk_id: 'kiosk-01',
          include_minigame: true,
          prescribed_exercises: [
            {
              exercise_id: 'ex-shoulder-01',
              name: 'หมุนข้อไหล่ไปข้างหน้า',
              target_joint: 'ไหล่ (Shoulder)',
              sets: 3,
              reps: 10,
            },
            {
              exercise_id: 'ex-elbow-01',
              name: 'เหยียดข้อศอกตรง',
              target_joint: 'ข้อศอก (Elbow)',
              sets: 2,
              reps: 12,
            },
          ],
        },
      };

      const schedRes = await request(app)
        .post('/api/smart-onboarding/schedule')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send(schedulePayload);

      expect(schedRes.status).toBe(200);
      expect(schedRes.body.ok).toBe(true);
      expect(schedRes.body.data.schedule.include_minigame).toBe(true);

      // 3. Query Daily Plan for today
      const planRes = await request(app).get(`/api/smart-onboarding/daily-plan/${testPatientId}`);
      expect(planRes.status).toBe(200);
      expect(planRes.body.ok).toBe(true);
      expect(planRes.body.data.is_scheduled_today).toBe(true);
      expect(planRes.body.data.exercises.length).toBe(2);
      expect(planRes.body.data.include_minigame).toBe(true);

      // 4. Save Rehab & Game Score
      const scoreRes = await request(app)
        .post('/api/smart-onboarding/rehab-score')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          patient_id: testPatientId,
          score: {
            timestamp: new Date().toISOString(),
            completion_rate: 100,
            minigame_score: 95,
            total_score: 195,
          },
        });

      expect(scoreRes.status).toBe(200);
      expect(scoreRes.body.ok).toBe(true);
    });

    it('should return friendly rest message if today is not in scheduled days of week', async () => {
      const vault = defaultPatientVaultService;
      vault.initPatientVault(
        testPatientId,
        createTestVaultRecord(testPatientId, createNormalizedVector(33.0), {
          first_name: 'ใจเย็น',
          last_name: 'รักสงบ',
          schedule: {
            start_date: '2026-01-01',
            end_date: '2026-12-31',
            days_of_week: ['NonExistentDay'], // definitely not today
            time_slot: '14:00 - 15:00',
            assigned_kiosk_id: 'kiosk-02',
            include_minigame: false,
            prescribed_exercises: [],
          },
        })
      );

      const planRes = await request(app).get(`/api/smart-onboarding/daily-plan/${testPatientId}`);
      expect(planRes.status).toBe(200);
      expect(planRes.body.data.is_scheduled_today).toBe(false);
      expect(planRes.body.data.reason).toContain('วันพักผ่อน');
    });
  });

  describe('6. Permanent Deletion & Disk Cleanup (Section 5)', () => {
    it('should permanently delete patient from database and wipe folder on disk', async () => {
      // 1. Create patient vault
      const vault = defaultPatientVaultService;
      vault.initPatientVault(
        testPatientId,
        createTestVaultRecord(testPatientId, createNormalizedVector(12.0), {
          first_name: 'จะถูกลบ',
          last_name: 'ถาวร',
        })
      );

      const patientDir = path.join(uploadsDir, testPatientId);
      expect(fs.existsSync(patientDir)).toBe(true);

      // 2. Perform Permanent Delete
      const delRes = await request(app)
        .delete(`/api/smart-onboarding/patient/${testPatientId}`)
        .set('X-Requested-With', 'XMLHttpRequest');
      expect(delRes.status).toBe(200);
      expect(delRes.body.ok).toBe(true);

      // 3. Confirm disk folder is completely removed
      expect(fs.existsSync(patientDir)).toBe(false);

      // 4. Confirm not in listAllPatientRecords
      const all = vault.listAllPatientRecords();
      expect(all.some((p) => p.patient_id === testPatientId)).toBe(false);
    });
  });

  describe('7. Exercise Library & Modpack CRUD (Section 5)', () => {
    it('should create and retrieve custom exercises and modpacks', async () => {
      // 1. Save new exercise
      const exRes = await request(app)
        .post('/api/smart-onboarding/exercises')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          name: 'ท่ายกแขนเหนือศีรษะ (Overhead Raise)',
          target_joint: 'ไหล่ (Shoulder)',
          target_angle: 120,
          safety_precaution: 'อย่ากลั้นหายใจขณะยกแขน',
        });

      expect(exRes.status).toBe(201);
      expect(exRes.body.ok).toBe(true);
      expect(exRes.body.data.id).toBeDefined();

      // 2. Save new modpack
      const mpRes = await request(app)
        .post('/api/smart-onboarding/modpacks')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          name: 'ชุดฟื้นฟูกล้ามเนื้อไหล่ติดระยะแรก',
          items: [
            {
              exercise_id: exRes.body.data.id,
              name: 'ท่ายกแขนเหนือศีรษะ',
              sets: 3,
              reps: 10,
            },
          ],
        });

      expect(mpRes.status).toBe(201);
      expect(mpRes.body.ok).toBe(true);

      // 3. Retrieve lists
      const listEx = await request(app).get('/api/smart-onboarding/exercises');
      expect(listEx.body.data.some((x: any) => x.name.includes('Overhead Raise'))).toBe(true);

      const listMp = await request(app).get('/api/smart-onboarding/modpacks');
      expect(listMp.body.data.some((x: any) => x.name.includes('ชุดฟื้นฟูกล้ามเนื้อไหล่ติด'))).toBe(true);
    });
  });
});
