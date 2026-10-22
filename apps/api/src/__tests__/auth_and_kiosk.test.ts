import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import { createApp } from '../app';
import { KioskService } from '../modules/kiosk/service';
import { KioskRepository } from '../modules/kiosk/repository';
import { AuthService } from '../modules/auth/service';
import { AuthRepository } from '../modules/auth/repository';
import { AuthController } from '../modules/auth/controller';
import { createAuthRouter } from '../modules/auth/routes';
import { KioskController } from '../modules/kiosk/controller';
import { createKioskRouter } from '../modules/kiosk/routes';
import express, { Express } from 'express';
import cookieParser from 'cookie-parser';
import { errorHandler } from '../middleware/errorHandler';

describe('DrTech.Care System 3: Auth, Session & Kiosk Pairing Test Suite', () => {
  let mainApp: Express;

  beforeAll(() => {
    (process.env as Record<string, string>).NODE_ENV = 'test';
    process.env.SUPABASE_URL = 'https://mctegvnrvmglbibuuczi.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'sb_publishable_RIM7hit0_ZY0y5fBCK_Uuw_bEJY7H5I';
    process.env.INTERNAL_EMAIL_DOMAIN = 'clinic.internal';
    process.env.FACE_T_ACCEPT = '0.60';
    process.env.FACE_T_REJECT = '0.45';
    process.env.FACE_T_MARGIN = '0.10';
    process.env.FACE_T_ENROLL_CONSISTENCY = '0.75';
    process.env.FACE_T_DUPLICATE = '0.85';
    process.env.FACE_CHALLENGE_EXPIRE_SECONDS = '60';

    mainApp = createApp();
  });

  describe('1. Kiosk Pairing Security & Constraints', () => {
    let kioskRepo: KioskRepository;
    let kioskService: KioskService;
    let kioskApp: Express;
    const testKioskId = 'c0000000-0000-4000-8000-000000000001';

    beforeEach(() => {
      kioskRepo = new KioskRepository();
      kioskService = new KioskService(kioskRepo);

      kioskApp = express();
      kioskApp.use(express.json());
      kioskApp.use(cookieParser());
      kioskApp.use('/api/kiosk', createKioskRouter(new KioskController(kioskService)));
      kioskApp.use(errorHandler);
    });

    it('1.1 [รหัสจับคู่ใช้ได้ครั้งเดียว]: Pairing code must be single-use and rejected on second attempt', async () => {
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

    it('1.2 [หมดอายุ 10 นาที]: Pairing code must expire after 10 minutes and be rejected', async () => {
      const { code } = await kioskService.generatePairingCode(testKioskId);

      // Simulate time passage beyond 10 minutes (10 mins + 1 second)
      const record = await kioskRepo.getPairingRecord(testKioskId);
      expect(record).not.toBeNull();
      record!.expiresAt = new Date(Date.now() - 1000); // 1 second in the past
      await kioskRepo.savePairingRecord(record!);

      // Attempt to pair with expired code -> MUST FAIL (400 PAIRING_CODE_EXPIRED)
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

    it('1.3 [จำกัดการลองผิดต่อ IP]: Excessive failed attempts from same IP must be throttled with 429', async () => {
      await kioskService.generatePairingCode(testKioskId);

      // Fire 5 incorrect attempts (IP quota = 5)
      for (let i = 1; i <= 5; i++) {
        const res = await request(kioskApp)
          .post('/api/kiosk/pair')
          .set('X-Requested-With', 'XMLHttpRequest')
          .send({ kiosk_id: testKioskId, code: `WRONG${i}` });

        expect([400, 403]).toContain(res.status);
      }

      // 6th attempt from the same IP -> MUST be blocked with 429 TOO_MANY_FAILED_ATTEMPTS
      const res6 = await request(kioskApp)
        .post('/api/kiosk/pair')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ kiosk_id: testKioskId, code: 'WRONG6' });

      expect(res6.status).toBe(429);
      expect(res6.body.error.code).toBe('TOO_MANY_FAILED_ATTEMPTS');
      expect(res6.body.error.message).toContain('Too many failed pairing attempts from this IP');
    });

    it('1.4 [จำกัดการลองผิดต่อรหัส]: 3 failed attempts on a specific code must lock the code permanently', async () => {
      const { code: validCode } = await kioskService.generatePairingCode(testKioskId);

      // 1st wrong attempt
      const res1 = await request(kioskApp)
        .post('/api/kiosk/pair')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ kiosk_id: testKioskId, code: 'BAD001' });
      expect(res1.status).toBe(400);
      expect(res1.body.error.code).toBe('INVALID_PAIRING_CODE');

      // 2nd wrong attempt
      const res2 = await request(kioskApp)
        .post('/api/kiosk/pair')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ kiosk_id: testKioskId, code: 'BAD002' });
      expect(res2.status).toBe(400);
      expect(res2.body.error.code).toBe('INVALID_PAIRING_CODE');

      // 3rd wrong attempt -> reaches maximum threshold, locks the code
      const res3 = await request(kioskApp)
        .post('/api/kiosk/pair')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ kiosk_id: testKioskId, code: 'BAD003' });
      expect(res3.status).toBe(403);
      expect(res3.body.error.code).toBe('PAIRING_CODE_LOCKED');

      // Now even if the attacker / staff submits the CORRECT code, it MUST remain locked (403)
      const resAfterLock = await request(kioskApp)
        .post('/api/kiosk/pair')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ kiosk_id: testKioskId, code: validCode });

      expect(resAfterLock.status).toBe(403);
      expect(resAfterLock.body.error.code).toBe('PAIRING_CODE_LOCKED');
    });

    it('1.5 [เก็บเป็น hash]: Pairing code must NEVER be stored in plain text (stored ONLY as SHA-256 hash)', async () => {
      const { code: plainCode } = await kioskService.generatePairingCode(testKioskId);

      const record = await kioskRepo.getPairingRecord(testKioskId);
      expect(record).not.toBeNull();

      // Plain code must NOT be stored anywhere on the record
      expect((record as any).code).toBeUndefined();
      expect((record as any).plainCode).toBeUndefined();

      // Hash must match SHA-256 of plain code
      const expectedHash = crypto.createHash('sha256').update(plainCode).digest('hex');
      expect(record!.codeHash).toBe(expectedHash);
      expect(record!.codeHash).toHaveLength(64); // SHA-256 hex string is 64 characters
    });

    it('1.6 [เทียบแบบ constant-time]: Hash comparison must use crypto.timingSafeEqual in constant time', () => {
      const plainCode = 'ABC123';
      const expectedHash = crypto.createHash('sha256').update(plainCode).digest('hex');

      // Exact match -> true
      expect(kioskService.verifyCodeConstantTime('ABC123', expectedHash)).toBe(true);

      // Case-insensitive match -> true
      expect(kioskService.verifyCodeConstantTime('abc123', expectedHash)).toBe(true);

      // Wrong code -> false
      expect(kioskService.verifyCodeConstantTime('XYZ999', expectedHash)).toBe(false);

      // Partial / prefix code -> false
      expect(kioskService.verifyCodeConstantTime('ABC', expectedHash)).toBe(false);

      // Empty string -> false
      expect(kioskService.verifyCodeConstantTime('', expectedHash)).toBe(false);

      // Corrupted hash string length -> false
      expect(kioskService.verifyCodeConstantTime('ABC123', 'invalid-hex-short')).toBe(false);
    });
  });

  describe('2. Login Security: Identical Response for Nonexistent User vs Wrong Password', () => {
    let authApp: Express;

    // Mock repository to simulate both nonexistent user and wrong password
    const mockAuthRepo: any = {
      getProfileById: async (userId: string) => {
        if (userId === 'user-somchai') {
          return {
            id: 'user-somchai',
            role: 'pt',
            first_name: 'Somchai',
            last_name: 'Jaidee',
            status: 'active',
            force_logout_at: null,
          };
        }
        return null;
      },
      recordStaffDevice: async () => {},
    };

    // Custom signIn implementation that simulates real Supabase Auth behavior
    const mockSignIn: any = async ({ email, password }: { email: string; password: string }) => {
      // 1. User does not exist in Auth
      if (email.startsWith('nonexistent_user@')) {
        return {
          data: null,
          error: { message: 'Invalid login credentials', status: 400 },
        };
      }

      // 2. User exists, but password is wrong
      if (email.startsWith('existing_pt@') && password !== 'CorrectPassword123!') {
        return {
          data: null,
          error: { message: 'Invalid login credentials', status: 400 },
        };
      }

      // 3. User exists and password is correct
      if (email.startsWith('existing_pt@') && password === 'CorrectPassword123!') {
        return {
          data: {
            user: { id: 'user-somchai', email },
            session: {
              access_token: 'mock-access-token-xyz',
              refresh_token: 'mock-refresh-token-abc',
              expires_in: 3600,
            },
          },
          error: null,
        };
      }

      return { data: null, error: { message: 'Invalid login credentials', status: 400 } };
    };

    beforeEach(() => {
      const authService = new AuthService(mockAuthRepo, mockSignIn);
      const authController = new AuthController(authService);

      authApp = express();
      authApp.use(express.json());
      authApp.use(cookieParser());
      authApp.use('/api/auth', createAuthRouter(authController));
      authApp.use(errorHandler);
    });

    it('2.1 [login ตอบเหมือนกัน]: Nonexistent user vs wrong password must return IDENTICAL status and body', async () => {
      // Case A: User does NOT exist
      const resNonexistent = await request(authApp)
        .post('/api/auth/login')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          username: 'nonexistent_user',
          password: 'AnyPassword123!',
        });

      // Case B: User DOES exist, but password is WRONG
      const resWrongPassword = await request(authApp)
        .post('/api/auth/login')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          username: 'existing_pt',
          password: 'WrongPassword999!',
        });

      // 1. Status codes MUST be identical (401 Unauthorized)
      expect(resNonexistent.status).toBe(401);
      expect(resWrongPassword.status).toBe(401);

      // 2. Response error bodies MUST be 100% IDENTICAL
      expect(resNonexistent.body).toEqual({
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid username or password',
        },
      });

      expect(resWrongPassword.body).toEqual({
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid username or password',
        },
      });

      // 3. No cookies must be set on failure in either case
      expect(resNonexistent.headers['set-cookie']).toBeUndefined();
      expect(resWrongPassword.headers['set-cookie']).toBeUndefined();
    });

    it('2.2 Successful login should return user role & full_name, and set HttpOnly cookies', async () => {
      const res = await request(authApp)
        .post('/api/auth/login')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          username: 'existing_pt',
          password: 'CorrectPassword123!',
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.user).toEqual({
        id: 'user-somchai',
        role: 'pt',
        full_name: 'Somchai Jaidee',
      });

      // Must set HttpOnly cookies for access_token, refresh_token, and staff_device_id
      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();

      const cookieHeader = cookies.join('; ');
      expect(cookieHeader).toContain('access_token=');
      expect(cookieHeader).toContain('refresh_token=');
      expect(cookieHeader).toContain('staff_device_id=');
      expect(cookieHeader).toContain('HttpOnly');
      expect(cookieHeader).toContain('SameSite=Strict');
    });
  });
});
