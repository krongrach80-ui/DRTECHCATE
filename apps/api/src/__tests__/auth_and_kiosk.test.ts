import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import express, { Express, Request, Response } from 'express';
import cookieParser from 'cookie-parser';
import { KioskService } from '../modules/kiosk/service';
import { KioskRepository } from '../modules/kiosk/repository';
import { AuthService, AuthSignInFn } from '../modules/auth/service';
import { AuthRepository } from '../modules/auth/repository';
import { AuthController } from '../modules/auth/controller';
import { createAuthRouter } from '../modules/auth/routes';
import { KioskController } from '../modules/kiosk/controller';
import { createKioskRouter } from '../modules/kiosk/routes';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';
import { errorHandler } from '../middleware/errorHandler';
import { validateAdminParams, createSuperAdminCore } from '../../../../scripts/create-admin';

describe('DrTech.Care System 3: Auth, Session & Kiosk Pairing Complete Test Suite', () => {
  const testKioskId = 'c0000000-0000-4000-8000-000000000001';
  const testPairingSecret = 'kiosk-test-hmac-secret-min-16-chars-long';

  beforeAll(() => {
    (process.env as Record<string, string>).NODE_ENV = 'test';
    process.env.SUPABASE_URL = 'https://mctegvnrvmglbibuuczi.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'sb_publishable_RIM7hit0_ZY0y5fBCK_Uuw_bEJY7H5I';
    process.env.INTERNAL_EMAIL_DOMAIN = 'clinic.internal';
    process.env.KIOSK_PAIRING_SECRET = testPairingSecret;
  });

  describe('1. Kiosk Pairing Security & DB-Backed Constraints', () => {
    let kioskRepo: KioskRepository;
    let kioskService: KioskService;
    let kioskApp: Express;

    beforeEach(() => {
      kioskRepo = new KioskRepository();
      kioskService = new KioskService(kioskRepo, testPairingSecret);

      kioskApp = express();
      kioskApp.use(express.json());
      kioskApp.use(cookieParser());
      kioskApp.use('/api/kiosk', createKioskRouter(new KioskController(kioskService)));
      kioskApp.use(errorHandler);
    });

    it('1.1 [crypto.randomInt & HMAC-SHA256]: Code must be generated with randomInt and stored as HMAC-SHA256', async () => {
      // 1. Test randomInt generator
      const code1 = kioskService.generateCodeRandomInt();
      const code2 = kioskService.generateCodeRandomInt();
      expect(code1).toHaveLength(6);
      expect(code2).toHaveLength(6);
      expect(code1).not.toBe(code2); // Statistical uniqueness

      // 2. Generate and store
      const { code: plainCode } = await kioskService.generatePairingCode(testKioskId);
      const record = await kioskRepo.getPairingRecord(testKioskId);
      expect(record).not.toBeNull();

      // Plain code must NEVER be stored
      expect((record as unknown as Record<string, unknown>).code).toBeUndefined();

      // Hash must be HMAC-SHA256 (NOT plain SHA-256)
      const expectedHmac = crypto
        .createHmac('sha256', testPairingSecret)
        .update(plainCode)
        .digest('hex');
      const plainSha256 = crypto.createHash('sha256').update(plainCode).digest('hex');

      expect(record!.codeHash).toBe(expectedHmac);
      expect(record!.codeHash).not.toBe(plainSha256); // Proves it is HMAC, not plain SHA-256
      expect(record!.codeHash).toHaveLength(64);
    });

    it('1.2 [รหัสจับคู่ใช้ได้ครั้งเดียว]: Pairing code must be single-use and rejected on second attempt', async () => {
      const { code } = await kioskService.generatePairingCode(testKioskId);

      // First pairing attempt -> SUCCESS (200)
      const res1 = await request(kioskApp)
        .post('/api/kiosk/pair')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ kiosk_id: testKioskId, code });

      expect(res1.status).toBe(200);
      expect(res1.body.ok).toBe(true);
      expect(res1.body.message).toContain('Kiosk paired successfully');
      expect(res1.headers['set-cookie']).toBeDefined();
      expect(res1.headers['set-cookie'][0]).toContain('kiosk_device_token=');
      expect(res1.headers['set-cookie'][0]).toContain('HttpOnly');
      expect(res1.headers['set-cookie'][0]).toContain('SameSite=Strict');

      // Second pairing attempt with same code -> MUST FAIL (400 PAIRING_CODE_ALREADY_USED)
      const res2 = await request(kioskApp)
        .post('/api/kiosk/pair')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ kiosk_id: testKioskId, code });

      expect(res2.status).toBe(400);
      expect(res2.body.error).toEqual({
        code: 'PAIRING_CODE_ALREADY_USED',
        message: 'Pairing code has already been used',
      });
    });

    it('1.3 [หมดอายุ 10 นาที]: Pairing code must expire after 10 minutes and be rejected', async () => {
      const { code } = await kioskService.generatePairingCode(testKioskId);

      // Advance time past 10 minutes
      const record = await kioskRepo.getPairingRecord(testKioskId);
      record!.expiresAt = new Date(Date.now() - 1000); // 1 second in past
      await kioskRepo.savePairingRecord(record!);

      const res = await request(kioskApp)
        .post('/api/kiosk/pair')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ kiosk_id: testKioskId, code });

      expect(res.status).toBe(400);
      expect(res.body.error).toEqual({
        code: 'PAIRING_CODE_EXPIRED',
        message: 'Pairing code has expired (10-minute limit exceeded)',
      });
    });

    it('1.4 [ตัวนับการลองผิดต่อ IP ใน DB]: Excessive failed attempts from same IP must be throttled with 429', async () => {
      await kioskService.generatePairingCode(testKioskId);

      // 5 failed attempts from same IP
      for (let i = 1; i <= 5; i++) {
        const res = await request(kioskApp)
          .post('/api/kiosk/pair')
          .set('X-Requested-With', 'XMLHttpRequest')
          .send({ kiosk_id: testKioskId, code: `FAIL${i}` });

        expect([400, 403]).toContain(res.status);
      }

      // 6th attempt from same IP -> 429
      const res6 = await request(kioskApp)
        .post('/api/kiosk/pair')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ kiosk_id: testKioskId, code: 'FAIL06' });

      expect(res6.status).toBe(429);
      expect(res6.body.error.code).toBe('TOO_MANY_FAILED_ATTEMPTS');
    });

    it('1.5 [ตัวนับการลองผิดต่อรหัส/ตู้ ใน DB]: 3 failed attempts on code locks it permanently', async () => {
      const { code: validCode } = await kioskService.generatePairingCode(testKioskId);

      // 3 failed attempts
      for (let i = 1; i <= 3; i++) {
        const res = await request(kioskApp)
          .post('/api/kiosk/pair')
          .set('X-Requested-With', 'XMLHttpRequest')
          .send({ kiosk_id: testKioskId, code: `WRONG${i}` });

        if (i < 3) {
          expect(res.status).toBe(400);
          expect(res.body.error.code).toBe('INVALID_PAIRING_CODE');
        } else {
          expect(res.status).toBe(403);
          expect(res.body.error.code).toBe('PAIRING_CODE_LOCKED');
        }
      }

      // Subsequent attempt even with the CORRECT code must be rejected with 403
      const resAfterLock = await request(kioskApp)
        .post('/api/kiosk/pair')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ kiosk_id: testKioskId, code: validCode });

      expect(resAfterLock.status).toBe(403);
      expect(resAfterLock.body.error.code).toBe('PAIRING_CODE_LOCKED');
    });

    it('1.6 [Admin ออกรหัสใหม่]: Admin issuing new pairing code resets failed attempts and unlocks kiosk', async () => {
      await kioskService.generatePairingCode(testKioskId);

      // Lock the kiosk with 3 wrong attempts
      for (let i = 1; i <= 3; i++) {
        await request(kioskApp)
          .post('/api/kiosk/pair')
          .set('X-Requested-With', 'XMLHttpRequest')
          .send({ kiosk_id: testKioskId, code: `WRONG${i}` });
      }

      // Admin regenerates pairing code for kiosk
      const { code: newCode } = await kioskService.generatePairingCode(testKioskId);

      // Verify that failure count is reset to 0 and unlocked
      const record = await kioskRepo.getPairingRecord(testKioskId);
      expect(record!.failedAttempts).toBe(0);
      expect(record!.isLocked).toBe(false);

      // Now pairing with the new code succeeds with 200
      const res = await request(kioskApp)
        .post('/api/kiosk/pair')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ kiosk_id: testKioskId, code: newCode });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('1.7 [เทียบแบบ constant-time]: HMAC verification uses constant-time crypto.timingSafeEqual', () => {
      const plainCode = 'XY7890';
      const hmac = kioskService.computeHmacSha256(plainCode);

      expect(kioskService.verifyCodeConstantTime('XY7890', hmac)).toBe(true);
      expect(kioskService.verifyCodeConstantTime('xy7890', hmac)).toBe(true); // case-insensitive
      expect(kioskService.verifyCodeConstantTime('BAD123', hmac)).toBe(false);
      expect(kioskService.verifyCodeConstantTime('', hmac)).toBe(false);
      expect(kioskService.verifyCodeConstantTime('XY7890', 'short-hex')).toBe(false);
    });
  });

  describe('2. Login Security, Timing Equalization & Persistent Throttling', () => {
    let authRepo: AuthRepository;
    let authService: AuthService;
    let authApp: Express;

    const mockProfile = {
      id: 'pt-somchai-uuid',
      role: 'pt',
      first_name: 'Somchai',
      last_name: 'Jaidee',
      status: 'active',
      force_logout_at: null,
    };

    const mockSignIn: AuthSignInFn = async ({ email, password }) => {
      // Nonexistent user
      if (email.startsWith('nonexistent_user@')) {
        return { data: null, error: { message: 'Invalid login credentials', status: 400 } };
      }
      // Existing user with wrong password
      if (email.startsWith('existing_pt@') && password !== 'CorrectPassword123!') {
        return { data: null, error: { message: 'Invalid login credentials', status: 400 } };
      }
      // Existing user with correct password
      if (email.startsWith('existing_pt@') && password === 'CorrectPassword123!') {
        return {
          data: {
            user: { id: 'pt-somchai-uuid', email },
            session: {
              access_token: 'mock-access-token-123',
              refresh_token: 'mock-refresh-token-456',
              expires_in: 3600,
            },
          },
          error: null,
        };
      }
      return { data: null, error: { message: 'Invalid login credentials', status: 400 } };
    };

    beforeEach(() => {
      authRepo = new AuthRepository();
      authRepo.getProfileById = async (id: string) => (id === 'pt-somchai-uuid' ? mockProfile : null);

      // In-memory mock for failure counters to avoid network latency jitter in timing tests
      authRepo.getLoginFailuresByIp = async () => 0;
      authRepo.getLoginFailuresByUsername = async () => 0;
      authRepo.recordLoginFailure = async () => {};

      authService = new AuthService(authRepo, mockSignIn);
      const authController = new AuthController(authService);

      authApp = express();
      authApp.use(express.json());
      authApp.use(cookieParser());
      authApp.use('/api/auth', createAuthRouter(authController));
      authApp.use(errorHandler);
    });

    it('2.1 [login ตอบเหมือนกัน]: Nonexistent user vs wrong password must return IDENTICAL status and body', async () => {
      const resNonexistent = await request(authApp)
        .post('/api/auth/login')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ username: 'nonexistent_user', password: 'AnyPassword123!' });

      const resWrongPassword = await request(authApp)
        .post('/api/auth/login')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ username: 'existing_pt', password: 'WrongPassword999!' });

      expect(resNonexistent.status).toBe(401);
      expect(resWrongPassword.status).toBe(401);

      expect(resNonexistent.body).toEqual({
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid username or password',
        },
      });

      expect(resWrongPassword.body).toEqual(resNonexistent.body);
      expect(resNonexistent.headers['set-cookie']).toBeUndefined();
      expect(resWrongPassword.headers['set-cookie']).toBeUndefined();
    });

    it('2.2 [เวลาตอบใกล้เคียงกัน]: Response time difference between nonexistent user and wrong password must be within tight delta', async () => {
      // Warm up JIT compiler
      await request(authApp)
        .post('/api/auth/login')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ username: 'warmup_user', password: 'WarmupPassword123!' });

      // Measure average duration for nonexistent user (3 runs)
      let nonExistentTotal = 0;
      for (let i = 0; i < 3; i++) {
        const t0 = performance.now();
        await request(authApp)
          .post('/api/auth/login')
          .set('X-Requested-With', 'XMLHttpRequest')
          .send({ username: `nonexistent_user_${i}`, password: 'AnyPassword123!' });
        nonExistentTotal += performance.now() - t0;
      }
      const avgNonexistent = nonExistentTotal / 3;

      // Measure average duration for existing user with wrong password (3 runs)
      let wrongPwdTotal = 0;
      for (let i = 0; i < 3; i++) {
        const t1 = performance.now();
        await request(authApp)
          .post('/api/auth/login')
          .set('X-Requested-With', 'XMLHttpRequest')
          .send({ username: 'existing_pt', password: `WrongPassword${i}!` });
        wrongPwdTotal += performance.now() - t1;
      }
      const avgWrongPassword = wrongPwdTotal / 3;

      const deltaMs = Math.abs(avgNonexistent - avgWrongPassword);
      // Assert that delta is tight (< 75ms) thanks to cryptographic work equalization
      expect(deltaMs).toBeLessThan(75);
    });

    it('2.3 [Throttle ต่อ IP & ต่อ Username แบบถาวร]: 5 failed logins triggers temporary lockout', async () => {
      let failAttempts = 0;
      authRepo.getLoginFailuresByUsername = async (u: string) => (u === 'targeted_pt' ? failAttempts : 0);
      authRepo.recordLoginFailure = async (u: string) => {
        if (u === 'targeted_pt') failAttempts++;
      };

      // 5 failed attempts for user "targeted_pt"
      for (let i = 1; i <= 5; i++) {
        const res = await request(authApp)
          .post('/api/auth/login')
          .set('X-Requested-With', 'XMLHttpRequest')
          .send({ username: 'targeted_pt', password: `WrongPwd${i}` });
        expect(res.status).toBe(401);
      }

      // 6th attempt -> must be throttled with 429
      const res6 = await request(authApp)
        .post('/api/auth/login')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ username: 'targeted_pt', password: 'WrongPwd6' });

      expect(res6.status).toBe(429);
      expect(['TOO_MANY_FAILED_ATTEMPTS', 'ACCOUNT_TEMPORARILY_LOCKED']).toContain(res6.body.error.code);
    });

    it('2.4 [Cookie flags & staff_device_id]: Successful login issues HttpOnly, SameSite=Strict cookies and tracks staff_device_id', async () => {
      const res = await request(authApp)
        .post('/api/auth/login')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ username: 'existing_pt', password: 'CorrectPassword123!' });

      expect(res.status).toBe(200);
      expect(res.body.user).toEqual({
        id: 'pt-somchai-uuid',
        role: 'pt',
        full_name: 'Somchai Jaidee',
      });

      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();

      // Check all 3 cookies: access_token, refresh_token, staff_device_id
      const cookieHeader = Array.isArray(cookies) ? cookies.join('; ') : String(cookies || '');
      expect(cookieHeader).toContain('access_token=');
      expect(cookieHeader).toContain('refresh_token=');
      expect(cookieHeader).toContain('staff_device_id=');
      expect(cookieHeader).toContain('HttpOnly');
      expect(cookieHeader).toContain('SameSite=Strict');
      expect(cookieHeader).toContain('Path=/');
    });

    it('2.5 [POST /logout & POST /refresh]: Handles session refresh and cookie clearing on logout', async () => {
      // 1. Refresh endpoint
      const refreshRes = await request(authApp)
        .post('/api/auth/refresh')
        .set('X-Requested-With', 'XMLHttpRequest')
        .set('Cookie', ['refresh_token=mock-refresh-token-xyz']);

      expect(refreshRes.status).toBe(200);
      expect(refreshRes.body.ok).toBe(true);
      expect(refreshRes.headers['set-cookie']).toBeDefined();

      // 2. Logout endpoint
      const logoutRes = await request(authApp)
        .post('/api/auth/logout')
        .set('X-Requested-With', 'XMLHttpRequest')
        .set('Cookie', ['access_token=mock-token:pt-somchai-uuid:pt']);

      expect(logoutRes.status).toBe(200);
      expect(logoutRes.body.ok).toBe(true);
      // Cleared cookies should expire immediately
      const setCookies = logoutRes.headers['set-cookie'];
      const logoutCookies = Array.isArray(setCookies) ? setCookies.join('; ') : String(setCookies || '');
      expect(logoutCookies).toContain('access_token=;');
      expect(logoutCookies).toContain('refresh_token=;');
    });
  });

  describe('3. Authenticate & RequireRole Middleware Tests', () => {
    let testApp: Express;

    beforeAll(() => {
      testApp = express();
      testApp.use(cookieParser());

      // Protected route for PT and Admin
      testApp.get('/test-pt', authenticate, requireRole('pt', 'admin'), (req: Request, res: Response) => {
        res.status(200).json({ ok: true, user: req.user });
      });

      // Admin-only route
      testApp.get('/test-admin', authenticate, requireRole('admin'), (req: Request, res: Response) => {
        res.status(200).json({ ok: true, user: req.user });
      });

      testApp.use(errorHandler);
    });

    it('3.1 should reject requests missing access token with 401 UNAUTHORIZED', async () => {
      const res = await request(testApp).get('/test-pt');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('3.2 should reject invalid / fake token with 401 UNAUTHORIZED', async () => {
      const res = await request(testApp)
        .get('/test-pt')
        .set('Cookie', ['access_token=invalid-fake-token']);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('3.3 should reject expired token with 401 UNAUTHORIZED', async () => {
      const res = await request(testApp)
        .get('/test-pt')
        .set('Cookie', ['access_token=expired-token']);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('3.4 should reject inactive / suspended user with 403 ACCOUNT_INACTIVE', async () => {
      const res = await request(testApp)
        .get('/test-pt')
        .set('Cookie', ['access_token=mock-token:user-1:pt:suspended']);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('ACCOUNT_INACTIVE');
    });

    it('3.5 should reject session revoked via force_logout_at with 401 SESSION_TERMINATED', async () => {
      const res = await request(testApp)
        .get('/test-pt')
        .set('Cookie', ['access_token=mock-token:user-1:pt:active:revoked']);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('SESSION_TERMINATED');
    });

    it('3.6 should enforce requireRole: PT cannot access admin-only route (403 FORBIDDEN)', async () => {
      const res = await request(testApp)
        .get('/test-admin')
        .set('Cookie', ['access_token=mock-token:user-pt:pt']);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('3.7 should allow access when role matches (200 OK)', async () => {
      const res = await request(testApp)
        .get('/test-admin')
        .set('Cookie', ['access_token=mock-token:user-admin:admin']);
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.user.role).toBe('admin');
    });
  });

  describe('4. Initial Super Admin Script Tests (create-admin.ts)', () => {
    it('4.1 should reject admin creation if password is less than 12 characters', async () => {
      const error = await validateAdminParams('admin_user', 'Admin Name', 'short123');
      expect(error).toContain('at least 12 characters');
    });

    it('4.2 should reject invalid username formats', async () => {
      const error = await validateAdminParams('a!', 'Admin Name', 'ValidPassword123!');
      expect(error).toContain('Username must be 3-30 characters');
    });

    it('4.3 should reject when an active Super Admin already exists in the database', async () => {
      const mockSupabase = {
        from: () => ({
          select: () => ({
            eq: async () => ({
              data: [{ id: 'existing-admin-id', username: 'superadmin' }],
              error: null,
            }),
          }),
        }),
        auth: {
          admin: {
            createUser: async () => ({
              data: null,
              error: null,
            }),
          },
        },
      };

      const result = await createSuperAdminCore(mockSupabase, {
        username: 'new_admin',
        fullName: 'New Admin',
        password: 'ValidSuperPassword123!',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('already exists');
    });

    it('4.4 should successfully create Super Admin when parameters are valid and no admin exists', async () => {
      const mockSupabase = {
        from: () => ({
          select: () => ({
            eq: async () => ({
              data: [], // 0 existing admins
              error: null,
            }),
          }),
        }),
        auth: {
          admin: {
            createUser: async () => ({
              data: { user: { id: 'created-admin-uuid' } },
              error: null,
            }),
          },
        },
      };

      const result = await createSuperAdminCore(mockSupabase, {
        username: 'first_superadmin',
        fullName: 'Super Administrator',
        password: 'HospitalMasterPassword2026!',
      });

      expect(result.success).toBe(true);
      expect(result.userId).toBe('created-admin-uuid');
    });
  });
});
