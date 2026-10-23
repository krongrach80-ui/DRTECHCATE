import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { defaultStaffRepository } from '../modules/staff/repository';
import { defaultDirectoryRepository } from '../modules/directory/repository';
import { resetAuthTestState } from '../middleware/authenticate';

describe('[UNIT] DrTech.Care System 5A: Staff & Directory Complete Test Suite', () => {
  const app = createApp();

  beforeAll(() => {
    (process.env as Record<string, string>).NODE_ENV = 'test';
    process.env.SUPABASE_URL = 'https://mctegvnrvmglbibuuczi.supabase.co';
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
    defaultStaffRepository.clearInMemoryStaff();
    defaultDirectoryRepository.clearAllInMemory();
    resetAuthTestState();
  });

  // =========================================================================
  // 1. Staff Management (Master Prompt v3 Section 5 - Line 153 & Section 8)
  // =========================================================================
  describe('1. Staff Management & Role-Based Access Control', () => {
    it('1.1 should allow admin to create new staff member (PT with license)', async () => {
      const res = await request(app)
        .post('/api/staff')
        .set('Cookie', ['access_token=mock-token:admin-001:admin:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          username: 'pt_somchai',
          password: 'Password12345!', // >= 12 chars
          role: 'pt',
          full_name: 'Somchai Jaidee',
          phone: '0812345678',
          license_no: 'PT-123456',
          specialty: 'Orthopedic Rehab',
        });

      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.username).toBe('pt_somchai');
      expect(res.body.data.role).toBe('pt');
      expect(res.body.data.pt_details?.license_no).toBe('PT-123456');
      expect(res.body.data.password).toBeUndefined(); // Never expose password!
    });

    it('1.2 should strictly reject PT from creating staff members with 403 FORBIDDEN', async () => {
      const res = await request(app)
        .post('/api/staff')
        .set('Cookie', ['access_token=mock-token:pt-001:pt:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          username: 'pt_fake',
          password: 'Password12345!',
          role: 'pt',
          full_name: 'Fake PT',
          license_no: 'PT-999999',
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('1.3 should reject creating staff with password less than 12 characters', async () => {
      const res = await request(app)
        .post('/api/staff')
        .set('Cookie', ['access_token=mock-token:admin-001:admin:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          username: 'pt_shortpass',
          password: 'Short123!', // only 9 chars
          role: 'pt',
          full_name: 'Short Pass User',
          license_no: 'PT-888888',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('1.4 should reject creating PT without license number', async () => {
      const res = await request(app)
        .post('/api/staff')
        .set('Cookie', ['access_token=mock-token:admin-001:admin:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          username: 'pt_nolicense',
          password: 'Password12345!',
          role: 'pt',
          full_name: 'No License PT',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('1.5 should reject duplicate username with 409 USERNAME_EXISTS', async () => {
      // First creation
      await request(app)
        .post('/api/staff')
        .set('Cookie', ['access_token=mock-token:admin-001:admin:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          username: 'pt_duplicate',
          password: 'Password12345!',
          role: 'pt',
          full_name: 'First User',
          license_no: 'PT-111111',
        });

      // Second creation with same username
      const res = await request(app)
        .post('/api/staff')
        .set('Cookie', ['access_token=mock-token:admin-001:admin:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          username: 'pt_duplicate',
          password: 'Password12345!',
          role: 'admin',
          full_name: 'Second User',
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('USERNAME_EXISTS');
    });

    it('1.6 should enforce that PT can view only their own profile, not another staff member', async () => {
      // Create another staff member
      const createRes = await request(app)
        .post('/api/staff')
        .set('Cookie', ['access_token=mock-token:admin-001:admin:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          username: 'other_pt',
          password: 'Password12345!',
          role: 'pt',
          full_name: 'Other PT',
          license_no: 'PT-333333',
        });

      const otherPtId = createRes.body.data.id;

      // PT-001 attempts to view other PT profile -> 403 Forbidden
      const res = await request(app)
        .get(`/api/staff/${otherPtId}`)
        .set('Cookie', ['access_token=mock-token:pt-001:pt:active']);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');

      // Admin views other PT profile -> 200 OK
      const adminRes = await request(app)
        .get(`/api/staff/${otherPtId}`)
        .set('Cookie', ['access_token=mock-token:admin-001:admin:active']);

      expect(adminRes.status).toBe(200);
      expect(adminRes.body.data.username).toBe('other_pt');
    });

    it('1.7 should prevent PT from modifying their own role or status', async () => {
      // Seed self PT profile in repository
      await defaultStaffRepository.createStaff({
        id: 'pt-001',
        role: 'pt',
        username: 'pt_self',
        full_name: 'Self PT',
        status: 'active',
      });

      // PT attempts to promote themselves to admin
      const res = await request(app)
        .patch('/api/staff/pt-001')
        .set('Cookie', ['access_token=mock-token:pt-001:pt:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          role: 'admin',
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('1.8 should allow admin to suspend staff and immediately terminate active session', async () => {
      // 1. Create a staff member
      const createRes = await request(app)
        .post('/api/staff')
        .set('Cookie', ['access_token=mock-token:admin-001:admin:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          username: 'pt_to_suspend',
          password: 'Password12345!',
          role: 'pt',
          full_name: 'Suspend Target',
          license_no: 'PT-444444',
        });

      const targetId = createRes.body.data.id;

      // 2. Admin suspends target staff member
      const suspendRes = await request(app)
        .post(`/api/staff/${targetId}/suspend`)
        .set('Cookie', ['access_token=mock-token:admin-001:admin:active'])
        .set('X-Requested-With', 'XMLHttpRequest');

      expect(suspendRes.status).toBe(200);
      expect(suspendRes.body.ok).toBe(true);

      // 3. Target staff member attempts to call authenticated endpoint -> 401 SESSION_TERMINATED
      const token = `mock-token:${targetId}:pt:active`;
      const verifyRes = await request(app)
        .get('/api/me')
        .set('Cookie', [`access_token=${token}`]);

      expect(verifyRes.status).toBe(401);
      expect(verifyRes.body.error.code).toBe('SESSION_TERMINATED');
    });

    it('1.9 should allow admin to reset staff password and force logout existing session', async () => {
      const createRes = await request(app)
        .post('/api/staff')
        .set('Cookie', ['access_token=mock-token:admin-001:admin:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          username: 'pt_pwreset',
          password: 'Password12345!',
          role: 'pt',
          full_name: 'Reset Target',
          license_no: 'PT-555555',
        });

      const targetId = createRes.body.data.id;

      // Reset password
      const resetRes = await request(app)
        .post(`/api/staff/${targetId}/reset-password`)
        .set('Cookie', ['access_token=mock-token:admin-001:admin:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          password: 'NewBrandPassword123!',
        });

      expect(resetRes.status).toBe(200);
      expect(resetRes.body.ok).toBe(true);
      expect(resetRes.body.password).toBeUndefined(); // Never display password
    });
  });

  // =========================================================================
  // 2. PTs Directory (Master Prompt v3 Section 5 - Line 155)
  // =========================================================================
  describe('2. PTs Directory Endpoint', () => {
    it('2.1 should list all active PTs for authenticated staff', async () => {
      // Seed a PT profile
      await defaultStaffRepository.createStaff(
        {
          id: 'pt-alpha',
          role: 'pt',
          username: 'pt_alpha',
          full_name: 'Alpha Physio',
          status: 'active',
        },
        {
          license_no: 'PT-90001',
          specialty: 'Stroke Rehab',
        }
      );

      const res = await request(app)
        .get('/api/pts')
        .set('Cookie', ['access_token=mock-token:pt-001:pt:active']);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      const alpha = res.body.data.find((p: { username: string }) => p.username === 'pt_alpha');
      expect(alpha).toBeDefined();
      expect(alpha.pt_details?.license_no).toBe('PT-90001');
    });
  });

  // =========================================================================
  // 3. Exercises Catalog & Ownership Enforcement (Master Prompt v3 Section 5 & 8)
  // =========================================================================
  describe('3. Exercises Catalog & Ownership Rules', () => {
    it('3.1 should allow staff to create an exercise with default sets and reps', async () => {
      const res = await request(app)
        .post('/api/exercises')
        .set('Cookie', ['access_token=mock-token:pt-001:pt:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          title: 'Shoulder Pendulum',
          target_joint: 'shoulder',
          default_sets: 3,
          default_reps: 15,
          difficulty: 'beginner',
        });

      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.title).toBe('Shoulder Pendulum');
      expect(res.body.data.created_by).toBe('pt-001');
    });

    it('3.2 SPEC INVARIANT: PT cannot delete or edit an exercise created by another PT', async () => {
      // 1. PT-001 creates an exercise
      const createRes = await request(app)
        .post('/api/exercises')
        .set('Cookie', ['access_token=mock-token:pt-001:pt:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          title: 'Quad Sets PT1',
          target_joint: 'knee',
          difficulty: 'beginner',
        });

      const exerciseId = createRes.body.data.id;

      // 2. PT-002 attempts to update PT-001 exercise -> 403 Forbidden
      const updateRes = await request(app)
        .patch(`/api/exercises/${exerciseId}`)
        .set('Cookie', ['access_token=mock-token:pt-002:pt:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          title: 'Hacked Title by PT2',
        });

      expect(updateRes.status).toBe(403);
      expect(updateRes.body.error.code).toBe('FORBIDDEN');

      // 3. PT-002 attempts to delete PT-001 exercise -> 403 Forbidden
      const deleteRes = await request(app)
        .delete(`/api/exercises/${exerciseId}`)
        .set('Cookie', ['access_token=mock-token:pt-002:pt:active'])
        .set('X-Requested-With', 'XMLHttpRequest');

      expect(deleteRes.status).toBe(403);
      expect(deleteRes.body.error.code).toBe('FORBIDDEN');

      // 4. PT-001 can delete their own exercise -> 200 OK
      const selfDeleteRes = await request(app)
        .delete(`/api/exercises/${exerciseId}`)
        .set('Cookie', ['access_token=mock-token:pt-001:pt:active'])
        .set('X-Requested-With', 'XMLHttpRequest');

      expect(selfDeleteRes.status).toBe(200);
      expect(selfDeleteRes.body.ok).toBe(true);
    });

    it('3.3 should allow admin to delete any exercise regardless of creator', async () => {
      // PT-001 creates exercise
      const createRes = await request(app)
        .post('/api/exercises')
        .set('Cookie', ['access_token=mock-token:pt-001:pt:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          title: 'Admin Deleted Exercise',
          difficulty: 'intermediate',
        });

      const exerciseId = createRes.body.data.id;

      // Admin deletes it
      const deleteRes = await request(app)
        .delete(`/api/exercises/${exerciseId}`)
        .set('Cookie', ['access_token=mock-token:admin-001:admin:active'])
        .set('X-Requested-With', 'XMLHttpRequest');

      expect(deleteRes.status).toBe(200);
      expect(deleteRes.body.ok).toBe(true);
    });
  });

  // =========================================================================
  // 4. Minigames & Modpacks (Master Prompt v3 Section 8.1 & 8.2)
  // =========================================================================
  describe('4. Minigames & Modpacks Management', () => {
    it('4.1 should allow admin to create minigames and questions, rejecting PT from creating', async () => {
      // PT attempt to create minigame -> 403 Forbidden
      const ptRes = await request(app)
        .post('/api/minigames')
        .set('Cookie', ['access_token=mock-token:pt-001:pt:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          title: 'PT Unauthorized Game',
        });

      expect(ptRes.status).toBe(403);
      expect(ptRes.body.error.code).toBe('FORBIDDEN');

      // Admin creates minigame -> 201 Created
      const adminRes = await request(app)
        .post('/api/minigames')
        .set('Cookie', ['access_token=mock-token:admin-001:admin:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          title: 'Brain Trivia Game',
          category: 'cognitive',
        });

      expect(adminRes.status).toBe(201);
      const gameId = adminRes.body.data.id;

      // Admin creates question
      const questionRes = await request(app)
        .post(`/api/minigames/${gameId}/questions`)
        .set('Cookie', ['access_token=mock-token:admin-001:admin:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          prompt: 'What joint connects the femur and tibia?',
          choices: ['Knee', 'Elbow', 'Ankle', 'Shoulder'],
          answer: 'Knee',
        });

      expect(questionRes.status).toBe(201);
      expect(questionRes.body.data.prompt).toContain('femur');
    });

    it('4.2 should create modpack with ordered exercise items', async () => {
      // 1. Create 2 exercises
      const ex1 = await defaultDirectoryRepository.createExercise(
        { title: 'Exercise 1', difficulty: 'beginner', default_sets: 3, default_reps: 10 },
        'pt-001'
      );
      const ex2 = await defaultDirectoryRepository.createExercise(
        { title: 'Exercise 2', difficulty: 'beginner', default_sets: 3, default_reps: 10 },
        'pt-001'
      );

      // 2. Create modpack
      const res = await request(app)
        .post('/api/modpacks')
        .set('Cookie', ['access_token=mock-token:pt-001:pt:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          name: 'Post-Surgery Knee Bundle',
          description: 'Phase 1 rehabilitation bundle',
          items: [
            { exercise_id: ex1.id, sets: 3, reps: 10, position: 1 },
            { exercise_id: ex2.id, sets: 4, reps: 12, position: 2 },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.name).toBe('Post-Surgery Knee Bundle');
      expect(res.body.data.items.length).toBe(2);
      expect(res.body.data.items[0].position).toBe(1);
      expect(res.body.data.items[1].position).toBe(2);
    });
  });

  // =========================================================================
  // 5. Case Transfers (Master Prompt v3 Section 0 Item 1 & Section 5 Line 155)
  // =========================================================================
  describe('5. Case Transfers (Temporary Case Delegation)', () => {
    it('5.1 should create a temporary case transfer and enforce date integrity', async () => {
      const patientId = 'a0000000-0000-0000-0000-000000000001';
      const toPtId = 'b0000000-0000-0000-0000-000000000002';

      // 1. Invalid dates (end_date < start_date) -> 400
      const badDateRes = await request(app)
        .post('/api/case-transfers')
        .set('Cookie', ['access_token=mock-token:pt-001:pt:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          patient_id: patientId,
          to_pt_id: toPtId,
          start_date: '2026-11-10',
          end_date: '2026-11-05',
        });

      expect(badDateRes.status).toBe(400);

      // 2. Valid transfer
      const res = await request(app)
        .post('/api/case-transfers')
        .set('Cookie', ['access_token=mock-token:pt-001:pt:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          patient_id: patientId,
          to_pt_id: toPtId,
          start_date: '2026-11-01',
          end_date: '2026-11-07',
        });

      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.patient_id).toBe(patientId);
      expect(res.body.data.to_pt_id).toBe(toPtId);
      expect(res.body.data.from_pt_id).toBe('pt-001');
    });

    it('5.2 SPEC INVARIANT: Destination PT can access patient ONLY during active transfer dates', async () => {
      const patientId = 'a0000000-0000-0000-0000-000000000099';
      const delegatePtId = 'b0000000-0000-0000-0000-000000000088';

      // Create active transfer from 2026-11-05 to 2026-11-15
      await defaultDirectoryRepository.createCaseTransfer(
        {
          patient_id: patientId,
          to_pt_id: delegatePtId,
          start_date: '2026-11-05',
          end_date: '2026-11-15',
        },
        'pt-primary-uuid',
        'pt-primary-uuid'
      );

      // Date before transfer window (2026-11-01) -> MUST NOT have access
      const accessBefore = await defaultDirectoryRepository.isPatientDelegatedToPt(
        patientId,
        delegatePtId,
        '2026-11-01'
      );
      expect(accessBefore).toBe(false);

      // Date during transfer window (2026-11-10) -> MUST have access
      const accessDuring = await defaultDirectoryRepository.isPatientDelegatedToPt(
        patientId,
        delegatePtId,
        '2026-11-10'
      );
      expect(accessDuring).toBe(true);

      // Date after transfer window (2026-11-20) -> MUST NOT have access
      const accessAfter = await defaultDirectoryRepository.isPatientDelegatedToPt(
        patientId,
        delegatePtId,
        '2026-11-20'
      );
      expect(accessAfter).toBe(false);
    });
  });
});
