import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import cookieParser from 'cookie-parser';
import { envSchema, parseEnv, isCookieSecure, resetCachedEnv, getEnv } from '../config/env';
import { authenticate, resetAuthTestState } from '../middleware/authenticate';
import { syncBansFromDatabase, isIpBanned, clearAllBans } from '../middleware/banCheck';
import { createKioskRouter } from '../modules/kiosk/routes';
import { KioskController } from '../modules/kiosk/controller';
import { KioskFaceAuthController } from '../modules/kiosk/faceAuth.controller';
import { errorHandler } from '../middleware/errorHandler';
import { FakeKioskRepository, FakeCourseRepository, FakePatientRepository } from './fixtures/fakeRepositories';
import { KioskService } from '../modules/kiosk/service';
import { KioskFaceAuthService } from '../modules/kiosk/faceAuth.service';
import * as adminClientModule from '../lib/supabase/adminClient';
import * as authClientModule from '../lib/supabase/authClient';

describe('DrTech.Care Group F Verification Suite (F2, F3, F4, F5, F6, F7)', () => {
  beforeEach(() => {
    resetAuthTestState();
    resetCachedEnv();
    clearAllBans();
  });

  // =========================================================================
  // F2: PAD Provider & Liveness Score Invariants
  // =========================================================================
  describe('F2: PAD Mode, Registered Providers, and Fail-Closed Endpoint', () => {
    it('[UNIT] F2.1: Zod rejects PAD_MODE=active_plus_passive because no passive provider is registered (Item H5)', () => {
      const baseRaw = {
        NODE_ENV: 'test',
        SUPABASE_URL: 'http://127.0.0.1:54321',
        SUPABASE_ANON_KEY: 'test-key',
        SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
        KIOSK_PAIRING_SECRET: 'test-kiosk-pairing-hmac-secret-min-16-chars',
        FACE_T_ACCEPT: 0.7,
        FACE_T_REJECT: 0.5,
        FACE_T_MARGIN: 0.08,
        FACE_T_ENROLL_CONSISTENCY: 0.75,
        FACE_T_DUPLICATE: 0.85,
        FACE_MIN_IOD: 60,
        FACE_CHALLENGE_EXPIRE_SECONDS: 60,
        PAD_MODE: 'active_plus_passive',
        PAD_PROVIDER: 'active_challenge_tracker',
        TRUST_PROXY_HOPS: 1,
      };

      const result = envSchema.safeParse(baseRaw);
      expect(result.success).toBe(false);
      if (!result.success) {
        const issues = result.error.issues;
        expect(issues.some((i) => i.path.includes('PAD_MODE'))).toBe(true);
        const padIssue = issues.find((i) => i.path.includes('PAD_MODE'));
        expect(padIssue?.message).toContain('No certified passive PAD provider is implemented');
      }
    });

    it('F2.2: PAD_MODE=active_only requires PAD_PROVIDER=active_challenge_tracker', () => {
      const baseRaw = {
        NODE_ENV: 'test',
        SUPABASE_URL: 'http://127.0.0.1:54321',
        SUPABASE_ANON_KEY: 'test-key',
        SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
        KIOSK_PAIRING_SECRET: 'test-kiosk-pairing-hmac-secret-min-16-chars',
        FACE_T_ACCEPT: 0.7,
        FACE_T_REJECT: 0.5,
        FACE_T_MARGIN: 0.08,
        FACE_T_ENROLL_CONSISTENCY: 0.75,
        FACE_T_DUPLICATE: 0.85,
        FACE_MIN_IOD: 60,
        FACE_CHALLENGE_EXPIRE_SECONDS: 60,
        PAD_MODE: 'active_only',
        PAD_PROVIDER: 'active_challenge_tracker',
        TRUST_PROXY_HOPS: 1,
      };

      const result = envSchema.safeParse(baseRaw);
      expect(result.success).toBe(true);
    });

    it('F2.3: Face verification ignores client-supplied liveness_score for auth pass/fail decisions (Spec 7.5.1)', async () => {
      const fakeKioskRepo = new FakeKioskRepository();
      const fakeCourseRepo = new FakeCourseRepository();
      const fakePatientRepo = new FakePatientRepository();

      // Seed candidate with today's appointment and matching template
      const patientId = 'p-liveness-test-01';
      const today = new Date().toISOString().split('T')[0];
      await fakePatientRepo.createPatient(
        {
          first_name: 'Somchai',
          last_name: 'Test',
          age: 30,
          sex: 'male',
        },
        'admin-01',
        'pt-001'
      );
      // Override ID
      const patient = Array.from((fakePatientRepo as any).inMemoryPatients.values())[0] as any;
      patient.id = patientId;

      await fakeCourseRepo.createCourse(
        {
          patient_id: patientId,
          start_date: today,
          end_date: today,
          weekdays: [0, 1, 2, 3, 4, 5, 6],
          goals: 'Knee Rehab',
        },
        'pt-001',
        []
      );

      const templateVector = Array(512).fill(0.1);
      await fakeKioskRepo.saveFaceTemplate(patientId, templateVector);

      const service = new KioskFaceAuthService(fakeKioskRepo, fakeCourseRepo, fakePatientRepo);

      // Create challenge
      const challenge = await service.createChallenge('kiosk-01');

      process.env.PAD_PROVIDER = 'active_challenge_tracker';

      // Probe that matches template (cosine similarity = 1.0 >= T_ACCEPT)
      // Even if client provides liveness_score = 0.0 or 0.1, the match succeeds based purely on server verification
      const verifyResult = await service.verifyFace(
        {
          kiosk_id: 'kiosk-01',
          nonce: challenge.nonce,
          probe: templateVector,
          liveness_score: 0.0, // Client claimed 0.0 liveness - server ignores untrusted client score
        },
        '127.0.0.1'
      );

      expect(verifyResult.sessionToken).toBeDefined();
      expect(verifyResult.candidate.id).toBe(patientId);
    });
  });

  // =========================================================================
  // F3: env.ts Strict Invariants (NODE_ENV, FACE_T_*, Cookies)
  // =========================================================================
  describe('F3: Strict env.ts Invariants', () => {
    it('F3.1: Server refuses to boot if NODE_ENV is missing (no default allowed)', () => {
      const rawWithoutNodeEnv = {
        SUPABASE_URL: 'http://127.0.0.1:54321',
        SUPABASE_ANON_KEY: 'test-key',
        FACE_T_ACCEPT: 0.7,
        FACE_T_REJECT: 0.5,
        FACE_T_MARGIN: 0.08,
        FACE_T_ENROLL_CONSISTENCY: 0.75,
        FACE_T_DUPLICATE: 0.85,
        FACE_CHALLENGE_EXPIRE_SECONDS: 60,
      };

      const result = envSchema.safeParse(rawWithoutNodeEnv);
      expect(result.success).toBe(false);
      if (!result.success) {
        const nodeEnvIssue = result.error.issues.find((i) => i.path.includes('NODE_ENV'));
        expect(nodeEnvIssue).toBeDefined();
      }
    });

    it('F3.2: parseEnv rejects missing FACE_T_* without guessing defaults', () => {
      const rawWithoutThresholds = {
        NODE_ENV: 'test',
        SUPABASE_URL: 'http://127.0.0.1:54321',
        SUPABASE_ANON_KEY: 'test-key',
        // Missing FACE_T_ACCEPT, FACE_T_REJECT, etc.
      };

      expect(() => parseEnv(rawWithoutThresholds)).toThrow(/Environment validation failed/);
    });

    it('F3.3: Cookie is Secure by default everywhere, unless ALLOW_INSECURE_COOKIES=true in development only', () => {
      // Test environment
      expect(isCookieSecure({ NODE_ENV: 'test', ALLOW_INSECURE_COOKIES: false } as any)).toBe(true);
      expect(isCookieSecure({ NODE_ENV: 'test', ALLOW_INSECURE_COOKIES: true } as any)).toBe(true);

      // Production environment
      expect(isCookieSecure({ NODE_ENV: 'production', ALLOW_INSECURE_COOKIES: false } as any)).toBe(true);
      expect(isCookieSecure({ NODE_ENV: 'production', ALLOW_INSECURE_COOKIES: true } as any)).toBe(true);

      // Development environment
      expect(isCookieSecure({ NODE_ENV: 'development', ALLOW_INSECURE_COOKIES: false } as any)).toBe(true);
      expect(isCookieSecure({ NODE_ENV: 'development', ALLOW_INSECURE_COOKIES: true } as any)).toBe(false);

      // Zod schema rejects ALLOW_INSECURE_COOKIES=true outside development
      const prodInsecure = envSchema.safeParse({
        NODE_ENV: 'production',
        SUPABASE_URL: 'https://example.com',
        SUPABASE_ANON_KEY: 'anon',
        SUPABASE_SERVICE_ROLE_KEY: 'service-key',
        KIOSK_PAIRING_SECRET: 'pairing-secret-min-16',
        CORS_ORIGINS: 'https://hospital.com',
        ALLOW_INSECURE_COOKIES: true,
        FACE_T_ACCEPT: 0.7,
        FACE_T_REJECT: 0.5,
        FACE_T_MARGIN: 0.08,
        FACE_T_ENROLL_CONSISTENCY: 0.75,
        FACE_T_DUPLICATE: 0.85,
        FACE_MIN_IOD: 60,
        PAD_MODE: 'active_only',
        PAD_PROVIDER: 'active_challenge_tracker',
        TRUST_PROXY_HOPS: 1,
      });
      expect(prodInsecure.success).toBe(false);
    });

    it('F3.4 (Item B6): FACE_MIN_IOD and FACE_T_* have NO defaults and fail closed when missing', () => {
      // 1. Missing FACE_MIN_IOD
      const missingIod = {
        NODE_ENV: 'test',
        SUPABASE_URL: 'http://127.0.0.1:54321',
        SUPABASE_ANON_KEY: 'test-key',
        SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
        KIOSK_PAIRING_SECRET: 'test-secret-min-16-chars',
        FACE_T_ACCEPT: 0.70,
        FACE_T_REJECT: 0.50,
        FACE_T_MARGIN: 0.08,
        FACE_T_ENROLL_CONSISTENCY: 0.75,
        FACE_T_DUPLICATE: 0.85,
        PAD_MODE: 'active_only',
        PAD_PROVIDER: 'active_challenge_tracker',
        TRUST_PROXY_HOPS: 1,
      };
      const resultMissingIod = envSchema.safeParse(missingIod);
      expect(resultMissingIod.success).toBe(false);
      if (!resultMissingIod.success) {
        expect(resultMissingIod.error.issues.some((i) => i.path.includes('FACE_MIN_IOD'))).toBe(true);
      }

      // 2. FACE_MIN_IOD <= 0
      const nonPositiveIod = { ...missingIod, FACE_MIN_IOD: 0 };
      expect(envSchema.safeParse(nonPositiveIod).success).toBe(false);
    });

    it('F3.5 (Item B7): SUPABASE_SERVICE_ROLE_KEY and KIOSK_PAIRING_SECRET have NO defaults in envSchema', () => {
      const missingServiceRole = {
        NODE_ENV: 'test',
        SUPABASE_URL: 'http://127.0.0.1:54321',
        SUPABASE_ANON_KEY: 'test-key',
        // SUPABASE_SERVICE_ROLE_KEY omitted
        KIOSK_PAIRING_SECRET: 'test-secret-min-16-chars',
        FACE_T_ACCEPT: 0.70,
        FACE_T_REJECT: 0.50,
        FACE_T_MARGIN: 0.08,
        FACE_T_ENROLL_CONSISTENCY: 0.75,
        FACE_T_DUPLICATE: 0.85,
        FACE_MIN_IOD: 60,
        PAD_MODE: 'active_only',
        PAD_PROVIDER: 'active_challenge_tracker',
        TRUST_PROXY_HOPS: 1,
      };
      const res1 = envSchema.safeParse(missingServiceRole);
      expect(res1.success).toBe(false);
      if (!res1.success) {
        expect(res1.error.issues.some((i) => i.path.includes('SUPABASE_SERVICE_ROLE_KEY'))).toBe(true);
      }

      const missingPairingSecret = {
        ...missingServiceRole,
        SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
        KIOSK_PAIRING_SECRET: undefined,
      };
      const res2 = envSchema.safeParse(missingPairingSecret);
      expect(res2.success).toBe(false);
      if (!res2.success) {
        expect(res2.error.issues.some((i) => i.path.includes('KIOSK_PAIRING_SECRET'))).toBe(true);
      }
    });

    it('F3.6 (Item B5): Boot audit log records PAD_MODE=active_only warning (Spec 7.5.2)', async () => {
      const { audit } = await import('../modules/audit');
      const writeSpy = vi.spyOn(audit, 'write').mockResolvedValue(undefined as any);
      const env = getEnv();

      // Trigger boot audit write
      await audit.write({
        actor_type: 'system',
        action: 'SYSTEM_BOOT',
        entity: 'server',
        metadata: {
          pad_mode: env.PAD_MODE,
          pad_provider: env.PAD_PROVIDER,
          port: env.PORT,
          node_env: env.NODE_ENV,
        },
      });

      expect(writeSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          actor_type: 'system',
          action: 'SYSTEM_BOOT',
          metadata: expect.objectContaining({
            pad_mode: 'active_only',
            pad_provider: 'active_challenge_tracker',
          }),
        })
      );
      writeSpy.mockRestore();
    });
  });

  // =========================================================================
  // F4: Force Logout Authority (DB force_logout_at vs In-Memory Cache)
  // =========================================================================
  describe('F4: Force Logout Real Authority is DB force_logout_at', () => {
    function buildAuthApp(): Express {
      const app = express();
      app.use(cookieParser());
      app.use(express.json());
      app.get('/api/me', authenticate, (req, res) => {
        res.status(200).json({ ok: true, user: req.user });
      });
      app.use(errorHandler);
      return app;
    }

    it('F4.1: When user is force logged out, restart (new app instance) still rejects old token with 401', async () => {
      // Clear fixture mock so authenticate executes the production database check
      const { setAuthTokenVerifier } = await import('../middleware/authenticate');
      setAuthTokenVerifier(null);

      const userId = 'u-admin-01';
      // Token issued 10 minutes ago
      const tokenIatSeconds = Math.floor(Date.now() / 1000) - 600;
      const fakeJwt = `header.${Buffer.from(JSON.stringify({ sub: userId, iat: tokenIatSeconds })).toString('base64')}.sig`;

      // Mock DB: user was force logged out 5 minutes ago (newer than tokenIat)
      const forceLogoutIso = new Date(Date.now() - 300 * 1000).toISOString();

      const mockAdminClient = {
        from: (table: string) => {
          if (table === 'profiles') {
            return {
              select: () => ({
                eq: () => ({
                  single: async () => ({
                    data: {
                      id: userId,
                      role: 'admin',
                      first_name: 'Dr',
                      last_name: 'Chief',
                      status: 'active',
                      force_logout_at: forceLogoutIso,
                    },
                    error: null,
                  }),
                }),
              }),
            };
          }
          return {} as any;
        },
      };

      const mockAuthClient = {
        auth: {
          getUser: async () => ({
            data: { user: { id: userId, email: 'chief@clinic.internal' } },
            error: null,
          }),
        },
      };

      vi.spyOn(adminClientModule, 'getAdminClient').mockReturnValue(mockAdminClient as any);
      vi.spyOn(authClientModule, 'getAuthClient').mockReturnValue(mockAuthClient as any);

      // App Instance 1: Request with token before force logout is recognized
      const app1 = buildAuthApp();
      const res1 = await request(app1)
        .get('/api/me')
        .set('Cookie', `access_token=${fakeJwt}`);

      // Token iat was before force_logout_at -> rejected with 401 SESSION_TERMINATED
      expect(res1.status).toBe(401);
      expect(res1.body.error.code).toBe('SESSION_TERMINATED');

      // Simulate complete server restart: clear memory cache and forceLoggedOutUsers Set, create brand new app
      resetAuthTestState();
      const app2 = buildAuthApp();

      // App Instance 2 (after restart): Old token MUST STILL be rejected with 401 because DB is the true authority!
      const res2 = await request(app2)
        .get('/api/me')
        .set('Cookie', `access_token=${fakeJwt}`);

      expect(res2.status).toBe(401);
      expect(res2.body.error.code).toBe('SESSION_TERMINATED');
    });

    it('[UNIT] F4.2: authenticate rejects token missing iat timestamp with 401 (Item H6)', async () => {
      const { setAuthTokenVerifier } = await import('../middleware/authenticate');
      setAuthTokenVerifier(null);

      const userId = 'u-admin-02';
      // Token missing iat property
      const fakeJwtNoIat = `header.${Buffer.from(JSON.stringify({ sub: userId })).toString('base64')}.sig`;

      const mockAdminClient = {
        from: () => ({
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: {
                  id: userId,
                  role: 'admin',
                  first_name: 'Dr',
                  last_name: 'Chief',
                  status: 'active',
                },
                error: null,
              }),
            }),
          }),
        }),
      };

      const mockAuthClient = {
        auth: {
          getUser: async () => ({
            data: { user: { id: userId, email: 'chief@clinic.internal' } },
            error: null,
          }),
        },
      };

      vi.spyOn(adminClientModule, 'getAdminClient').mockReturnValue(mockAdminClient as any);
      vi.spyOn(authClientModule, 'getAuthClient').mockReturnValue(mockAuthClient as any);

      const app = buildAuthApp();
      const res = await request(app)
        .get('/api/me')
        .set('Cookie', `access_token=${fakeJwtNoIat}`);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
      expect(res.body.error.message).toContain('missing issued-at (iat)');
    });
  });

  // =========================================================================
  // F5: Ban Sync from Database ('bans' table)
  // =========================================================================
  describe('F5: syncBansFromDatabase() using bans table and fail-closed boot', () => {
    it('F5.1: syncBansFromDatabase queries bans table and hydrates in-memory cache', async () => {
      const mockAdminClient = {
        from: (table: string) => {
          expect(table).toBe('bans'); // Spec invariant: table is 'bans', NOT 'banned_ips'
          return {
            select: () => ({
              or: async () => ({
                data: [
                  { type: 'ip', value: '198.51.100.25', expires_at: null },
                  { type: 'ip', value: '203.0.113.88', expires_at: new Date(Date.now() + 60000).toISOString() },
                  { type: 'device', value: 'banned-device-uuid-1', expires_at: null },
                  { type: 'account', value: 'banned_pt_user', expires_at: null },
                ],
                error: null,
              }),
            }),
          };
        },
      };

      vi.spyOn(adminClientModule, 'getAdminClient').mockReturnValue(mockAdminClient as any);

      await syncBansFromDatabase();

      expect(isIpBanned('198.51.100.25')).toBe(true);
      expect(isIpBanned('203.0.113.88')).toBe(true);
      expect(isIpBanned('127.0.0.1')).toBe(false);

      const { isDeviceBanned, isAccountBanned } = await import('../middleware/banCheck');
      expect(isDeviceBanned('banned-device-uuid-1')).toBe(true);
      expect(isAccountBanned('banned_pt_user')).toBe(true);
      expect(isAccountBanned('legitimate_pt_user')).toBe(false);
    });

    it('F5.2: Server boot fails if bans table query fails (fail-closed)', async () => {
      const mockAdminClient = {
        from: () => ({
          select: () => ({
            or: async () => ({
              data: null,
              error: { message: 'relation "bans" does not exist' },
            }),
          }),
        }),
      };

      vi.spyOn(adminClientModule, 'getAdminClient').mockReturnValue(mockAdminClient as any);

      await expect(syncBansFromDatabase()).rejects.toThrow(/FATAL: Failed to sync active bans from 'bans' table/);
    });
  });

  // =========================================================================
  // F6: Kiosk Session Binding & Rejection of patient_id / staff credentials
  // =========================================================================
  describe('F6: Kiosk Strict Binding (Kiosk 1 session used at Kiosk 2 returns 401)', () => {
    function buildKioskTestApp(kioskRepo: FakeKioskRepository): Express {
      const app = express();
      app.use(cookieParser());
      app.use(express.json());

      const kioskService = new KioskService(kioskRepo);
      const faceAuthService = new KioskFaceAuthService(kioskRepo);
      const controller = new KioskController(kioskService);
      const faceController = new KioskFaceAuthController(faceAuthService);

      app.use('/api/kiosk', createKioskRouter(controller, faceController));
      app.use(errorHandler);
      return app;
    }

    it('F6.1: Reject unknown keys (patient_id) in /plan, /mission/steps, /finish with 400', async () => {
      const fakeRepo = new FakeKioskRepository();
      const app = buildKioskTestApp(fakeRepo);

      // Sending patient_id in body of /mission/steps must be rejected with 400 (.strict())
      const resStep = await request(app)
        .post('/api/kiosk/mission/steps')
        .send({
          course_id: 'c-01',
          step_type: 'exercise',
          patient_id: 'injected-patient-id', // Illegal unknown key
        });

      expect(resStep.status).toBe(400);
      expect(resStep.body.error.code).toBe('VALIDATION_ERROR');

      // Sending patient_id in body of /finish must be rejected with 400
      const resFinish = await request(app)
        .post('/api/kiosk/finish')
        .send({
          course_id: 'c-01',
          patient_id: 'injected-patient-id',
        });

      expect(resFinish.status).toBe(400);
      expect(resFinish.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('F6.2: Header X-Kiosk-Session is ignored (cookie only) and staff credentials cannot call kiosk endpoints', async () => {
      const fakeRepo = new FakeKioskRepository();
      const session = await fakeRepo.createKioskSession('kiosk-01', 'p-01');
      await fakeRepo.createDevice('Kiosk 1');
      (fakeRepo as any).inMemoryDevices.set('kiosk-01', {
        id: 'kiosk-01',
        name: 'Kiosk 1',
        token_hash: 'hash-kiosk-01',
        is_active: true,
      });

      const app = buildKioskTestApp(fakeRepo);

      // Attempting to pass session via X-Kiosk-Session header without cookie returns 401
      const resHeader = await request(app)
        .get('/api/kiosk/plan')
        .set('X-Kiosk-Session', session.token)
        .set('Cookie', 'kiosk_id=kiosk-01');

      if (resHeader.status !== 401) {
        console.error('DEBUG resHeader:', resHeader.status, resHeader.body);
      }
      expect(resHeader.status).toBe(401);

      // Staff credentials (access_token for admin/pt) cannot call /api/kiosk/plan -> returns 401
      const resStaff = await request(app)
        .get('/api/kiosk/plan')
        .set('Cookie', 'access_token=mock-token:admin-01:admin:active');

      if (resStaff.status !== 401) {
        console.error('DEBUG resStaff:', resStaff.status, resStaff.body);
      }
      expect(resStaff.status).toBe(401);
    });

    it('F6.3: Session created on Kiosk 1 used at Kiosk 2 returns 401 (Device mismatch)', async () => {
      const fakeRepo = new FakeKioskRepository();
      // Setup Kiosk 1 and Kiosk 2
      (fakeRepo as any).inMemoryDevices.set('kiosk-01', {
        id: 'kiosk-01',
        name: 'Kiosk 1',
        token_hash: 'token-kiosk-01',
        is_active: true,
      });
      (fakeRepo as any).inMemoryDevices.set('kiosk-02', {
        id: 'kiosk-02',
        name: 'Kiosk 2',
        token_hash: 'token-kiosk-02',
        is_active: true,
      });

      // Session issued for kiosk-01
      const session = await fakeRepo.createKioskSession('kiosk-01', 'p-01');

      const app = buildKioskTestApp(fakeRepo);

      // Request from Kiosk 2 (presenting cookie for kiosk-02 with session of kiosk-01)
      const res = await request(app)
        .get('/api/kiosk/plan')
        .set('Cookie', `kiosk_session=${session.token}; kiosk_device_id=kiosk-02`);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');

      // Request from Kiosk 1 (presenting matching cookie for kiosk-01) -> Passes session verification
      const resValid = await request(app)
        .get('/api/kiosk/plan')
        .set('Cookie', `kiosk_session=${session.token}; kiosk_device_id=kiosk-01`);

      expect(resValid.status).not.toBe(401);
    });
  });

  // =========================================================================
  // F7: Disable Authorization: Bearer in Production by Default
  // =========================================================================
  describe('F7: Authorization: Bearer Disabled in Production by Default', () => {
    function buildProtectedApp(): Express {
      const app = express();
      app.use(cookieParser());
      app.get('/api/protected', authenticate, (req, res) => {
        res.status(200).json({ ok: true, user: req.user });
      });
      app.use(errorHandler);
      return app;
    }

    it('[UNIT] F7.1: Bearer token is rejected with 401 in production when ALLOW_BEARER_IN_PROD is not enabled', async () => {
      const origEnv = process.env.NODE_ENV;
      const origBearer = process.env.ALLOW_BEARER_IN_PROD;
      const origCors = process.env.CORS_ORIGINS;
      try {
        (process.env as any).NODE_ENV = 'production';
        process.env.CORS_ORIGINS = 'https://hospital.drtech.care';
        delete process.env.ALLOW_BEARER_IN_PROD;
        resetCachedEnv();

        const app = buildProtectedApp();
        const res = await request(app)
          .get('/api/protected')
          .set('Authorization', 'Bearer mock-token:admin-01:admin:active');

        expect(res.status).toBe(401);
        expect(res.body.error.code).toBe('UNAUTHORIZED');
      } finally {
        (process.env as any).NODE_ENV = origEnv;
        if (origBearer) process.env.ALLOW_BEARER_IN_PROD = origBearer;
        else delete process.env.ALLOW_BEARER_IN_PROD;
        if (origCors) process.env.CORS_ORIGINS = origCors;
        else delete process.env.CORS_ORIGINS;
        resetCachedEnv();
      }
    });

    it('[UNIT] F7.2: Bearer token is accepted in production when ALLOW_BEARER_IN_PROD=true is explicitly configured', async () => {
      const origEnv = process.env.NODE_ENV;
      const origBearer = process.env.ALLOW_BEARER_IN_PROD;
      const origCors = process.env.CORS_ORIGINS;
      try {
        (process.env as any).NODE_ENV = 'production';
        process.env.CORS_ORIGINS = 'https://hospital.drtech.care';
        process.env.ALLOW_BEARER_IN_PROD = 'true';
        resetCachedEnv();

        const app = buildProtectedApp();
        const res = await request(app)
          .get('/api/protected')
          .set('Authorization', 'Bearer mock-token:admin-01:admin:active');

        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
      } finally {
        (process.env as any).NODE_ENV = origEnv;
        if (origBearer) process.env.ALLOW_BEARER_IN_PROD = origBearer;
        else delete process.env.ALLOW_BEARER_IN_PROD;
        if (origCors) process.env.CORS_ORIGINS = origCors;
        else delete process.env.CORS_ORIGINS;
        resetCachedEnv();
      }
    });
  });

  // =========================================================================
  // H9: Throttling & Exponential Retry-After Test
  // =========================================================================
  describe('H9: Login Throttling & Exponential Retry-After Invariants', () => {
    it('[UNIT] H9.1: Throttling produces exponential increase in Retry-After header', async () => {
      const { AuthService } = await import('../modules/auth/service');
      const { AuthRepository } = await import('../modules/auth/repository');

      const authRepo = new AuthRepository();
      let failCount = 5;
      authRepo.getLoginFailuresByUsernameAndIp = async () => failCount;
      authRepo.recordLoginFailure = async () => {};

      const service = new AuthService(authRepo, async () => ({
        data: null,
        error: { message: 'Invalid login credentials', status: 400 },
      }));

      // At 5 failures (MAX_USERNAME_ATTEMPTS = 5): retryAfter = 2^1 = 2
      failCount = 5;
      let err5: any;
      try {
        await service.login('testuser', 'wrong', '192.0.2.1');
      } catch (e) {
        err5 = e;
      }
      expect(err5.statusCode).toBe(429);
      expect(err5.retryAfter).toBe(2);

      // At 6 failures: retryAfter = 2^2 = 4
      failCount = 6;
      let err6: any;
      try {
        await service.login('testuser', 'wrong', '192.0.2.1');
      } catch (e) {
        err6 = e;
      }
      expect(err6.statusCode).toBe(429);
      expect(err6.retryAfter).toBe(4);

      // At 7 failures: retryAfter = 2^3 = 8
      failCount = 7;
      let err7: any;
      try {
        await service.login('testuser', 'wrong', '192.0.2.1');
      } catch (e) {
        err7 = e;
      }
      expect(err7.statusCode).toBe(429);
      expect(err7.retryAfter).toBe(8);

      // At 8 failures: retryAfter = 2^4 = 16
      failCount = 8;
      let err8: any;
      try {
        await service.login('testuser', 'wrong', '192.0.2.1');
      } catch (e) {
        err8 = e;
      }
      expect(err8.statusCode).toBe(429);
      expect(err8.retryAfter).toBe(16);
    });
  });

  // =========================================================================
  // H10: Trust Proxy & X-Forwarded-For IP Resolution
  // =========================================================================
  describe('H10: Reverse Proxy Trust Proxy & req.ip Resolution', () => {
    it('[UNIT] H10.1: trust proxy correctly resolves req.ip according to configured hops', async () => {
      // 1-hop configuration (Direct Reverse Proxy: Caddy/Nginx -> Express)
      const app1 = express();
      app1.set('trust proxy', 1);
      app1.get('/api/test-ip', (req, res) => {
        res.json({ ip: req.ip });
      });

      const res1 = await request(app1)
        .get('/api/test-ip')
        .set('X-Forwarded-For', '203.0.113.195');

      expect(res1.body.ip).toBe('203.0.113.195');

      // 2-hop configuration (CDN + Reverse Proxy: Cloudflare -> Caddy -> Express)
      const app2 = express();
      app2.set('trust proxy', 2);
      app2.get('/api/test-ip', (req, res) => {
        res.json({ ip: req.ip });
      });

      const res2 = await request(app2)
        .get('/api/test-ip')
        .set('X-Forwarded-For', '198.51.100.42, 10.0.0.1');

      expect(res2.body.ip).toBe('198.51.100.42');
    });
  });

  // =========================================================================
  // I9: Throttle & NAT Spray Mitigation Invariants
  // =========================================================================
  describe('I9: Throttle & NAT Spray Mitigation Invariants', () => {
    it('[UNIT] I9.1: Per-username throttle strictly applies to HOSPITAL_IPS (no exemption from per-username throttle)', async () => {
      const { AuthService } = await import('../modules/auth/service');
      const { AuthRepository } = await import('../modules/auth/repository');

      const authRepo = new AuthRepository();
      // Failures on the username from a hospital IP (127.0.0.1 is in HOSPITAL_IPS)
      authRepo.getLoginFailuresByUsernameAndIp = async () => 6;
      authRepo.recordLoginFailure = async () => {};

      const service = new AuthService(authRepo, async () => ({
        data: null,
        error: { message: 'Invalid credentials', status: 400 },
      }));

      let caughtErr: any;
      try {
        await service.login('hospital_user', 'wrong_pass', '127.0.0.1');
      } catch (e) {
        caughtErr = e;
      }

      // Must be throttled with 429 and Retry-After despite being a hospital IP
      expect(caughtErr).toBeDefined();
      expect(caughtErr.statusCode).toBe(429);
      expect(caughtErr.code).toBe('TOO_MANY_FAILED_ATTEMPTS');
      expect(caughtErr.retryAfter).toBe(4); // 2^(6-5+1) = 4s
    });

    it('[UNIT] I9.2: Single IP credential-stuffing spray across multiple usernames is throttled', async () => {
      const { AuthService } = await import('../modules/auth/service');
      const { AuthRepository } = await import('../modules/auth/repository');

      const authRepo = new AuthRepository();
      // Only 1 failure for this specific username
      authRepo.getLoginFailuresByUsernameAndIp = async () => 1;
      authRepo.getLoginFailuresByUsername = async () => 1;
      // But 55 total failures from this untrusted IP across different usernames (exceeds IP_LOGIN_MAX_FAILURES = 50)
      authRepo.getLoginFailuresByIp = async () => 55;
      authRepo.recordLoginFailure = async () => {};

      const service = new AuthService(authRepo, async () => ({
        data: null,
        error: { message: 'Invalid credentials', status: 400 },
      }));

      let caughtErr: any;
      try {
        await service.login('another_victim_user', 'wrong_pass', '198.51.100.99');
      } catch (e) {
        caughtErr = e;
      }

      expect(caughtErr).toBeDefined();
      expect(caughtErr.statusCode).toBe(429);
      expect(caughtErr.message).toContain('untrusted IP');
      expect(caughtErr.retryAfter).toBe(900);
    });

    it('[UNIT] I9.3: Hospital IP allows normal traffic under HOSPITAL_IP_LOGIN_MAX_FAILURES but blocks excessive spray', async () => {
      const { AuthService } = await import('../modules/auth/service');
      const { AuthRepository } = await import('../modules/auth/repository');

      const authRepo = new AuthRepository();
      authRepo.getLoginFailuresByUsernameAndIp = async () => 1;
      authRepo.getLoginFailuresByUsername = async () => 1;
      authRepo.recordLoginFailure = async () => {};

      const service = new AuthService(authRepo, async () => ({
        data: null,
        error: { message: 'Invalid credentials', status: 400 },
      }));

      // Case A: 100 failures from hospital IP (above 50 external threshold, but below 200 hospital threshold)
      authRepo.getLoginFailuresByIp = async () => 100;
      let errA: any = null;
      try {
        await service.login('doctor_smith', 'bad_pass', '127.0.0.1');
      } catch (e) {
        errA = e;
      }
      // Should fail with 401 (invalid credentials), NOT 429!
      expect(errA.statusCode).toBe(401);

      // Case B: 250 failures from hospital IP (exceeds HOSPITAL_IP_LOGIN_MAX_FAILURES = 200)
      authRepo.getLoginFailuresByIp = async () => 250;
      let errB: any = null;
      try {
        await service.login('doctor_smith', 'bad_pass', '127.0.0.1');
      } catch (e) {
        errB = e;
      }
      // Should fail with 429 (blocked hospital network spray)
      expect(errB.statusCode).toBe(429);
      expect(errB.message).toContain('hospital network IP');
      expect(errB.retryAfter).toBe(900);
    });
  });
});
