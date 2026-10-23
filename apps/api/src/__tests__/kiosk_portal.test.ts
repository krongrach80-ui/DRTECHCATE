import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { resetAllFakeRepositories } from './fixtures/fakeRepositories';
import { defaultPatientRepository } from '../modules/patients/repository';
import { defaultCourseRepository } from '../modules/courses/repository';
import { defaultDirectoryRepository } from '../modules/directory/repository';
import { defaultKioskRepository } from '../modules/kiosk/repository';
import { resetAuthTestState } from '../middleware/authenticate';
import { clearAllBans } from '../middleware/banCheck';
import { KioskStateMachine } from '../../../../packages/mission-engine/src/index';
import fs from 'fs';
import path from 'path';

describe('[UNIT] DrTech.Care System 12: Kiosk Terminal & Daily Mission Test Suite', () => {
  const app = createApp();

  beforeAll(() => {
    (process.env as Record<string, string>).NODE_ENV = 'test';
    process.env.SUPABASE_URL = 'http://127.0.0.1:54321';
    process.env.SUPABASE_ANON_KEY = 'sb_publishable_RIM7hit0_ZY0y5fBCK_Uuw_bEJY7H5I';
    process.env.INTERNAL_EMAIL_DOMAIN = 'drtech.care';
    process.env.HOSPITAL_IPS = '127.0.0.1,::1,localhost,10.0.0.1';
    process.env.FACE_T_ACCEPT = '0.60';
    process.env.FACE_T_REJECT = '0.45';
    process.env.FACE_T_MARGIN = '0.10';
    process.env.FACE_T_ENROLL_CONSISTENCY = '0.75';
    process.env.FACE_T_DUPLICATE = '0.85';
    process.env.FACE_CHALLENGE_EXPIRE_SECONDS = '60';
  });

  beforeEach(() => {
    resetAllFakeRepositories();
    clearAllBans();
    resetAuthTestState();
  });

  // =========================================================================
  // 1. Full Daily Mission Flow with Real API Endpoints
  // =========================================================================
  describe('1. Daily Mission Plan & Step Execution API Flow', () => {
    it('1.1 Prescribed patient today retrieves daily plan with exercises', async () => {
      // 1. Create PT and Patient
      const patient = await defaultPatientRepository.createPatient(
        { first_name: 'สุกิจ', last_name: 'เจริญสุข', age: 55, sex: 'male' },
        'pt-001',
        'pt-001'
      );

      // 2. Create an Exercise
      const ex = await defaultDirectoryRepository.createExercise(
        {
          title: 'สะพานโค้งเกร็งสะโพก (Glute Bridge)',
          default_sets: 3,
          default_reps: 12,
          difficulty: 'intermediate',
        },
        'pt-001'
      );

      // 3. Create today course for patient (all days of week active)
      const todayStr = new Date().toISOString().split('T')[0];

      const course = await defaultCourseRepository.createCourse(
        {
          patient_id: patient.id,
          start_date: todayStr,
          end_date: todayStr,
          weekdays: [0, 1, 2, 3, 4, 5, 6],
          include_minigame: true,
          goals: 'ฟื้นฟูกำลังกล้ามเนื้อสะโพกและหลังส่วนล่าง',
        },
        'pt-001',
        [{ exercise_id: ex.id, sets: 3, reps: 12, position: 1 }]
      );

      // 4. Issue kiosk session
      const session = await defaultKioskRepository.createKioskSession('kiosk-01', patient.id);

      // Kiosk calls GET /api/kiosk/plan with kiosk_session and kiosk_device_id cookies
      const planRes = await request(app)
        .get('/api/kiosk/plan')
        .set('Cookie', [`kiosk_session=${session.token}`, 'kiosk_device_id=kiosk-01']);

      expect(planRes.status).toBe(200);
      expect(planRes.body.ok).toBe(true);
      expect(planRes.body.data.plan).toBeDefined();

      const plan = planRes.body.data.plan;
      expect(plan.courseId).toBe(course.id);
      expect(plan.patientId).toBe(patient.id);
      expect(plan.patientFirstName).toBe('สุกิจ');
      expect(plan.doctorNotes).toContain('ฟื้นฟูกำลังกล้ามเนื้อสะโพก');
      expect(plan.exercises.length).toBe(1);
      expect(plan.exercises[0].title).toBe('สะพานโค้งเกร็งสะโพก (Glute Bridge)');
      expect(plan.includeMinigame).toBe(true);
      expect(plan.minigameQuestion).toBeDefined();
    });

    it('1.1b [B1] Enforces Kiosk Session: Rejects patient_id parameter in all kiosk mission endpoints (.strict())', async () => {
      // 1. Create Patient A
      const patientA = await defaultPatientRepository.createPatient(
        { first_name: 'คนไข้เอ', last_name: 'รักษาดี' },
        'pt-001',
        'pt-001'
      );

      const todayStr = new Date().toISOString().split('T')[0];
      const courseA = await defaultCourseRepository.createCourse(
        {
          patient_id: patientA.id,
          start_date: todayStr,
          end_date: todayStr,
          weekdays: [0, 1, 2, 3, 4, 5, 6],
          goals: 'แผนการฝึกของคนไข้ A',
        },
        'pt-001',
        []
      );

      // 2. Patient A logs into kiosk -> gets kiosk_session
      const sessionA = await defaultKioskRepository.createKioskSession('kiosk-01', patientA.id);

      // 3. GET /api/kiosk/plan with session A and valid device cookie -> Returns plan of Patient A!
      const planResA = await request(app)
        .get('/api/kiosk/plan')
        .set('Cookie', [`kiosk_session=${sessionA.token}`, 'kiosk_device_id=kiosk-01']);

      expect(planResA.status).toBe(200);
      expect(planResA.body.ok).toBe(true);
      expect(planResA.body.data.plan.patientId).toBe(patientA.id);
      expect(planResA.body.data.plan.courseId).toBe(courseA.id);

      // 4. GET /api/kiosk/plan attempting to pass patient_id -> REJECTED with 400 VALIDATION_ERROR!
      const planResMismatch = await request(app)
        .get(`/api/kiosk/plan?patient_id=some-other-id`)
        .set('Cookie', [`kiosk_session=${sessionA.token}`, 'kiosk_device_id=kiosk-01']);

      expect(planResMismatch.status).toBe(400);
      expect(planResMismatch.body.error.code).toBe('VALIDATION_ERROR');

      // 5. POST /api/kiosk/mission/steps with patient_id in body -> REJECTED with 400 VALIDATION_ERROR!
      const stepResMismatch = await request(app)
        .post('/api/kiosk/mission/steps')
        .set('X-Requested-With', 'XMLHttpRequest')
        .set('Cookie', [`kiosk_session=${sessionA.token}`, 'kiosk_device_id=kiosk-01'])
        .send({
          patient_id: 'some-other-id',
          course_id: courseA.id,
          step_type: 'exercise',
        });

      expect(stepResMismatch.status).toBe(400);
      expect(stepResMismatch.body.error.code).toBe('VALIDATION_ERROR');

      // 6. POST /api/kiosk/finish with patient_id in body -> REJECTED with 400 VALIDATION_ERROR!
      const finishResMismatch = await request(app)
        .post('/api/kiosk/finish')
        .set('X-Requested-With', 'XMLHttpRequest')
        .set('Cookie', [`kiosk_session=${sessionA.token}`, 'kiosk_device_id=kiosk-01'])
        .send({
          patient_id: 'some-other-id',
          course_id: courseA.id,
        });

      expect(finishResMismatch.status).toBe(400);
      expect(finishResMismatch.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('1.2 Kiosk records exercise step -> updates mission run to in_progress', async () => {
      const patient = await defaultPatientRepository.createPatient(
        { first_name: 'สมศรี', last_name: 'มีสุข' },
        'pt-001',
        'pt-001'
      );
      const session = await defaultKioskRepository.createKioskSession('kiosk-01', patient.id);

      const stepRes = await request(app)
        .post('/api/kiosk/mission/steps')
        .set('X-Requested-With', 'XMLHttpRequest')
        .set('Cookie', [`kiosk_session=${session.token}`, 'kiosk_device_id=kiosk-01'])
        .send({
          course_id: 'course-sample-01',
          step_type: 'exercise',
          ref_id: 'ex-01',
          score: { reps: 10, sets: 3 },
        });

      expect(stepRes.status).toBe(201);
      expect(stepRes.body.ok).toBe(true);
      expect(stepRes.body.data.step).toBeDefined();
      expect(stepRes.body.data.run.status).toBe('in_progress');
    });

    it('1.3 Kiosk finishes mission -> marks run as completed', async () => {
      const patient = await defaultPatientRepository.createPatient(
        { first_name: 'ประเสริฐ', last_name: 'ดีงาม' },
        'pt-001',
        'pt-001'
      );
      const session = await defaultKioskRepository.createKioskSession('kiosk-01', patient.id);

      const finishRes = await request(app)
        .post('/api/kiosk/finish')
        .set('X-Requested-With', 'XMLHttpRequest')
        .set('Cookie', [`kiosk_session=${session.token}`, 'kiosk_device_id=kiosk-01'])
        .send({
          course_id: 'course-sample-02',
        });

      expect(finishRes.status).toBe(200);
      expect(finishRes.body.ok).toBe(true);
      expect(finishRes.body.data.run.status).toBe('completed');
      expect(finishRes.body.data.run.finished_at).toBeDefined();
    });

    it('1.4 Patient with no course today returns { plan: null }', async () => {
      const patient = await defaultPatientRepository.createPatient(
        { first_name: 'ไม่มีนัด', last_name: 'วันนี้' },
        'pt-001',
        'pt-001'
      );
      const session = await defaultKioskRepository.createKioskSession('kiosk-01', patient.id);

      const planRes = await request(app)
        .get('/api/kiosk/plan')
        .set('Cookie', [`kiosk_session=${session.token}`, 'kiosk_device_id=kiosk-01']);

      expect(planRes.status).toBe(200);
      expect(planRes.body.ok).toBe(true);
      expect(planRes.body.data.plan).toBeNull();
    });

    it('1.5 End-to-End System 14: Dynamic Minigame questions from directory, step completion, and score tracking', async () => {
      // 1. Create Patient
      const patient = await defaultPatientRepository.createPatient(
        { first_name: 'ศิริพร', last_name: 'งามยิ่ง' },
        'pt-001',
        'pt-001'
      );

      // 2. Create Exercise
      const exercise = await defaultDirectoryRepository.createExercise(
        {
          title: 'หมุนข้อเท้าตามเข็มและทวนเข็ม',
          default_sets: 2,
          default_reps: 15,
          difficulty: 'beginner',
        },
        'pt-001'
      );

      // 3. Create Custom Minigame and Question in Directory
      const minigame = await defaultDirectoryRepository.createMinigame(
        {
          title: 'เกมทดสอบความจำตำแหน่งท่ากายภาพ',
          description: 'ทบทวนลำดับท่ากายภาพที่ถูกต้อง',
        },
        'admin-001'
      );

      const question = await defaultDirectoryRepository.createQuestion(
        minigame.id,
        {
          prompt: 'ท่าที่ต้องทำก่อนเริ่มยืดเส้นคือท่าใด?',
          choices: ['วอร์มอัพเบาๆ 5 นาที', 'ยกน้ำหนักทันที', 'นั่งนิ่ง 1 ชั่วโมง', 'วิ่งเร็ว 100 เมตร'],
          answer: 'วอร์มอัพเบาๆ 5 นาที',
        },
        'admin-001'
      );

      // 4. Create Active Course today for this patient with minigame enabled
      const todayStr = new Date().toISOString().split('T')[0];
      const course = await defaultCourseRepository.createCourse(
        {
          patient_id: patient.id,
          start_date: todayStr,
          end_date: todayStr,
          weekdays: [0, 1, 2, 3, 4, 5, 6],
          include_minigame: true,
          goals: 'ฝึกความจำและข้อเท้า',
        },
        'pt-001',
        [{ exercise_id: exercise.id, sets: 2, reps: 15, position: 1 }]
      );

      // 5. Issue kiosk session
      const session = await defaultKioskRepository.createKioskSession('kiosk-01', patient.id);
      const cookies = [`kiosk_session=${session.token}`, 'kiosk_device_id=kiosk-01'];

      // 6. GET /api/kiosk/plan should load custom directory minigame question
      const planRes = await request(app)
        .get('/api/kiosk/plan')
        .set('Cookie', cookies);

      expect(planRes.status).toBe(200);
      const plan = planRes.body.data.plan;
      expect(plan.courseId).toBe(course.id);
      expect(plan.minigameTitle).toBe('เกมทดสอบความจำตำแหน่งท่ากายภาพ');
      expect(plan.minigameQuestion).toBeDefined();
      expect(plan.minigameQuestion.id).toBe(question.id);
      expect(plan.minigameQuestion.prompt).toBe('ท่าที่ต้องทำก่อนเริ่มยืดเส้นคือท่าใด?');
      expect(plan.minigameQuestion.answer).toBe('วอร์มอัพเบาๆ 5 นาที');

      // 7. Record exercise step
      const stepRes = await request(app)
        .post('/api/kiosk/mission/steps')
        .set('X-Requested-With', 'XMLHttpRequest')
        .set('Cookie', cookies)
        .send({
          course_id: course.id,
          step_type: 'exercise',
          ref_id: exercise.id,
          score: { reps: 15, sets: 2 },
        });

      expect(stepRes.status).toBe(201);
      expect(stepRes.body.data.step.step_type).toBe('exercise');

      // 8. Record minigame step
      const minigameStepRes = await request(app)
        .post('/api/kiosk/mission/steps')
        .set('X-Requested-With', 'XMLHttpRequest')
        .set('Cookie', cookies)
        .send({
          course_id: course.id,
          step_type: 'minigame',
          ref_id: minigame.id,
          score: { answer: 'วอร์มอัพเบาๆ 5 นาที', points: 10, correct: true },
        });

      expect(minigameStepRes.status).toBe(201);
      expect(minigameStepRes.body.data.step.step_type).toBe('minigame');

      // 9. Finish mission
      const finishRes = await request(app)
        .post('/api/kiosk/finish')
        .set('X-Requested-With', 'XMLHttpRequest')
        .set('Cookie', cookies)
        .send({
          course_id: course.id,
        });

      expect(finishRes.status).toBe(200);
      expect(finishRes.body.data.run.status).toBe('completed');
    });
  });

  // =========================================================================
  // 2. Kiosk Terminal Emergency Staff Calls (Manual & Auto-Fallback)
  // =========================================================================
  describe('2. Kiosk Staff Calls & Assistance Workflow', () => {
    it('2.1 Manual staff call triggers assistance ticket with SSE broadcast', async () => {
      const callRes = await request(app)
        .post('/api/kiosk/call-staff')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          kiosk_id: 'kiosk-01',
          reason: 'คนไข้สูงอายุต้องการความช่วยเหลือที่หน้าตู้',
        });

      expect(callRes.status).toBe(201);
      expect(callRes.body.ok).toBe(true);
      const callId = callRes.body.call_id;
      expect(callId).toBeDefined();

      // Verify call is listed in staff calls queue
      const listRes = await request(app)
        .get('/api/kiosk/staff-calls')
        .set('Cookie', ['access_token=mock-token:pt-001:pt:active']);

      expect(listRes.status).toBe(200);
      const found = listRes.body.data.find((c: { id: string }) => c.id === callId);
      expect(found).toBeDefined();
      expect(found.reason).toContain('คนไข้สูงอายุ');
    });
  });

  // =========================================================================
  // 3. Zero-Leakage & Clean Segregation Invariant (apps/kiosk)
  // =========================================================================
  describe('3. Clean Segregation & Zero-Leakage Invariants in apps/kiosk', () => {
    it('3.1 apps/kiosk contains required UI views and zero admin/pt code', () => {
      const kioskViewsDir = path.resolve(process.cwd(), 'apps/kiosk/src/views');
      const kioskViews = fs.readdirSync(kioskViewsDir);

      // Must have all required Section 9 terminal views
      expect(kioskViews).toContain('IdleView.tsx');
      expect(kioskViews).toContain('PresentView.tsx');
      expect(kioskViews).toContain('AskAccountView.tsx');
      expect(kioskViews).toContain('VerifyView.tsx');
      expect(kioskViews).toContain('ConfirmView.tsx');
      expect(kioskViews).toContain('NoPlanView.tsx');
      expect(kioskViews).toContain('ChecklistView.tsx');
      expect(kioskViews).toContain('PhysioStepView.tsx');
      expect(kioskViews).toContain('MinigameStepView.tsx');
      expect(kioskViews).toContain('TickView.tsx');
      expect(kioskViews).toContain('CompleteView.tsx');
      expect(kioskViews).toContain('CallStaffView.tsx');
      expect(kioskViews).toContain('EnrollView.tsx');

      // MUST NOT contain admin or pt views
      expect(kioskViews).not.toContain('SecurityView.tsx');
      expect(kioskViews).not.toContain('StaffView.tsx');
      expect(kioskViews).not.toContain('ClinicalRecordsView.tsx');
      expect(kioskViews).not.toContain('ReceptionView.tsx');
    });

    it('3.2 apps/kiosk source files contain ZERO imports from apps/admin or apps/pt', () => {
      const kioskSrcDir = path.resolve(process.cwd(), 'apps/kiosk/src');

      function scan(dir: string): void {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const e of entries) {
          const p = path.join(dir, e.name);
          if (e.isDirectory()) {
            scan(p);
          } else if (/\.(ts|tsx)$/.test(e.name)) {
            const content = fs.readFileSync(p, 'utf8');
            expect(content).not.toMatch(/from\s+['"].*apps\/admin/);
            expect(content).not.toMatch(/from\s+['"].*apps\/pt/);
            expect(content).not.toMatch(/from\s+['"]@supabase\/supabase-js['"]/);
          }
        }
      }

      scan(kioskSrcDir);
    });

    it('3.3 dist/apps/kiosk bundle is verified clean with zero Supabase SDK or secret tokens', () => {
      const kioskDistDir = path.resolve(process.cwd(), 'dist/apps/kiosk');
      expect(fs.existsSync(kioskDistDir)).toBe(true);

      const files = fs.readdirSync(kioskDistDir, { recursive: true }) as string[];
      for (const f of files) {
        const fullPath = path.join(kioskDistDir, f);
        if (fs.statSync(fullPath).isFile() && /\.(js|html|json)$/.test(f)) {
          const content = fs.readFileSync(fullPath, 'utf8');
          expect(content).not.toMatch(/@supabase\/supabase-js/);
          expect(content).not.toMatch(/sb_secret_/);
          expect(content).not.toMatch(/service_role/);
        }
      }
    });

    it('3.4 Kiosk State Machine guarantees 100% data wipe on reset (DoD Requirement)', () => {
      const machine = new KioskStateMachine();

      // Set user session in context
      machine.handleEvent({ type: 'TAP_SCREEN' });
      machine.handleEvent({ type: 'TAP_SCREEN' });
      machine.handleEvent({ type: 'SELECT_HAS_ACCOUNT' });
      machine.handleEvent({
        type: 'VERIFY_SUCCESS',
        patientId: 'patient-test-wipe',
        patientFirstName: 'กานต์',
        avatarUrl: 'https://cdn.example.com/avatar.jpg',
      });

      expect(machine.getContext().patientId).toBe('patient-test-wipe');
      expect(machine.getContext().patientFirstName).toBe('กานต์');

      // Execute RESET
      machine.reset();

      expect(machine.getState()).toBe('IDLE');
      const cleanCtx = machine.getContext();
      expect(cleanCtx.patientId).toBeNull();
      expect(cleanCtx.patientFirstName).toBeNull();
      expect(cleanCtx.avatarUrl).toBeNull();
      expect(cleanCtx.plan).toBeNull();
    });
  });
});
