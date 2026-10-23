import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { audit } from '../modules/audit';
import { clearAllBans, addActiveBan, isIpBanned, isDeviceBanned } from '../middleware/banCheck';
import { resetAuthTestState } from '../middleware/authenticate';
import { hospitalEventBus, HospitalEvent } from '../modules/events/routes';

describe('[UNIT] DrTech.Care System 4: Audit & Security Complete Test Suite', () => {
  const app = createApp();

  beforeAll(() => {
    (process.env as Record<string, string>).NODE_ENV = 'test';
    process.env.SUPABASE_URL = 'https://mctegvnrvmglbibuuczi.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'sb_publishable_RIM7hit0_ZY0y5fBCK_Uuw_bEJY7H5I';
    process.env.FACE_T_ACCEPT = '0.60';
    process.env.FACE_T_REJECT = '0.45';
    process.env.FACE_T_MARGIN = '0.10';
    process.env.FACE_T_ENROLL_CONSISTENCY = '0.75';
    process.env.FACE_T_DUPLICATE = '0.85';
    process.env.FACE_CHALLENGE_EXPIRE_SECONDS = '60';
    process.env.HOSPITAL_IPS = '127.0.0.1,::1,localhost,10.0.0.1';
  });

  beforeEach(() => {
    clearAllBans();
    resetAuthTestState();
  });

  // =========================================================================
  // 1. Audit Helper & Realtime SSE Stream (Master Prompt v3 Section 10 - Line 305)
  // =========================================================================
  describe('1. Audit Helper & Sanitization', () => {
    it('1.1 should record audit entry with actor, action, and entity', async () => {
      const record = await audit.write({
        actor_type: 'staff',
        actor_id: 'a0000000-0000-0000-0000-000000000001',
        action: 'patient_created',
        entity: 'patients',
        entity_id: 'p-12345',
        ip: '192.168.1.50',
        device_id: 'dev-001',
        metadata: { hn: 'HN-123', notes: 'Initial intake' },
      });

      expect(record.id).toBeDefined();
      expect(record.action).toBe('patient_created');
      expect(record.entity).toBe('patients');
      expect(record.actor_id).toBe('a0000000-0000-0000-0000-000000000001');
      expect(record.ip).toBe('192.168.1.50');
      expect(record.created_at).toBeDefined();
    });

    it('1.2 should sanitize and redact sensitive metadata (passwords, tokens, embeddings)', async () => {
      const fake512Embedding = Array(512).fill(0.12345);

      const record = await audit.write({
        actor_type: 'staff',
        action: 'face_enrolled',
        entity: 'face_templates',
        entity_id: 'ft-999',
        metadata: {
          password: 'SecretPassword123!',
          access_token: 'jwt.token.secret',
          refresh_token: 'refresh.secret',
          probe: fake512Embedding,
          harmless_field: 'valid_meta',
        },
      });

      expect(record.metadata.password).toBe('[REDACTED]');
      expect(record.metadata.access_token).toBe('[REDACTED]');
      expect(record.metadata.refresh_token).toBe('[REDACTED]');
      expect(record.metadata.probe).toBe('[EMBEDDING_VECTOR_512_DIM_REDACTED]');
      expect(record.metadata.harmless_field).toBe('valid_meta');
    });

    it('1.3 should broadcast audit event to SSE event stream', async () => {
      let broadcastedEvent: HospitalEvent | null = null;
      const listener = (evt: HospitalEvent) => {
        if (evt.event === 'audit') {
          broadcastedEvent = evt;
        }
      };
      hospitalEventBus.on('hospital_event', listener);

      try {
        await audit.write({
          actor_type: 'system',
          action: 'security_alert',
          entity: 'auth',
          metadata: { reason: 'suspicious_activity' },
        });

        expect(broadcastedEvent).not.toBeNull();
        const received = broadcastedEvent as HospitalEvent | null;
        expect(received?.event).toBe('audit');
        const eventData = received?.data as { action: string };
        expect(eventData.action).toBe('security_alert');
      } finally {
        hospitalEventBus.off('hospital_event', listener);
      }
    });
  });

  // =========================================================================
  // 2. GET /api/audit (Master Prompt v3 Section 5 - Line 160 & Section 10 - Line 306)
  // =========================================================================
  describe('2. GET /api/audit Query & Role Protection', () => {
    it('2.1 should reject unauthenticated requests with 401 UNAUTHORIZED', async () => {
      const res = await request(app).get('/api/audit');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('2.2 should reject PT role requests with 403 FORBIDDEN (Admin only)', async () => {
      const res = await request(app)
        .get('/api/audit')
        .set('Cookie', ['access_token=mock-token:pt-001:pt:active']);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('2.3 should allow admin to query audit logs with pagination', async () => {
      // Seed some audit entries
      await audit.write({ actor_type: 'staff', action: 'test_action_1', entity: 'test_entity' });
      await audit.write({ actor_type: 'staff', action: 'test_action_2', entity: 'test_entity' });

      const res = await request(app)
        .get('/api/audit?page=1&limit=10')
        .set('Cookie', ['access_token=mock-token:admin-001:admin:active']);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.pagination).toBeDefined();
      expect(res.body.pagination.page).toBe(1);
      expect(res.body.pagination.limit).toBe(10);
      expect(res.body.pagination.total).toBeGreaterThanOrEqual(2);
    });

    it('2.4 should filter audit logs by action and entity', async () => {
      const uniqueAction = 'special_action_' + Date.now();
      await audit.write({ actor_type: 'staff', action: uniqueAction, entity: 'custom_entity' });

      const res = await request(app)
        .get(`/api/audit?action=${uniqueAction}&entity=custom_entity`)
        .set('Cookie', ['access_token=mock-token:admin-001:admin:active']);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].action).toBe(uniqueAction);
      expect(res.body.data[0].entity).toBe('custom_entity');
    });
  });

  // =========================================================================
  // 3. Force Logout (Master Prompt v3 Section 10 - Line 307)
  // =========================================================================
  describe('3. Force Logout & Immediate Revocation', () => {
    it('3.1 should reject non-admin from executing force-logout with 403', async () => {
      const res = await request(app)
        .post('/api/security/force-logout/target-user-001')
        .set('Cookie', ['access_token=mock-token:pt-001:pt:active'])
        .set('X-Requested-With', 'XMLHttpRequest');

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('3.2 should allow admin to force logout user and immediately reject subsequent requests with 401 SESSION_TERMINATED', async () => {
      const targetUserToken = 'mock-token:target-victim-001:pt:active';

      // 1. Target user can initially access /me
      const preCheck = await request(app)
        .get('/api/me')
        .set('Cookie', [`access_token=${targetUserToken}`]);
      expect(preCheck.status).toBe(200);

      // 2. Admin issues force-logout
      const adminLogoutRes = await request(app)
        .post('/api/security/force-logout/target-victim-001')
        .set('Cookie', ['access_token=mock-token:admin-001:admin:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ reason: 'Suspicious device detected' });

      expect(adminLogoutRes.status).toBe(200);
      expect(adminLogoutRes.body.ok).toBe(true);

      // 3. Target user makes request with prior token: MUST get 401 SESSION_TERMINATED immediately
      const postCheck = await request(app)
        .get('/api/me')
        .set('Cookie', [`access_token=${targetUserToken}`]);

      expect(postCheck.status).toBe(401);
      expect(postCheck.body.error.code).toBe('SESSION_TERMINATED');
    });

    it('3.3 should record audit log entry for force-logout action', async () => {
      await request(app)
        .post('/api/security/force-logout/target-audit-001')
        .set('Cookie', ['access_token=mock-token:admin-001:admin:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ reason: 'Compromised credential' });

      const queryRes = await request(app)
        .get('/api/audit?action=force_logout')
        .set('Cookie', ['access_token=mock-token:admin-001:admin:active']);

      expect(queryRes.status).toBe(200);
      const matches = queryRes.body.data.filter(
        (log: { entity_id: string }) => log.entity_id === 'target-audit-001'
      );
      expect(matches.length).toBeGreaterThanOrEqual(1);
      expect(matches[0].action).toBe('force_logout');
      expect(matches[0].metadata.reason).toBe('Compromised credential');
    });
  });

  // =========================================================================
  // 4. Bans Management & Allowlist Protection (Master Prompt v3 Section 10 - Line 308)
  // =========================================================================
  describe('4. Bans Management, Allowlist & banCheck Enforcement', () => {
    it('4.1 should reject banning hospital allowlist IPs with 400 CANNOT_BAN_HOSPITAL_IP', async () => {
      // Trying to ban 127.0.0.1 or localhost or 10.0.0.1 from HOSPITAL_IPS
      const res = await request(app)
        .post('/api/security/bans')
        .set('Cookie', ['access_token=mock-token:admin-001:admin:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          type: 'ip',
          value: '127.0.0.1',
          reason: 'Test hospital ban attempt',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('CANNOT_BAN_HOSPITAL_IP');

      const resNat = await request(app)
        .post('/api/security/bans')
        .set('Cookie', ['access_token=mock-token:admin-001:admin:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          type: 'ip',
          value: '10.0.0.1',
          reason: 'NAT IP ban attempt',
        });

      expect(resNat.status).toBe(400);
      expect(resNat.body.error.code).toBe('CANNOT_BAN_HOSPITAL_IP');
    });

    it('4.2 should reject admin self-ban attempts (own account or own device)', async () => {
      // 1. Self account ban attempt
      const resAcc = await request(app)
        .post('/api/security/bans')
        .set('Cookie', ['access_token=mock-token:admin-001:admin:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          type: 'account',
          value: 'admin-001',
          reason: 'Self ban attempt',
        });

      expect(resAcc.status).toBe(400);
      expect(resAcc.body.error.code).toBe('CANNOT_BAN_SELF');

      // 2. Self device ban attempt
      const resDev = await request(app)
        .post('/api/security/bans')
        .set('Cookie', [
          'access_token=mock-token:admin-001:admin:active',
          'staff_device_id=my-admin-device-uuid',
        ])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          type: 'device',
          value: 'my-admin-device-uuid',
          reason: 'Self device ban attempt',
        });

      expect(resDev.status).toBe(400);
      expect(resDev.body.error.code).toBe('CANNOT_BAN_SELF');
    });

    it('4.3 should allow admin to create IP, device, and account bans (201 Created)', async () => {
      const res = await request(app)
        .post('/api/security/bans')
        .set('Cookie', ['access_token=mock-token:admin-001:admin:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          type: 'ip',
          value: '198.51.100.25',
          reason: 'Malicious scanner',
          expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
        });

      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.type).toBe('ip');
      expect(res.body.data.value).toBe('198.51.100.25');

      // Verify active in memory cache
      expect(isIpBanned('198.51.100.25')).toBe(true);
    });

    it('4.4 should block requests from banned IP address with 403 ACCESS_DENIED', async () => {
      addActiveBan('ip', '203.0.113.99');

      // Supertest with client IP simulation
      const res = await request(app)
        .get('/api/health')
        .set('X-Forwarded-For', '203.0.113.99');

      // Since app has trust proxy enabled
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('ACCESS_DENIED');
    });

    it('4.5 should block requests with banned staff_device_id cookie with 403 ACCESS_DENIED', async () => {
      const bannedDeviceId = 'banned-stolen-tablet-device-id';
      addActiveBan('device', bannedDeviceId);

      expect(isDeviceBanned(bannedDeviceId)).toBe(true);

      const res = await request(app)
        .get('/api/health')
        .set('Cookie', [`staff_device_id=${bannedDeviceId}`]);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('ACCESS_DENIED');
    });

    it('4.6 should NOT block requests when ban has expired (automatic expiration)', async () => {
      const expiredIp = '198.51.100.77';
      const pastTime = new Date(Date.now() - 60 * 1000).toISOString(); // 1 minute in past

      addActiveBan('ip', expiredIp, pastTime);

      // In-memory check should detect expiration and clear it
      expect(isIpBanned(expiredIp)).toBe(false);

      const res = await request(app)
        .get('/api/health')
        .set('X-Forwarded-For', expiredIp);

      expect(res.status).toBe(200);
    });

    it('4.7 should allow admin to revoke ban and restore immediate access', async () => {
      // 1. Create ban
      const createRes = await request(app)
        .post('/api/security/bans')
        .set('Cookie', ['access_token=mock-token:admin-001:admin:active'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          type: 'ip',
          value: '198.51.100.88',
          reason: 'Temporary quarantine',
        });

      const banId = createRes.body.data.id;
      expect(isIpBanned('198.51.100.88')).toBe(true);

      // 2. Revoke ban
      const deleteRes = await request(app)
        .delete(`/api/security/bans/${banId}`)
        .set('Cookie', ['access_token=mock-token:admin-001:admin:active'])
        .set('X-Requested-With', 'XMLHttpRequest');

      expect(deleteRes.status).toBe(200);
      expect(deleteRes.body.ok).toBe(true);

      // 3. Verify IP is no longer banned
      expect(isIpBanned('198.51.100.88')).toBe(false);

      const healthRes = await request(app)
        .get('/api/health')
        .set('X-Forwarded-For', '198.51.100.88');

      expect(healthRes.status).toBe(200);
    });
  });
});
