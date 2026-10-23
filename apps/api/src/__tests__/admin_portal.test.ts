import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { resetAllFakeRepositories } from './fixtures/fakeRepositories';
import { defaultKioskRepository } from '../modules/kiosk/repository';
import { resetAuthTestState } from '../middleware/authenticate';
import { clearAllBans } from '../middleware/banCheck';
import fs from 'fs';
import path from 'path';

describe('[UNIT] DrTech.Care System 10: Hospital Director Admin Portal & API Client', () => {
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
  // 1. Admin Authentication & Role Boundary (Master Prompt v3 Section 8.1)
  // =========================================================================
  describe('1. Admin Role Authentication & Permissions', () => {
    it('1.1 should identify Admin user on /api/auth/me', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Cookie', ['access_token=mock-token:admin-001:admin:active']);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.user.role).toBe('admin');
    });

    it('1.2 SPEC INVARIANT: PT role cannot access admin-only endpoints (Returns 403)', async () => {
      // PT trying to access /api/kiosk/devices (Admin only)
      const res = await request(app)
        .get('/api/kiosk/devices')
        .set('Cookie', ['access_token=mock-token:pt-001:pt:active']);

      expect(res.status).toBe(403);
      expect(res.body.error).toBeDefined();
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('1.3 Unauthenticated requests receive 401 Unauthorized', async () => {
      const res = await request(app).get('/api/kiosk/devices');
      expect(res.status).toBe(401);
    });
  });

  // =========================================================================
  // 2. Staff Management Wizard & Actions (Master Prompt v3 Section 8.1 Window 1)
  // =========================================================================
  describe('2. Staff Management Actions', () => {
    it('2.1 Admin can list all staff members', async () => {
      const res = await request(app)
        .get('/api/staff')
        .set('Cookie', ['access_token=mock-token:admin-001:admin:active']);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('2.2 Admin can create a new PT staff member with license', async () => {
      const res = await request(app)
        .post('/api/staff')
        .set('Cookie', ['access_token=mock-token:admin-001:admin:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          username: 'pt_anawat',
          password: 'Password12345!',
          role: 'pt',
          full_name: 'Anawat Kaewmanee',
          phone: '0891112233',
          license_no: 'PT-998877',
          specialty: 'Neurological Physical Therapy',
        });

      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.username).toBe('pt_anawat');
    });

    it('2.3 Admin can suspend and reset password for staff member', async () => {
      // 1. Create staff
      const createRes = await request(app)
        .post('/api/staff')
        .set('Cookie', ['access_token=mock-token:admin-001:admin:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          username: 'pt_sompong',
          password: 'Password12345!',
          role: 'pt',
          full_name: 'Sompong Jaidee',
          phone: '0812223344',
          license_no: 'PT-112233',
        });

      const staffId = createRes.body.data.id;

      // 2. Suspend staff
      const suspendRes = await request(app)
        .post(`/api/staff/${staffId}/suspend`)
        .set('Cookie', ['access_token=mock-token:admin-001:admin:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ is_active: false });

      expect(suspendRes.status).toBe(200);
      expect(suspendRes.body.ok).toBe(true);

      // 3. Reset password
      const resetRes = await request(app)
        .post(`/api/staff/${staffId}/reset-password`)
        .set('Cookie', ['access_token=mock-token:admin-001:admin:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ password: 'NewStrongPassword123!' });

      expect(resetRes.status).toBe(200);
      expect(resetRes.body.ok).toBe(true);
    });
  });

  // =========================================================================
  // 3. Kiosk Devices & Staff Emergency Calls (Master Prompt v3 Section 8.1 Window 6)
  // =========================================================================
  describe('3. Kiosk Devices & Emergency Staff Calls', () => {
    it('3.1 Admin can create and list kiosk devices', async () => {
      // Create new kiosk
      const createRes = await request(app)
        .post('/api/kiosk/devices')
        .set('Cookie', ['access_token=mock-token:admin-001:admin:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          name: 'Kiosk 01 - Building A',
          location: 'Floor 2 Physiotherapy Ward',
        });

      expect(createRes.status).toBe(201);
      expect(createRes.body.ok).toBe(true);
      expect(createRes.body.data.name).toBe('Kiosk 01 - Building A');

      // List kiosks
      const listRes = await request(app)
        .get('/api/kiosk/devices')
        .set('Cookie', ['access_token=mock-token:admin-001:admin:active']);

      expect(listRes.status).toBe(200);
      expect(listRes.body.ok).toBe(true);
      const found = listRes.body.data.find((k: { name: string }) => k.name === 'Kiosk 01 - Building A');
      expect(found).toBeDefined();
    });

    it('3.2 Admin can issue single-use 10-minute pairing code for kiosk', async () => {
      const kiosk = await defaultKioskRepository.createDevice('Kiosk 02', 'Lobby');

      const pairCodeRes = await request(app)
        .post('/api/kiosk/pair-code')
        .set('Cookie', ['access_token=mock-token:admin-001:admin:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ kiosk_id: kiosk.id });

      expect(pairCodeRes.status).toBe(201);
      expect(pairCodeRes.body.ok).toBe(true);
      expect(pairCodeRes.body.pairing_code).toMatch(/^[0-9A-Z]{6}$/);
      expect(pairCodeRes.body.expires_in_seconds).toBe(600);
    });

    it('3.3 Staff calls can be listed and resolved by staff/admin', async () => {
      const kiosk = await defaultKioskRepository.createDevice('Kiosk 03', 'Ward B');
      const call = await defaultKioskRepository.createStaffCall(
        kiosk.id,
        'Face scan verification failed 3 times'
      );

      // List calls
      const listRes = await request(app)
        .get('/api/kiosk/staff-calls')
        .set('Cookie', ['access_token=mock-token:admin-001:admin:active']);

      expect(listRes.status).toBe(200);
      expect(listRes.body.ok).toBe(true);
      const found = listRes.body.data.find((c: { id: string }) => c.id === call.id);
      expect(found).toBeDefined();
      expect(found.handled_at).toBeNull();

      // Resolve call
      const handleRes = await request(app)
        .post(`/api/kiosk/staff-calls/${call.id}/handle`)
        .set('Cookie', ['access_token=mock-token:admin-001:admin:active'])
        .set('X-Requested-With', 'XMLHttpRequest');

      expect(handleRes.status).toBe(200);
      expect(handleRes.body.ok).toBe(true);
    });
  });

  // =========================================================================
  // 4. Security & Safety Guards (Master Prompt v3 Section 6 & 11)
  // =========================================================================
  describe('4. Security, Bans & Hospital IP Safety Guard', () => {
    it('4.1 Admin can create and list bans', async () => {
      const banRes = await request(app)
        .post('/api/security/bans')
        .set('Cookie', ['access_token=mock-token:admin-001:admin:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          type: 'ip',
          value: '198.51.100.99',
          reason: 'Excessive brute force attack on admin portal',
        });

      expect(banRes.status).toBe(201);
      expect(banRes.body.ok).toBe(true);

      const listRes = await request(app)
        .get('/api/security/bans')
        .set('Cookie', ['access_token=mock-token:admin-001:admin:active']);

      expect(listRes.status).toBe(200);
      expect(listRes.body.ok).toBe(true);
      const found = listRes.body.data.find((b: { value: string }) => b.value === '198.51.100.99');
      expect(found).toBeDefined();
    });

    it('4.2 SPEC INVARIANT: Safety guard prevents banning hospital IP/NAT', async () => {
      const res = await request(app)
        .post('/api/security/bans')
        .set('Cookie', ['access_token=mock-token:admin-001:admin:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          type: 'ip',
          value: '10.0.0.1', // Inside HOSPITAL_IPS allowlist
          reason: 'Attempted ban of internal hospital router',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
      expect(res.body.error.code).toBe('CANNOT_BAN_HOSPITAL_IP');
    });

    it('4.3 Admin can trigger force logout on active staff session', async () => {
      const res = await request(app)
        .post('/api/security/force-logout/staff-user-123')
        .set('Cookie', ['access_token=mock-token:admin-001:admin:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ reason: 'Security compromise drill' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  // =========================================================================
  // 5. Frontend Clean Segregation & Zero Supabase Verification
  // =========================================================================
  describe('5. Clean Segregation & Zero Supabase Invariant', () => {
    it('5.1 apps/admin directory contains all 6 required director views', () => {
      const viewsDir = path.resolve(process.cwd(), 'apps/admin/src/views');
      const views = fs.readdirSync(viewsDir);

      expect(views).toContain('StaffView.tsx');
      expect(views).toContain('PatientsView.tsx');
      expect(views).toContain('PtsView.tsx');
      expect(views).toContain('LibraryView.tsx');
      expect(views).toContain('ScheduleView.tsx');
      expect(views).toContain('SecurityView.tsx');
    });

    it('5.2 apps/admin source files have ZERO @supabase/supabase-js imports', () => {
      const adminSrcDir = path.resolve(process.cwd(), 'apps/admin/src');

      function scan(dir: string): void {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const e of entries) {
          const p = path.join(dir, e.name);
          if (e.isDirectory()) {
            scan(p);
          } else if (/\.(ts|tsx)$/.test(e.name)) {
            const content = fs.readFileSync(p, 'utf8');
            expect(content).not.toMatch(/from\s+['"]@supabase\/supabase-js['"]/);
            expect(content).not.toMatch(/createClient\(/);
          }
        }
      }

      scan(adminSrcDir);
    });

    it('5.3 packages/api-client has ZERO @supabase/supabase-js imports and uses HttpOnly cookies', () => {
      const apiClientFile = path.resolve(process.cwd(), 'packages/api-client/src/index.ts');
      const content = fs.readFileSync(apiClientFile, 'utf8');

      expect(content).not.toMatch(/from\s+['"]@supabase\/supabase-js['"]/);
      expect(content).toContain("credentials: 'include'");
      expect(content).toContain("'X-Requested-With': 'XMLHttpRequest'");
    });
  });
});
