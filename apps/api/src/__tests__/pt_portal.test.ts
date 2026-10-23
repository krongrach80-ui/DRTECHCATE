import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { defaultStaffRepository } from '../modules/staff/repository';
import { defaultPatientRepository } from '../modules/patients/repository';
import { defaultDirectoryRepository } from '../modules/directory/repository';
import { defaultKioskRepository } from '../modules/kiosk/repository';
import { resetAuthTestState } from '../middleware/authenticate';
import { clearAllBans } from '../middleware/banCheck';
import fs from 'fs';
import path from 'path';

describe('[UNIT] DrTech.Care System 11: Physical Therapist Portal (apps/pt) Test Suite', () => {
  const app = createApp();

  beforeAll(() => {
    (process.env as Record<string, string>).NODE_ENV = 'test';
    process.env.SUPABASE_URL = 'https://mctegvnrvmglbibuuczi.supabase.co';
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
    defaultStaffRepository.clearInMemoryStaff();
    defaultPatientRepository.clearInMemory();
    defaultDirectoryRepository.clearAllInMemory();
    defaultKioskRepository.clearPairings();
    clearAllBans();
    resetAuthTestState();
  });

  // =========================================================================
  // 1. Two Physical Therapists (PT 1 & PT 2) Role Isolation & Ownership
  // =========================================================================
  describe('1. Two Physical Therapists (PT 1 & PT 2) Isolation & Access Boundaries', () => {
    it('1.1 PT 1 creates a patient; PT 2 cannot access or view PT 1 patient', async () => {
      // PT 1 creates patient
      const p1Res = await request(app)
        .post('/api/patients')
        .set('Cookie', ['access_token=mock-token:pt-001:pt:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          first_name: 'Wichai',
          last_name: 'Suksamran',
          age: 48,
          sex: 'male',
          phone: '0819998877',
          injury: 'Post-op ACL reconstruction',
        });

      expect(p1Res.status).toBe(201);
      const patientId = p1Res.body.data.id;
      expect(p1Res.body.data.responsible_pt_id).toBe('pt-001');

      // PT 2 tries to access patient 1 directly -> 403 Forbidden
      const pt2AccessRes = await request(app)
        .get(`/api/patients/${patientId}`)
        .set('Cookie', ['access_token=mock-token:pt-002:pt:active']);

      expect(pt2AccessRes.status).toBe(403);
      expect(pt2AccessRes.body.error).toBeDefined();

      // PT 2 searches patients -> PT 1 patient is filtered out from results
      const pt2ListRes = await request(app)
        .get('/api/patients')
        .set('Cookie', ['access_token=mock-token:pt-002:pt:active']);

      expect(pt2ListRes.status).toBe(200);
      const found = (pt2ListRes.body.patients || []).find((p: { id: string }) => p.id === patientId);
      expect(found).toBeUndefined();
    });

    it('1.2 Exercise Ownership: PT 2 can view PT 1 exercise but cannot edit or delete it', async () => {
      // PT 1 creates exercise
      const exRes = await request(app)
        .post('/api/exercises')
        .set('Cookie', ['access_token=mock-token:pt-001:pt:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          title: 'PT1 Quad Sets Special',
          description: 'Special technique for quadriceps activation',
          default_sets: 3,
          default_reps: 15,
          difficulty: 'intermediate',
        });

      expect(exRes.status).toBe(201);
      const exerciseId = exRes.body.data.id;

      // PT 2 can view the exercise catalog
      const listRes = await request(app)
        .get('/api/exercises')
        .set('Cookie', ['access_token=mock-token:pt-002:pt:active']);

      expect(listRes.status).toBe(200);
      const exInList = listRes.body.data.find((e: { id: string }) => e.id === exerciseId);
      expect(exInList).toBeDefined();

      // PT 2 attempts to edit PT 1 exercise -> 403 Forbidden
      const updateRes = await request(app)
        .patch(`/api/exercises/${exerciseId}`)
        .set('Cookie', ['access_token=mock-token:pt-002:pt:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ title: 'Hacked Title by PT 2' });

      expect(updateRes.status).toBe(403);

      // PT 2 attempts to delete PT 1 exercise -> 403 Forbidden
      const deleteRes = await request(app)
        .delete(`/api/exercises/${exerciseId}`)
        .set('Cookie', ['access_token=mock-token:pt-002:pt:active'])
        .set('X-Requested-With', 'XMLHttpRequest');

      expect(deleteRes.status).toBe(403);
    });

    it('1.3 Case Transfer: PT 1 delegates case to PT 2; PT 2 is granted access during transfer window', async () => {
      // 1. PT 1 creates patient
      const pRes = await request(app)
        .post('/api/patients')
        .set('Cookie', ['access_token=mock-token:pt-001:pt:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          first_name: 'Naree',
          last_name: 'Tongdee',
          age: 52,
          sex: 'female',
          phone: '0895556677',
        });
      const patientId = pRes.body.data.id;

      // 2. PT 1 delegates case to PT 2
      const today = new Date().toISOString().split('T')[0];
      const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
      const transferRes = await request(app)
        .post('/api/case-transfers')
        .set('Cookie', ['access_token=mock-token:pt-001:pt:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          patient_id: patientId,
          to_pt_id: 'pt-002',
          start_date: today,
          end_date: nextWeek,
          reason: 'Academic conference leave',
        });

      expect(transferRes.status).toBe(201);

      // 3. PT 2 can now access patient during active window
      const pt2AccessRes = await request(app)
        .get(`/api/patients/${patientId}`)
        .set('Cookie', ['access_token=mock-token:pt-002:pt:active']);

      expect(pt2AccessRes.status).toBe(200);
      expect(pt2AccessRes.body.data.first_name).toBe('Naree');
    });
  });

  // =========================================================================
  // 2. Security & Forbidden Admin Endpoints Boundary (DoD: PT gets 403 on Audit)
  // =========================================================================
  describe('2. Security Boundary Enforcement (PT receives 403 on Admin/Audit)', () => {
    it('2.1 SPEC INVARIANT: PT role receives 403 Forbidden on GET /api/audit', async () => {
      const res = await request(app)
        .get('/api/audit')
        .set('Cookie', ['access_token=mock-token:pt-001:pt:active']);

      expect(res.status).toBe(403);
      expect(res.body.error).toBeDefined();
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('2.2 SPEC INVARIANT: PT role receives 403 Forbidden on security bans endpoint', async () => {
      const res = await request(app)
        .post('/api/security/bans')
        .set('Cookie', ['access_token=mock-token:pt-001:pt:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          type: 'ip',
          value: '192.168.1.100',
          reason: 'Unauthorized PT attempt',
        });

      expect(res.status).toBe(403);
    });

    it('2.3 SPEC INVARIANT: PT role receives 403 Forbidden on force-logout endpoint', async () => {
      const res = await request(app)
        .post('/api/security/force-logout/user-999')
        .set('Cookie', ['access_token=mock-token:pt-001:pt:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ reason: 'Unauthorized PT trigger' });

      expect(res.status).toBe(403);
    });
  });

  // =========================================================================
  // 3. Reception Screen Workflows (Dispatch, Check-in, Staff Calls)
  // =========================================================================
  describe('3. Reception Desk & Realtime Queue Workflows', () => {
    it('3.1 PT can send patient to kiosk; generates single-use 10-minute enrollment ticket', async () => {
      const pRes = await request(app)
        .post('/api/patients')
        .set('Cookie', ['access_token=mock-token:pt-001:pt:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          first_name: 'Preecha',
          last_name: 'Khemklad',
          age: 60,
          sex: 'male',
        });

      const patientId = pRes.body.data.id;

      const ticketRes = await request(app)
        .post(`/api/patients/${patientId}/send-to-kiosk`)
        .set('Cookie', ['access_token=mock-token:pt-001:pt:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ kiosk_id: 'kiosk-01' });

      expect(ticketRes.status).toBe(201);
      expect(ticketRes.body.ok).toBe(true);
      expect(ticketRes.body.data.id).toBeDefined();
      expect(ticketRes.body.data.expires_at).toBeDefined();
    });

    it('3.2 PT can check-in patient at reception to enter today active face gallery', async () => {
      const pRes = await request(app)
        .post('/api/patients')
        .set('Cookie', ['access_token=mock-token:pt-001:pt:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          first_name: 'Suda',
          last_name: 'Maneerat',
          age: 38,
          sex: 'female',
        });

      const patientId = pRes.body.data.id;

      const checkinRes = await request(app)
        .post(`/api/patients/${patientId}/checkin`)
        .set('Cookie', ['access_token=mock-token:pt-001:pt:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({});

      expect(checkinRes.status).toBe(200);
      expect(checkinRes.body.ok).toBe(true);
      expect(checkinRes.body.data.id).toBeDefined();
    });

    it('3.3 PT can view and resolve emergency staff calls from reception screen', async () => {
      const kiosk = await defaultKioskRepository.createDevice('Kiosk Ward A', 'Level 1');
      const call = await defaultKioskRepository.createStaffCall(
        kiosk.id,
        'Patient requested physiotherapist assistance'
      );

      // PT lists calls
      const listRes = await request(app)
        .get('/api/kiosk/staff-calls')
        .set('Cookie', ['access_token=mock-token:pt-001:pt:active']);

      expect(listRes.status).toBe(200);
      const found = listRes.body.data.find((c: { id: string }) => c.id === call.id);
      expect(found).toBeDefined();

      // PT handles call
      const handleRes = await request(app)
        .post(`/api/kiosk/staff-calls/${call.id}/handle`)
        .set('Cookie', ['access_token=mock-token:pt-001:pt:active'])
        .set('X-Requested-With', 'XMLHttpRequest');

      expect(handleRes.status).toBe(200);
      expect(handleRes.body.ok).toBe(true);
    });
  });

  // =========================================================================
  // 4. Clinical Records Append-Only & Versioning Invariant
  // =========================================================================
  describe('4. Clinical Records (Notes & Versioned Results)', () => {
    it('4.1 PT can append medical notes (Append-Only)', async () => {
      const pRes = await request(app)
        .post('/api/patients')
        .set('Cookie', ['access_token=mock-token:pt-001:pt:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          first_name: 'Chai',
          last_name: 'Wongsuwan',
          age: 44,
          sex: 'male',
        });
      const patientId = pRes.body.data.id;

      const noteRes = await request(app)
        .post(`/api/patients/${patientId}/notes`)
        .set('Cookie', ['access_token=mock-token:pt-001:pt:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ body: 'Patient shows good response to hamstring stretch. Pain VAS 3/10.' });

      expect(noteRes.status).toBe(201);
      expect(noteRes.body.ok).toBe(true);
      expect(noteRes.body.data.body).toContain('hamstring stretch');
    });

    it('4.2 Treatment results are versioned and point to supersedes_id', async () => {
      const pRes = await request(app)
        .post('/api/patients')
        .set('Cookie', ['access_token=mock-token:pt-001:pt:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          first_name: 'Boonmee',
          last_name: 'Siriwong',
          age: 50,
          sex: 'male',
        });
      const patientId = pRes.body.data.id;

      // Version 1
      const v1Res = await request(app)
        .post(`/api/patients/${patientId}/treatment-results`)
        .set('Cookie', ['access_token=mock-token:pt-001:pt:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ body: 'Initial evaluation: ROM limited to 90 degrees flexion.' });

      expect(v1Res.status).toBe(201);
      expect(v1Res.body.data.version).toBe(1);
      const v1Id = v1Res.body.data.id;

      // Version 2
      const v2Res = await request(app)
        .post(`/api/patients/${patientId}/treatment-results`)
        .set('Cookie', ['access_token=mock-token:pt-001:pt:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          body: 'Follow-up: ROM improved to 120 degrees flexion.',
          supersedes_id: v1Id,
        });

      expect(v2Res.status).toBe(201);
      expect(v2Res.body.data.version).toBe(2);
      expect(v2Res.body.data.supersedes_id).toBe(v1Id);
    });
  });

  // =========================================================================
  // 5. Clean Segregation & Bundle Zero-Leakage (apps/pt)
  // =========================================================================
  describe('5. Clean Segregation & Zero Admin Code Invariant in apps/pt', () => {
    it('5.1 apps/pt contains all 5 required windows + reception and ZERO admin views', () => {
      const ptViewsDir = path.resolve(process.cwd(), 'apps/pt/src/views');
      const ptViews = fs.readdirSync(ptViewsDir);

      // Must have the 5 PT windows + Reception
      expect(ptViews).toContain('ReceptionView.tsx');
      expect(ptViews).toContain('MyPatientsView.tsx');
      expect(ptViews).toContain('ClinicalRecordsView.tsx');
      expect(ptViews).toContain('ExerciseCatalogView.tsx');
      expect(ptViews).toContain('PtScheduleView.tsx');
      expect(ptViews).toContain('ProfileView.tsx');

      // MUST NOT have Admin specific views
      expect(ptViews).not.toContain('SecurityView.tsx');
      expect(ptViews).not.toContain('StaffView.tsx');
    });

    it('5.2 apps/pt source files contain ZERO imports from apps/admin', () => {
      const ptSrcDir = path.resolve(process.cwd(), 'apps/pt/src');

      function scan(dir: string): void {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const e of entries) {
          const p = path.join(dir, e.name);
          if (e.isDirectory()) {
            scan(p);
          } else if (/\.(ts|tsx)$/.test(e.name)) {
            const content = fs.readFileSync(p, 'utf8');
            expect(content).not.toMatch(/from\s+['"].*apps\/admin/);
            expect(content).not.toMatch(/from\s+['"]@supabase\/supabase-js['"]/);
          }
        }
      }

      scan(ptSrcDir);
    });

    it('5.3 dist/apps/pt contains ZERO @supabase/supabase-js or secret tokens', () => {
      const ptDistDir = path.resolve(process.cwd(), 'dist/apps/pt');
      expect(fs.existsSync(ptDistDir)).toBe(true);

      const files = fs.readdirSync(ptDistDir, { recursive: true }) as string[];
      for (const f of files) {
        const fullPath = path.join(ptDistDir, f);
        if (fs.statSync(fullPath).isFile() && /\.(js|html|json)$/.test(f)) {
          const content = fs.readFileSync(fullPath, 'utf8');
          expect(content).not.toMatch(/@supabase\/supabase-js/);
          expect(content).not.toMatch(/sb_secret_/);
          expect(content).not.toMatch(/service_role/);
        }
      }
    });
  });
});
