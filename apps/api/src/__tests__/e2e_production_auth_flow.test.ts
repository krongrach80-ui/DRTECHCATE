import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { activateLocalPersistenceEngine } from '../lib/localStorage/localPersistenceEngine';
import { verifyStatelessToken, createStatelessToken } from '../lib/auth/token';

describe('Production E2E Flow: Stateless Authentication, Staff Creation, and Patient Registration', () => {
  let app: any;
  let adminToken: string;
  let createdPtToken: string;
  const dynamicPtUsername = `pt_prod_${Date.now().toString(36)}`;

  beforeAll(async () => {
    // Activate local persistence engine (as runs on Vercel Serverless / production fallback)
    activateLocalPersistenceEngine();
    app = createApp();
  });

  it('1. Rejects unauthenticated request with 401 "Authentication required"', async () => {
    const res = await request(app)
      .post('/api/staff')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        username: 'pt_unauth',
        password: 'Password123!',
        role: 'pt',
        full_name: 'Unauthenticated Test',
      });

    expect(res.status).toBe(401);
    expect(res.body.error?.message || res.body.message).toContain('Authentication required');
  });

  it('2. Admin logs in with real credentials and receives a Stateless Signed Token in body', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        username: 'admin',
        password: 'Admin12345678!',
      });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.role).toBe('admin');

    // Token must be present in response
    const token = res.body.token || res.body.accessToken || res.body.access_token;
    expect(token).toBeDefined();
    expect(typeof token).toBe('string');
    expect(token.split('.').length).toBe(3); // Valid 3-part JWT

    adminToken = token;

    // Verify token statelessly
    const decoded = verifyStatelessToken(adminToken);
    expect(decoded).not.toBeNull();
    expect(decoded?.role).toBe('admin');
  });

  it('3. Admin creates a new PT staff (3-Step Wizard Flow) using Authorization Bearer token without 401', async () => {
    const newPtData = {
      username: dynamicPtUsername,
      password: 'PtStrongPassword123!',
      role: 'pt',
      full_name: 'กภ. ธนกฤต วิทยาการ',
      phone: '089-777-6655',
      bio: 'นักกายภาพบำบัดผู้เชี่ยวชาญการฟื้นฟูหลังผ่าตัด',
      license_no: 'กภ.99881',
      license_expiry: '2029-12-31',
      specialty: 'เวชศาสตร์ฟื้นฟูกระดูกและข้อ (Orthopedics)',
    };

    const res = await request(app)
      .post('/api/staff')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Requested-With', 'XMLHttpRequest')
      .send(newPtData);

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.username).toBe(dynamicPtUsername);
    expect(res.body.data.role).toBe('pt');
    expect(res.body.data.full_name).toBe('กภ. ธนกฤต วิทยาการ');
  });

  it('4. Admin creates a new patient record using Authorization Bearer token', async () => {
    const patientData = {
      first_name: 'ประสิทธิ์',
      last_name: 'เจริญผล',
      age: 58,
      sex: 'male',
      phone: '081-333-4455',
      injury: 'เอ็นข้อศอกอักเสบเรื้อรัง (Tennis Elbow)',
    };

    const res = await request(app)
      .post('/api/patients')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Requested-With', 'XMLHttpRequest')
      .send(patientData);

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.first_name).toBe('ประสิทธิ์');
    expect(res.body.data.last_name).toBe('เจริญผล');
    expect(res.body.data.hn).toBeDefined();
  });

  it('5. Newly created PT can immediately log in and receive PT Stateless Token', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        username: dynamicPtUsername,
        password: 'PtStrongPassword123!',
      });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.user.role).toBe('pt');
    expect(res.body.user.full_name).toBe('กภ. ธนกฤต วิทยาการ');

    const ptToken = res.body.token || res.body.accessToken || res.body.access_token;
    expect(ptToken).toBeDefined();
    createdPtToken = ptToken;

    const decoded = verifyStatelessToken(createdPtToken);
    expect(decoded).not.toBeNull();
    expect(decoded?.role).toBe('pt');
  });

  it('6. PT token is restricted from admin staff creation endpoint (403 Forbidden, not 401)', async () => {
    const res = await request(app)
      .post('/api/staff')
      .set('Authorization', `Bearer ${createdPtToken}`)
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        username: 'pt_hacker',
        password: 'Password123!',
        role: 'pt',
        full_name: 'Hacker',
      });

    expect(res.status).toBe(403);
  });

  it('7. Cold start resilience: Stateless token verifies independently without in-memory state', () => {
    const standaloneToken = createStatelessToken({
      id: 'cold-start-user-uuid',
      role: 'admin',
      full_name: 'Cold Start Admin',
      status: 'active',
    });

    // Verification requires zero in-memory maps, pure cryptographic HMAC signature
    const verified = verifyStatelessToken(standaloneToken);
    expect(verified).not.toBeNull();
    expect(verified?.id).toBe('cold-start-user-uuid');
    expect(verified?.role).toBe('admin');
    expect(verified?.full_name).toBe('Cold Start Admin');
  });
});
