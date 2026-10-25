import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import * as adminClientModule from '../lib/supabase/adminClient';
import { resetCachedEnv } from '../config/env';
import {
  setupTestFakeRepositories,
  resetAllFakeRepositories,
  currentFakeFaceEnrollmentRepo,
  currentFakePatientRepo,
  currentFakeAuditRepo,
} from './fixtures/fakeRepositories';
import { setupTestAuthFixture } from './fixtures/authFixture';
import { PatientRecord } from '../modules/patients/schema';
import {
  cleanupExpiredPendingPatients,
  cleanupOrphanBiometricFiles,
  cleanupLoginSnapshots,
} from '../jobs/cleanup';

describe('[UNIT & INTEGRATION] Face Enrollment & Compensation Complete Test Suite', () => {
  const app = createApp();

  // Helper to generate a 512-dim unit vector
  function createUnitVector(seed: number): number[] {
    const vec = new Array(512).fill(0);
    // Distribute value across vector
    for (let i = 0; i < 512; i++) {
      vec[i] = Math.sin(seed * (i + 1));
    }
    const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
    return vec.map((v) => v / norm);
  }

  // Helper to generate 10 valid frames (4 front, 2 left, 2 right, 2 nod)
  function createValidFrames(seed = 1) {
    const baseVec = createUnitVector(seed);
    const poses: Array<'front' | 'left' | 'right' | 'nod'> = [
      'front', 'front', 'front', 'front',
      'left', 'left',
      'right', 'right',
      'nod', 'nod',
    ];

    return poses.map((pose) => ({
      pose,
      embedding: [...baseVec], // identical or very close -> cosine sim = 1.0
      jpeg_base64: Buffer.from('fake-jpeg-data').toString('base64'),
    }));
  }

  // Helper to create test patient record with all required fields
  function createTestPatient(id: string, hn: string, overrides: Partial<PatientRecord> = {}): PatientRecord {
    return {
      id,
      hn,
      first_name: 'ทดสอบ',
      last_name: 'ใจดี',
      age: 40,
      sex: 'male',
      phone: '0812345678',
      history: {},
      injury: 'Frozen shoulder',
      responsible_pt_id: 'pt-001',
      registration_status: 'awaiting_face',
      registered_via: 'reception',
      pending_expires_at: new Date(Date.now() + 86400000).toISOString(),
      started_at: null,
      version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...overrides,
    };
  }

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
    process.env.ALLOW_KIOSK_SELF_ENROLL = 'false';
    process.env.LOGIN_SNAPSHOT_RETENTION = '0';
    setupTestFakeRepositories();
    setupTestAuthFixture();
  });

  beforeEach(() => {
    resetAllFakeRepositories();
    process.env.FACE_T_ENROLL_CONSISTENCY = '0.75';
    process.env.FACE_T_DUPLICATE = '0.85';
    process.env.ALLOW_KIOSK_SELF_ENROLL = 'false';
    process.env.LOGIN_SNAPSHOT_RETENTION = '0';
    resetCachedEnv();

    vi.spyOn(adminClientModule, 'getAdminClient').mockReturnValue({
      from: (_table: string) => ({
        select: () => ({
          eq: () => ({
            lte: () => Promise.resolve({ data: [], error: null }),
            eq: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
        update: () => ({
          eq: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
      storage: {
        from: (_bucket: string) => ({
          list: () => Promise.resolve({ data: [], error: null }),
          remove: () => Promise.resolve({ data: [], error: null }),
        }),
      },
    } as any);
  });

  afterEach(() => {
    process.env.FACE_T_ENROLL_CONSISTENCY = '0.75';
    process.env.FACE_T_DUPLICATE = '0.85';
    process.env.ALLOW_KIOSK_SELF_ENROLL = 'false';
    process.env.LOGIN_SNAPSHOT_RETENTION = '0';
    resetCachedEnv();
  });

  // =========================================================================
  // 1. Consent Requirement (Spec 7.3.1)
  // =========================================================================
  describe('1. Consent Verification (Spec 7.3.1)', () => {
    it('1.1 should reject enrollment with 400 CONSENT_REQUIRED if no consent exists', async () => {
      const patientId = 'pt-patient-001';
      currentFakePatientRepo.inMemoryPatients.set(patientId, createTestPatient(patientId, 'HN100001', {
        first_name: 'สมชาย',
        last_name: 'ใจดี',
      }));
      currentFakePatientRepo.inMemoryAssignments.set('a1', { patient_id: patientId, pt_id: 'pt-001' });

      const res = await request(app)
        .post('/api/face/enroll')
        .set('Cookie', ['access_token=mock-token:pt-001:pt:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          patient_id: patientId,
          frames: createValidFrames(),
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('CONSENT_REQUIRED');
    });

    it('1.2 should reject enrollment if consent is revoked (revoked_at IS NOT NULL)', async () => {
      const patientId = 'pt-patient-002';
      currentFakePatientRepo.inMemoryPatients.set(patientId, createTestPatient(patientId, 'HN100002', {
        first_name: 'สมหญิง',
        last_name: 'รักสงบ',
        sex: 'female',
      }));
      currentFakePatientRepo.inMemoryAssignments.set('a2', { patient_id: patientId, pt_id: 'pt-001' });

      currentFakeFaceEnrollmentRepo.inMemoryConsents.set('c-revoked', {
        id: 'c-revoked',
        subject_id: patientId,
        type: 'biometric_face',
        text_version: 'v1.0',
        revoked_at: new Date().toISOString(),
      });

      const res = await request(app)
        .post('/api/face/enroll')
        .set('Cookie', ['access_token=mock-token:pt-001:pt:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          patient_id: patientId,
          frames: createValidFrames(),
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('CONSENT_REQUIRED');
    });
  });

  // =========================================================================
  // 2. 10 Frames Validation & Distribution (Spec 7.3.3)
  // =========================================================================
  describe('2. Frame Count & Pose Distribution (Spec 7.3.3)', () => {
    const patientId = 'pt-patient-003';

    beforeEach(() => {
      currentFakePatientRepo.inMemoryPatients.set(patientId, createTestPatient(patientId, 'HN100003', {
        first_name: 'วิชัย',
        last_name: 'ยอดเยี่ยม',
      }));
      currentFakePatientRepo.inMemoryAssignments.set('a3', { patient_id: patientId, pt_id: 'pt-001' });
      currentFakeFaceEnrollmentRepo.inMemoryConsents.set('c3', {
        id: 'c3',
        subject_id: patientId,
        type: 'biometric_face',
        text_version: 'v1.0',
        revoked_at: null,
      });
    });

    it('2.1 should reject if fewer than 10 frames are submitted', async () => {
      const frames = createValidFrames().slice(0, 9);

      const res = await request(app)
        .post('/api/face/enroll')
        .set('Cookie', ['access_token=mock-token:pt-001:pt:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          patient_id: patientId,
          frames,
        });

      expect(res.status).toBe(400);
    });

    it('2.2 should reject if pose counts are invalid (e.g. 5 front, 1 left, 2 right, 2 nod)', async () => {
      const frames = createValidFrames();
      frames[4].pose = 'front';

      const res = await request(app)
        .post('/api/face/enroll')
        .set('Cookie', ['access_token=mock-token:pt-001:pt:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          patient_id: patientId,
          frames,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_POSE_FRAMES');
    });

    it('2.3 should reject if embedding dimension is not 512', async () => {
      const frames = createValidFrames();
      frames[0].embedding = new Array(256).fill(0.1);

      const res = await request(app)
        .post('/api/face/enroll')
        .set('Cookie', ['access_token=mock-token:pt-001:pt:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          patient_id: patientId,
          frames,
        });

      expect(res.status).toBe(400);
    });
  });

  // =========================================================================
  // 3. Consistency Threshold (FACE_T_ENROLL_CONSISTENCY - Spec 7.3.4)
  // =========================================================================
  describe('3. Consistency Check (Spec 7.3.4)', () => {
    const patientId = 'pt-patient-004';

    beforeEach(() => {
      currentFakePatientRepo.inMemoryPatients.set(patientId, createTestPatient(patientId, 'HN100004', {
        first_name: 'กานดา',
        last_name: 'มีสุข',
        sex: 'female',
      }));
      currentFakePatientRepo.inMemoryAssignments.set('a4', { patient_id: patientId, pt_id: 'pt-001' });
      currentFakeFaceEnrollmentRepo.inMemoryConsents.set('c4', {
        id: 'c4',
        subject_id: patientId,
        type: 'biometric_face',
        text_version: 'v1.0',
        revoked_at: null,
      });
    });

    it('3.1 should reject with 400 ENROLL_INCONSISTENT_FRAMES if any front pair < consistency threshold', async () => {
      const frames = createValidFrames(1);
      // Give frame 3 an orthogonal vector so cosine sim with frame 0, 1, 2 is near 0 (< 0.75)
      frames[3].embedding = createUnitVector(99);

      const res = await request(app)
        .post('/api/face/enroll')
        .set('Cookie', ['access_token=mock-token:pt-001:pt:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          patient_id: patientId,
          frames,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('ENROLL_INCONSISTENT_FRAMES');
      expect(res.body.error.message).toContain('Front face frames are inconsistent');
    });

    it('3.2 should fail-closed (500) if FACE_T_ENROLL_CONSISTENCY is not configured', async () => {
      delete process.env.FACE_T_ENROLL_CONSISTENCY;
      resetCachedEnv();

      const res = await request(app)
        .post('/api/face/enroll')
        .set('Cookie', ['access_token=mock-token:pt-001:pt:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          patient_id: patientId,
          frames: createValidFrames(),
        });

      expect(res.status).toBe(500);
      expect(res.body.error).toBeDefined();
    });
  });

  // =========================================================================
  // 4. Duplicate Face Detection (FACE_T_DUPLICATE - Spec 7.3.4)
  // =========================================================================
  describe('4. Duplicate Face Detection (Spec 7.3.4)', () => {
    const patientId1 = 'pt-patient-005';
    const patientId2 = 'pt-patient-006';

    beforeEach(() => {
      // Patient 1 already enrolled
      currentFakePatientRepo.inMemoryPatients.set(patientId1, createTestPatient(patientId1, 'HN100005', {
        first_name: 'อนันต์',
        last_name: 'โชคดี',
        registration_status: 'active',
      }));

      // Existing template for Patient 1
      const p1Vec = createUnitVector(42);
      currentFakeFaceEnrollmentRepo.inMemoryTemplates.push({
        patient_id: patientId1,
        pose: 'front',
        embedding: p1Vec,
      });

      // Patient 2 attempting enrollment
      currentFakePatientRepo.inMemoryPatients.set(patientId2, createTestPatient(patientId2, 'HN100006', {
        first_name: 'มานพ',
        last_name: 'กล้าหาญ',
      }));
      currentFakePatientRepo.inMemoryAssignments.set('a6', { patient_id: patientId2, pt_id: 'pt-001' });
      currentFakeFaceEnrollmentRepo.inMemoryConsents.set('c6', {
        id: 'c6',
        subject_id: patientId2,
        type: 'biometric_face',
        text_version: 'v1.0',
        revoked_at: null,
      });
    });

    it('4.1 should reject with 409 DUPLICATE_FACE_DETECTED if face matches an existing patient', async () => {
      // Use identical vector as patient 1 (cosine sim = 1.0 > 0.85)
      const frames = createValidFrames(42);

      const res = await request(app)
        .post('/api/face/enroll')
        .set('Cookie', ['access_token=mock-token:pt-001:pt:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          patient_id: patientId2,
          frames,
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('DUPLICATE_FACE_DETECTED');
      expect(res.body.error.message).toContain('duplicate of another registered patient');
    });

    it('4.2 should NOT leak raw biometric scores or thresholds in audit log metadata or error message', async () => {
      const frames = createValidFrames(42);

      const res = await request(app)
        .post('/api/face/enroll')
        .set('Cookie', ['access_token=mock-token:pt-001:pt:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          patient_id: patientId2,
          frames,
        });

      expect(res.status).toBe(409);
      expect(res.body.error.message).not.toMatch(/\d+\.\d+/); // No raw floating point scores

      // Check audit log
      const logs = currentFakeAuditRepo.inMemoryLogs.filter(
        (l) => l.action === 'DUPLICATE_FACE_DETECTED'
      );
      expect(logs.length).toBeGreaterThan(0);
      const lastLog = logs[logs.length - 1];
      expect(lastLog.metadata?.score).toBeUndefined();
      expect(lastLog.metadata?.threshold).toBeUndefined();
    });
  });

  // =========================================================================
  // 5. Atomic Enrollment & Compensation (Spec 7.3.5, 7.3.6, 7.3.7)
  // =========================================================================
  describe('5. Storage Upload & Compensation (Spec 7.3.5, 7.3.7)', () => {
    const patientId = 'pt-patient-007';

    beforeEach(() => {
      currentFakePatientRepo.inMemoryPatients.set(patientId, createTestPatient(patientId, 'HN100007', {
        first_name: 'ประสิทธิ์',
        last_name: 'เจริญ',
      }));
      currentFakePatientRepo.inMemoryAssignments.set('a7', { patient_id: patientId, pt_id: 'pt-001' });
      currentFakeFaceEnrollmentRepo.inMemoryConsents.set('c7', {
        id: 'c7',
        subject_id: patientId,
        type: 'biometric_face',
        text_version: 'v1.0',
        revoked_at: null,
      });
    });

    it('5.1 should successfully upload 10 images with folder matching enrollment_id', async () => {
      const res = await request(app)
        .post('/api/face/enroll')
        .set('Cookie', ['access_token=mock-token:pt-001:pt:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          patient_id: patientId,
          frames: createValidFrames(10),
        });

      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
      expect(res.body.enrollment_id).toBeDefined();
      expect(res.body.registration_status).toBe('active');
      // Storage should have 10 files
      expect(currentFakeFaceEnrollmentRepo.inMemoryStorageFiles.size).toBe(10);

      // Verify folder matches enrollment_id (biometric-data/{patient_id}/{enrollment_id}/frame_XX.jpg)
      const paths = Array.from(currentFakeFaceEnrollmentRepo.inMemoryStorageFiles.keys());
      expect(paths.length).toBe(10);
      for (const p of paths) {
        expect(p.startsWith(`${patientId}/${res.body.enrollment_id}/frame_`)).toBe(true);
      }
    });

    it('5.2 COMPENSATION: should rollback DB enrollment and purge storage files if storage upload fails', async () => {
      // Simulate Storage upload failure
      currentFakeFaceEnrollmentRepo.failUpload = true;

      const res = await request(app)
        .post('/api/face/enroll')
        .set('Cookie', ['access_token=mock-token:pt-001:pt:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          patient_id: patientId,
          frames: createValidFrames(11),
        });

      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe('STORAGE_UNAVAILABLE');

      // Crucial invariant: Storage files must be cleaned up immediately, zero orphans left!
      expect(currentFakeFaceEnrollmentRepo.inMemoryStorageFiles.size).toBe(0);

      // Crucial invariant: DB rollback executed - enrollment deleted, templates cleared, patient reverted to awaiting_face
      expect(currentFakeFaceEnrollmentRepo.inMemoryEnrollments.size).toBe(0);
      expect(currentFakeFaceEnrollmentRepo.inMemoryTemplates.length).toBe(0);
      const patient = currentFakePatientRepo.inMemoryPatients.get(patientId);
      expect(patient?.registration_status).toBe('awaiting_face');
    });
  });

  // =========================================================================
  // 6. Kiosk Enrollment & Ticket (Spec 7.3.2)
  // =========================================================================
  describe('6. Kiosk Enrollment & Ticket Consumption (Spec 7.3.2)', () => {
    const patientId = 'pt-patient-008';
    const ticketId = 'ticket-123';

    beforeEach(() => {
      currentFakePatientRepo.inMemoryPatients.set(patientId, createTestPatient(patientId, 'HN100008', {
        first_name: 'สุดา',
        last_name: 'ศรีสมร',
        sex: 'female',
      }));
      currentFakeFaceEnrollmentRepo.inMemoryConsents.set('c8', {
        id: 'c8',
        subject_id: patientId,
        type: 'biometric_face',
        text_version: 'v1.0',
        revoked_at: null,
      });
      // Active ticket
      currentFakeFaceEnrollmentRepo.inMemoryTickets.set(ticketId, {
        id: ticketId,
        patient_id: patientId,
        kiosk_id: 'kiosk-001',
        created_by: 'pt-001',
        expires_at: new Date(Date.now() + 600000).toISOString(),
        used_at: null,
      });
    });

    it('6.1 should require ticket on kiosk when ALLOW_KIOSK_SELF_ENROLL=false', async () => {
      const res = await request(app)
        .post('/api/kiosk/enroll')
        .set('Cookie', ['device_token=device-secret-123'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          patient_id: patientId,
          frames: createValidFrames(20),
          // no ticket
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('ENROLLMENT_TICKET_REQUIRED');
    });

    it('6.2 should reject enrollment if ticket is expired', async () => {
      currentFakeFaceEnrollmentRepo.inMemoryTickets.set(ticketId, {
        id: ticketId,
        patient_id: patientId,
        kiosk_id: 'kiosk-001',
        created_by: 'pt-001',
        expires_at: new Date(Date.now() - 1000).toISOString(),
        used_at: null,
      });

      const res = await request(app)
        .post('/api/kiosk/enroll')
        .set('Cookie', ['device_token=device-secret-123'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          patient_id: patientId,
          ticket: ticketId,
          frames: createValidFrames(20),
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('TICKET_EXPIRED');
    });

    it('6.3 should reject enrollment if ticket has already been used', async () => {
      currentFakeFaceEnrollmentRepo.inMemoryTickets.set(ticketId, {
        id: ticketId,
        patient_id: patientId,
        kiosk_id: 'kiosk-001',
        created_by: 'pt-001',
        expires_at: new Date(Date.now() + 600000).toISOString(),
        used_at: new Date(Date.now() - 5000).toISOString(),
      });

      const res = await request(app)
        .post('/api/kiosk/enroll')
        .set('Cookie', ['device_token=device-secret-123'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          patient_id: patientId,
          ticket: ticketId,
          frames: createValidFrames(20),
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('TICKET_ALREADY_USED');
    });

    it('6.4 should enroll successfully with valid ticket and mark ticket used', async () => {
      const res = await request(app)
        .post('/api/kiosk/enroll')
        .set('Cookie', ['device_token=device-secret-123'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          patient_id: patientId,
          ticket: ticketId,
          frames: createValidFrames(20),
        });

      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);

      const ticket = currentFakeFaceEnrollmentRepo.inMemoryTickets.get(ticketId);
      expect(ticket?.used_at).not.toBeNull();
    });

    it('6.5 should allow kiosk enrollment without ticket when ALLOW_KIOSK_SELF_ENROLL=true', async () => {
      process.env.ALLOW_KIOSK_SELF_ENROLL = 'true';

      const res = await request(app)
        .post('/api/kiosk/enroll')
        .set('Cookie', ['device_token=device-secret-123'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          patient_id: patientId,
          frames: createValidFrames(21),
        });

      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
    });
  });

  // =========================================================================
  // 7. PDPA Biometric Deletion (Spec 0.10, 5, 6.2)
  // =========================================================================
  describe('7. PDPA Biometric Deletion (Spec 0.10, 5, 6.2)', () => {
    const patientId = 'pt-patient-009';

    beforeEach(() => {
      currentFakePatientRepo.inMemoryPatients.set(patientId, createTestPatient(patientId, 'HN100009', {
        first_name: 'อำนาจ',
        last_name: 'มั่นคง',
        registration_status: 'active',
      }));
      currentFakePatientRepo.inMemoryAssignments.set('a9', { patient_id: patientId, pt_id: 'pt-001' });

      currentFakeFaceEnrollmentRepo.inMemoryStorageFiles.set(`${patientId}/enroll-1/frame_01.jpg`, Buffer.from('x'));
      currentFakeFaceEnrollmentRepo.inMemoryTemplates.push({
        patient_id: patientId,
        pose: 'front',
        embedding: createUnitVector(30),
      });
    });

    it('7.1 should wipe storage and templates and reset registration_status to awaiting_face', async () => {
      const res = await request(app)
        .delete(`/api/face/${patientId}`)
        .set('Cookie', ['access_token=mock-token:pt-001:pt:active'])
        .set('X-Requested-With', 'XMLHttpRequest');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.patient_id).toBe(patientId);

      // Verify templates removed
      const remainingTemplates = currentFakeFaceEnrollmentRepo.inMemoryTemplates.filter((t) => t.patient_id === patientId);
      expect(remainingTemplates.length).toBe(0);

      // Verify storage wiped
      expect(currentFakeFaceEnrollmentRepo.inMemoryStorageFiles.size).toBe(0);

      // Verify patient reset
      const patient = currentFakePatientRepo.inMemoryPatients.get(patientId);
      expect(patient?.registration_status).toBe('awaiting_face');
    });
  });

  // =========================================================================
  // 8. Background Cleanup Jobs
  // =========================================================================
  describe('8. Background Cleanup Jobs (Spec 7.3.5, 7.3.8, 7.4.9)', () => {
    it('8.1 cleanupExpiredPendingPatients should execute without error', async () => {
      const count = await cleanupExpiredPendingPatients();
      expect(typeof count).toBe('number');
    });

    it('8.2 cleanupOrphanBiometricFiles should execute without error', async () => {
      const count = await cleanupOrphanBiometricFiles();
      expect(typeof count).toBe('number');
    });

    it('8.3 cleanupLoginSnapshots should execute without error', async () => {
      const count = await cleanupLoginSnapshots();
      expect(typeof count).toBe('number');
    });

    it('8.4 cleanupOrphanBiometricFiles should NOT delete active enrollment folders, but SHOULD delete orphan folders', async () => {
      const activeEnrollmentId = 'enroll-active-123';
      const orphanFolderId = 'orphan-folder-999';
      const patientId = 'pt-patient-cleanup';

      const removedPaths: string[] = [];

      vi.spyOn(adminClientModule, 'getAdminClient').mockReturnValue({
        from: (table: string) => {
          if (table === 'face_enrollments') {
            return {
              select: () => ({
                eq: (col1: string, val1: string) => ({
                  eq: (_col2: string, _val2: string) => {
                    if (val1 === patientId) {
                      return Promise.resolve({ data: [{ id: activeEnrollmentId }], error: null });
                    }
                    return Promise.resolve({ data: [], error: null });
                  },
                }),
              }),
            };
          }
          return {
            select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }),
            update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
          };
        },
        storage: {
          from: (_bucket: string) => ({
            list: (path: string) => {
              if (path === '') {
                return Promise.resolve({ data: [{ name: patientId }], error: null });
              }
              if (path === patientId) {
                return Promise.resolve({
                  data: [{ name: activeEnrollmentId }, { name: orphanFolderId }],
                  error: null,
                });
              }
              if (path === `${patientId}/${orphanFolderId}`) {
                return Promise.resolve({
                  data: [{ name: 'frame_01.jpg' }, { name: 'frame_02.jpg' }],
                  error: null,
                });
              }
              if (path === `${patientId}/${activeEnrollmentId}`) {
                return Promise.resolve({
                  data: [{ name: 'frame_01.jpg' }],
                  error: null,
                });
              }
              return Promise.resolve({ data: [], error: null });
            },
            remove: (paths: string[]) => {
              removedPaths.push(...paths);
              return Promise.resolve({ data: paths.map((p) => ({ name: p })), error: null });
            },
          }),
        },
      } as any);

      const deletedCount = await cleanupOrphanBiometricFiles();
      expect(deletedCount).toBe(2);
      expect(removedPaths).toEqual([
        `${patientId}/${orphanFolderId}/frame_01.jpg`,
        `${patientId}/${orphanFolderId}/frame_02.jpg`,
      ]);
      // Crucial: Active enrollment files were NOT removed!
      expect(removedPaths).not.toContain(`${patientId}/${activeEnrollmentId}/frame_01.jpg`);
    });
  });
});
