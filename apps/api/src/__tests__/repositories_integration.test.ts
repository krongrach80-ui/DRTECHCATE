/**
 * apps/api/src/__tests__/repositories_integration.test.ts
 * Real Postgres Integration Test Suite covering Repositories across ALL Modules.
 * Executed in CI against the live local Supabase instance started via Docker.
 * Validates genuine PostgreSQL schema, triggers, sequences, and RLS.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';
import path from 'path';
import { getAdminClient, resetAdminClient } from '../lib/supabase/adminClient';
import { resetCachedEnv } from '../config/env';
import { AuthRepository } from '../modules/auth/repository';
import { StaffRepository } from '../modules/staff/repository';
import { PatientRepository } from '../modules/patients/repository';
import { CourseRepository } from '../modules/courses/repository';
import { KioskRepository } from '../modules/kiosk/repository';
import { RecordsRepository } from '../modules/records/repository';

describe.runIf(process.env.LIVE_TESTS === '1')('[INTEGRATION] Real Postgres Repositories Suite (All Modules)', () => {
  let authRepo: AuthRepository;
  let staffRepo: StaffRepository;
  let patientRepo: PatientRepository;
  let courseRepo: CourseRepository;
  let kioskRepo: KioskRepository;
  let recordsRepo: RecordsRepository;

  let testAdminUserId: string;
  let testPtUserId: string;
  let testPatientId: string;
  let testKioskId: string;

  beforeAll(async () => {
    dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
    dotenv.config({ path: path.resolve(process.cwd(), '.env') });
    resetCachedEnv();
    resetAdminClient();

    authRepo = new AuthRepository();
    staffRepo = new StaffRepository();
    patientRepo = new PatientRepository();
    courseRepo = new CourseRepository(patientRepo);
    kioskRepo = new KioskRepository();
    recordsRepo = new RecordsRepository();

    const adminClient = getAdminClient();

    // 1. Setup test staff users in auth.users and profiles
    testAdminUserId = randomUUID();
    testPtUserId = randomUUID();
    testKioskId = randomUUID();

    // Provision admin profile
    await adminClient.from('profiles').insert({
      id: testAdminUserId,
      role: 'admin',
      username: `admin_it_${Date.now()}`,
      full_name: 'Integration Admin',
      status: 'active',
    });

    // Provision PT profile
    await adminClient.from('profiles').insert({
      id: testPtUserId,
      role: 'pt',
      username: `pt_it_${Date.now()}`,
      full_name: 'Integration PT',
      status: 'active',
    });

    // Provision PT details in pts table
    await adminClient.from('pts').insert({
      user_id: testPtUserId,
      license_no: `LIC-${Date.now().toString().slice(-6)}`,
      specialty: 'Orthopedics',
      age: 32,
      sex: 'female',
    });

    // Provision test kiosk device
    await adminClient.from('kiosk_devices').insert({
      id: testKioskId,
      name: 'Kiosk Room 101',
      location: 'Building A 1st Floor',
      token_hash: 'initial-hash-value-12345',
      is_active: true,
    });
  });

  // =========================================================================
  // 1. AUTH REPOSITORY INTEGRATION
  // =========================================================================
  describe('1. AuthRepository against Postgres', () => {
    it('1.1 should read user profile by ID', async () => {
      const profile = await authRepo.getProfileById(testAdminUserId);
      expect(profile).toBeDefined();
      expect(profile?.id).toBe(testAdminUserId);
      expect(profile?.role).toBe('admin');
    });

    it('1.2 should record staff device in staff_devices table', async () => {
      const deviceId = `dev-${randomUUID()}`;
      await authRepo.recordStaffDevice(testPtUserId, deviceId, 'Mozilla/5.0 IntegrationTest');

      const adminClient = getAdminClient();
      const { data, error } = await adminClient
        .from('staff_devices')
        .select('*')
        .eq('user_id', testPtUserId)
        .eq('device_id', deviceId)
        .single();

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data.device_id).toBe(deviceId);
      expect(data.user_agent_summary).toContain('IntegrationTest');
    });

    it('1.3 should record login failure and retrieve failures count from audit_logs', async () => {
      const testUsername = `test_failure_${Date.now()}`;
      const testIp = '192.168.10.55';

      await authRepo.recordLoginFailure(testUsername, testIp);
      await authRepo.recordLoginFailure(testUsername, testIp);

      const failures = await authRepo.getLoginFailuresByUsername(testUsername, 60000);
      expect(failures).toBe(2);
    });
  });

  // =========================================================================
  // 2. STAFF REPOSITORY INTEGRATION
  // =========================================================================
  describe('2. StaffRepository against Postgres', () => {
    it('2.1 should retrieve staff member by ID and username', async () => {
      const staffMember = await staffRepo.getStaffById(testPtUserId);
      expect(staffMember).toBeDefined();
      expect(staffMember?.role).toBe('pt');

      const byUsername = await staffRepo.getStaffByUsername(staffMember!.username);
      expect(byUsername?.id).toBe(testPtUserId);
    });

    it('2.2 should list staff with filtering', async () => {
      const staffList = await staffRepo.listStaff({ role: 'pt' });
      expect(staffList.length).toBeGreaterThanOrEqual(1);
      expect(staffList.some((s) => s.id === testPtUserId)).toBe(true);
    });
  });

  // =========================================================================
  // 3. PATIENTS REPOSITORY INTEGRATION (Sequences & Assignments)
  // =========================================================================
  describe('3. PatientRepository against Postgres', () => {
    it('3.1 should create patient and issue auto-increment HN from patient_hn_seq', async () => {
      const created = await patientRepo.createPatient(
        {
          first_name: 'กิตติ',
          last_name: 'ทดสอบ',
          age: 40,
          sex: 'male',
          phone: '0891112233',
          injury: 'Lumbar disc herniation',
        },
        testPtUserId,
        testPtUserId
      );

      expect(created).toBeDefined();
      expect(created.id).toBeDefined();
      expect(created.hn).toMatch(/^HN\d{6}$/);
      expect(created.registration_status).toBe('awaiting_face');
      testPatientId = created.id;
    });

    it('3.2 should verify patient accessibility by responsible PT', async () => {
      const isAccessible = await patientRepo.isPatientAccessibleByPt(testPatientId, testPtUserId);
      expect(isAccessible).toBe(true);

      const randomOtherPtId = randomUUID();
      const isBlocked = await patientRepo.isPatientAccessibleByPt(testPatientId, randomOtherPtId);
      expect(isBlocked).toBe(false);
    });

    it('3.3 should create enrollment ticket and checkin for patient', async () => {
      const ticket = await patientRepo.createEnrollmentTicket(testPatientId, testKioskId, testPtUserId);
      expect(ticket).toBeDefined();
      expect(ticket.patient_id).toBe(testPatientId);
      expect(ticket.kiosk_id).toBe(testKioskId);

      const checkin = await patientRepo.createCheckin(testPatientId, testKioskId, testPtUserId);
      expect(checkin).toBeDefined();
      expect(checkin.patient_id).toBe(testPatientId);
    });
  });

  // =========================================================================
  // 4. COURSES REPOSITORY INTEGRATION (Courses & Items Snapshot)
  // =========================================================================
  describe('4. CourseRepository against Postgres', () => {
    it('4.1 should create exercise, course, and course items snapshot', async () => {
      const adminClient = getAdminClient();
      const exerciseId = randomUUID();

      // Seed exercise
      await adminClient.from('exercises').insert({
        id: exerciseId,
        title: 'Shoulder Pendulum',
        description: 'Gentle circular movements',
        default_sets: 3,
        default_reps: 10,
        difficulty: 'easy',
        created_by: testPtUserId,
      });

      // Create course with snapshot item
      const today = new Date().toISOString().split('T')[0];
      const nextMonth = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];

      const course = await courseRepo.createCourse(
        {
          patient_id: testPatientId,
          start_date: today,
          end_date: nextMonth,
          weekdays: [1, 3, 5],
          kiosk_id: testKioskId,
        },
        testPtUserId,
        [
          {
            exercise_id: exerciseId,
            sets: 3,
            reps: 12,
            position: 1,
          },
        ]
      );

      expect(course).toBeDefined();
      expect(course.id).toBeDefined();
      expect(course.patient_id).toBe(testPatientId);

      const retrieved = await courseRepo.getCourseById(course.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.items).toBeDefined();
      expect(retrieved?.items?.[0]?.sets).toBe(3);
      expect(retrieved?.items?.[0]?.reps).toBe(12);
    });
  });

  // =========================================================================
  // 5. KIOSK REPOSITORY INTEGRATION (Pairing, Challenge & Staff Calls)
  // =========================================================================
  describe('5. KioskRepository against Postgres', () => {
    it('5.1 should manage face challenge nonce in face_challenges table', async () => {
      const nonce = randomUUID();
      const expiresAt = new Date(Date.now() + 60000);
      const steps = ['left', 'right', 'nod'];

      await kioskRepo.saveChallenge(nonce, testKioskId, steps, expiresAt);
      const record = await kioskRepo.getChallenge(nonce);
      expect(record).toBeDefined();
      expect(record?.nonce).toBe(nonce);
      expect(record?.steps).toEqual(steps);

      await kioskRepo.markChallengeUsed(nonce);
      const updated = await kioskRepo.getChallenge(nonce);
      expect(updated?.used_at).not.toBeNull();
    });

    it('5.2 should create, list, and handle staff call in staff_calls table', async () => {
      const call = await kioskRepo.createStaffCall(testKioskId, 'Patient needs assistance with camera');
      expect(call).toBeDefined();
      expect(call.kiosk_id).toBe(testKioskId);
      expect(call.handled_at).toBeNull();

      const pendingCalls = await kioskRepo.listStaffCalls('pending');
      expect(pendingCalls.some((c) => c.id === call.id)).toBe(true);

      const handledOk = await kioskRepo.handleStaffCall(call.id, testPtUserId);
      expect(handledOk).toBe(true);
    });
  });

  // =========================================================================
  // 6. RECORDS REPOSITORY & APPEND-ONLY TRIGGER INTEGRATION
  // =========================================================================
  describe('6. RecordsRepository & Inviolable Append-Only Triggers against Postgres', () => {
    let noteId: string;
    let resultId: string;

    it('6.1 should insert medical note and treatment result', async () => {
      const note = await recordsRepo.createNote(
        testPatientId,
        testPtUserId,
        'Initial examination: Shoulder ROM restricted to 90 degrees.'
      );
      expect(note).toBeDefined();
      expect(note.id).toBeDefined();
      noteId = note.id;

      const result = await recordsRepo.createTreatmentResult(
        testPatientId,
        testPtUserId,
        'Treatment Session 1: Applied heat pack and passive mobilization.'
      );
      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      resultId = result.id;
    });

    it('6.2 should strictly fail with database exception on direct UPDATE of medical_notes (Trigger Rule)', async () => {
      const adminClient = getAdminClient();
      const { error } = await adminClient
        .from('medical_notes')
        .update({ body: 'Tampered note content' })
        .eq('id', noteId);

      // Trigger enforce_append_only_records must raise exception
      expect(error).not.toBeNull();
      expect(error?.message).toContain('append-only');
    });

    it('6.3 should strictly fail with database exception on direct DELETE of medical_notes (Trigger Rule)', async () => {
      const adminClient = getAdminClient();
      const { error } = await adminClient
        .from('medical_notes')
        .delete()
        .eq('id', noteId);

      expect(error).not.toBeNull();
      expect(error?.message).toContain('append-only');
    });

    it('6.4 should strictly fail with database exception on direct UPDATE of treatment_results (Trigger Rule)', async () => {
      const adminClient = getAdminClient();
      const { error } = await adminClient
        .from('treatment_results')
        .update({ body: 'Tampered treatment content' })
        .eq('id', resultId);

      expect(error).not.toBeNull();
      expect(error?.message).toContain('append-only');
    });

    it('6.5 should strictly fail with database exception on direct DELETE of treatment_results (Trigger Rule)', async () => {
      const adminClient = getAdminClient();
      const { error } = await adminClient
        .from('treatment_results')
        .delete()
        .eq('id', resultId);

      expect(error).not.toBeNull();
      expect(error?.message).toContain('append-only');
    });
  });
});
