import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { resetAllFakeRepositories } from './fixtures/fakeRepositories';
import { resetAuthTestState } from '../middleware/authenticate';
import { createStatelessToken } from '../lib/auth/token';

describe('[VERIFICATION] Production Auth, PT Directory & Patient Creation Flow', () => {
  const app = createApp();
  let directorBearerToken: string;

  beforeAll(() => {
    (process.env as Record<string, string>).NODE_ENV = 'test';
    process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
    process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_RIM7hit0_ZY0y5fBCK_Uuw_bEJY7H5I';
    process.env.INTERNAL_EMAIL_DOMAIN = 'drtech.care';

    // Generate valid stateless HMAC token for director (Admin role)
    directorBearerToken = createStatelessToken({
      id: 'd1000000-0000-0000-0000-000000000001',
      username: 'director',
      role: 'admin',
      full_name: 'ผอ. นพ. บริรักษ์ เวชกิจ',
      status: 'active',
    });
  });

  beforeEach(() => {
    resetAllFakeRepositories();
    resetAuthTestState();
  });

  // -------------------------------------------------------------------------
  // Test A: GET /api/directory/pts
  // -------------------------------------------------------------------------
  describe('Test A: GET /api/directory/pts', () => {
    it('should return 200 OK with at least 1 active PT and never 401 Authentication required', async () => {
      // 1. Without token (public directory / kiosk access)
      const resPublic = await request(app)
        .get('/api/directory/pts')
        .set('X-Requested-With', 'XMLHttpRequest');

      expect(resPublic.status).toBe(200);
      expect(resPublic.body.ok).toBe(true);
      expect(Array.isArray(resPublic.body.data)).toBe(true);
      expect(resPublic.body.data.length).toBeGreaterThanOrEqual(1);

      // 2. With Bearer token from logged-in director
      const resBearer = await request(app)
        .get('/api/directory/pts')
        .set('Authorization', `Bearer ${directorBearerToken}`)
        .set('X-Requested-With', 'XMLHttpRequest');

      expect(resBearer.status).toBe(200);
      expect(resBearer.body.ok).toBe(true);
      expect(Array.isArray(resBearer.body.data)).toBe(true);
      expect(resBearer.body.data.length).toBeGreaterThanOrEqual(1);
    });

    it('should return active PTs via /api/pts endpoint as well', async () => {
      const res = await request(app)
        .get('/api/pts')
        .set('X-Requested-With', 'XMLHttpRequest');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });
  });

  // -------------------------------------------------------------------------
  // Test B: POST /api/patients & GET /api/patients
  // -------------------------------------------------------------------------
  describe('Test B: POST /api/patients & GET /api/patients', () => {
    it('should create patient with Bearer token without 401 and appear in GET /api/patients', async () => {
      // First get active PT id for assignment
      const ptsRes = await request(app)
        .get('/api/directory/pts')
        .set('Authorization', `Bearer ${directorBearerToken}`)
        .set('X-Requested-With', 'XMLHttpRequest');
      const ptId = ptsRes.body.data[0]?.id || 'b1000000-0000-0000-0000-000000000003';

      const uniqueSuffix = Date.now().toString().slice(-4);
      const testFirstName = `สมชาย_${uniqueSuffix}`;
      const testLastName = `มั่งมี_${uniqueSuffix}`;

      // Simulate clicking "บันทึกคนไข้" in registration modal
      const createRes = await request(app)
        .post('/api/patients')
        .set('Authorization', `Bearer ${directorBearerToken}`)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          first_name: testFirstName,
          last_name: testLastName,
          age: 45,
          sex: 'male',
          phone: '0812345678',
          injury: 'อาการปวดหลังส่วนล่างเรื้อรัง (LBP)',
          responsible_pt_id: ptId,
        });

      expect(createRes.status).toBe(201);
      expect(createRes.body.ok).toBe(true);
      expect(createRes.body.data).toBeDefined();
      expect(createRes.body.data.first_name).toBe(testFirstName);
      expect(createRes.body.data.last_name).toBe(testLastName);
      expect(createRes.body.data.hn).toBeDefined();

      const createdPatientId = createRes.body.data.id;

      // Query GET /api/patients to verify newly created patient is in list
      const listRes = await request(app)
        .get('/api/patients')
        .set('Authorization', `Bearer ${directorBearerToken}`)
        .set('X-Requested-With', 'XMLHttpRequest');

      expect(listRes.status).toBe(200);
      expect(listRes.body.ok).toBe(true);
      const patients = listRes.body.data || listRes.body.patients || [];
      expect(Array.isArray(patients)).toBe(true);
      const found = patients.find((p: any) => p.id === createdPatientId || p.first_name === testFirstName);
      expect(found).toBeDefined();
      expect(found.first_name).toBe(testFirstName);
    });

    it('should allow internal portal requests with x-staff-role header without throwing 401', async () => {
      const res = await request(app)
        .get('/api/patients')
        .set('x-staff-role', 'admin')
        .set('x-actor-id', 'd1000000-0000-0000-0000-000000000001')
        .set('X-Requested-With', 'XMLHttpRequest')
        .set('Referer', 'https://drtechcarev2.vercel.app/admin');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Test C: POST /api/staff & GET /api/staff & GET /api/directory/pts
  // -------------------------------------------------------------------------
  describe('Test C: POST /api/staff creating PT', () => {
    it('should create new PT and immediately show up in GET /api/staff and GET /api/directory/pts', async () => {
      const uniqueUsername = `pt_new_${Date.now().toString().slice(-5)}`;
      const uniqueName = `กภ. วิลาวรรณ ทดสอบ_${Date.now().toString().slice(-4)}`;

      // 1. Create PT via POST /api/staff
      const createStaffRes = await request(app)
        .post('/api/staff')
        .set('Authorization', `Bearer ${directorBearerToken}`)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          username: uniqueUsername,
          password: 'Password12345!',
          role: 'pt',
          full_name: uniqueName,
          phone: '082-345-6789',
          license_no: 'กภ.55443',
          specialty: 'เวชศาสตร์ฟื้นฟูกายภาพบำบัด',
          age: 34,
          sex: 'female',
        });

      expect(createStaffRes.status).toBe(201);
      expect(createStaffRes.body.ok).toBe(true);
      expect(createStaffRes.body.data.username).toBe(uniqueUsername);
      expect(createStaffRes.body.data.role).toBe('pt');

      // 2. Verify in GET /api/staff
      const staffListRes = await request(app)
        .get('/api/staff')
        .set('Authorization', `Bearer ${directorBearerToken}`)
        .set('X-Requested-With', 'XMLHttpRequest');

      expect(staffListRes.status).toBe(200);
      const staffMembers = staffListRes.body.data || [];
      const foundInStaff = staffMembers.find((s: any) => s.username === uniqueUsername);
      expect(foundInStaff).toBeDefined();
      expect(foundInStaff.full_name).toBe(uniqueName);

      // 3. Verify in GET /api/directory/pts
      const dirListRes = await request(app)
        .get('/api/directory/pts')
        .set('Authorization', `Bearer ${directorBearerToken}`)
        .set('X-Requested-With', 'XMLHttpRequest');

      expect(dirListRes.status).toBe(200);
      const pts = dirListRes.body.data || [];
      const foundInDirectory = pts.find((p: any) => p.username === uniqueUsername || p.full_name === uniqueName);
      expect(foundInDirectory).toBeDefined();

      // 4. Delete the PT via DELETE /api/staff/:id
      const ptId = createStaffRes.body.data.id;
      const deleteRes = await request(app)
        .delete(`/api/staff/${ptId}`)
        .set('Authorization', `Bearer ${directorBearerToken}`)
        .set('X-Requested-With', 'XMLHttpRequest');

      expect(deleteRes.status).toBe(200);
      expect(deleteRes.body.ok).toBe(true);

      // 5. Verify the PT is now deleted from GET /api/staff
      const afterDeleteStaffRes = await request(app)
        .get('/api/staff')
        .set('Authorization', `Bearer ${directorBearerToken}`)
        .set('X-Requested-With', 'XMLHttpRequest');

      expect(afterDeleteStaffRes.status).toBe(200);
      const staffAfter = afterDeleteStaffRes.body.data || [];
      expect(staffAfter.find((s: any) => s.id === ptId)).toBeUndefined();
    });

    it('should reject deleting director or self with 400', async () => {
      // Trying to delete director
      const deleteDirectorRes = await request(app)
        .delete('/api/staff/d1000000-0000-0000-0000-000000000001')
        .set('Authorization', `Bearer ${directorBearerToken}`)
        .set('X-Requested-With', 'XMLHttpRequest');

      expect(deleteDirectorRes.status).toBe(400);
    });
  });
});

