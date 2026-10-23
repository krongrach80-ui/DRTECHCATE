import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as adminClientModule from '../lib/supabase/adminClient';
import * as authClientModule from '../lib/supabase/authClient';
import { AuthRepository } from '../modules/auth/repository';
import { AuditRepository } from '../modules/audit/repository';
import { KioskRepository } from '../modules/kiosk/repository';
import { authenticate, clearProfileCache, setAuthTokenVerifier } from '../middleware/authenticate';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../middleware/logger';
import { Request, Response } from 'express';

describe('[UNIT] Supabase Outage Fail-Closed Verification (No Offline Fallback)', () => {
  let loggerErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    clearProfileCache();
    loggerErrorSpy = vi.spyOn(logger, 'error').mockImplementation(() => logger);
  });

  // Mock a failing Supabase query builder that always returns error or throws
  function createFailingSupabaseClient(simulatedDbError = new Error('Connection refused: 5432 / Supabase outage')) {
    const failingChain: any = {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      range: vi.fn().mockReturnThis(),
      contains: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: simulatedDbError }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: simulatedDbError }),
      then: (resolve: any) => resolve({ data: null, error: simulatedDbError }),
    };

    return {
      from: vi.fn().mockReturnValue(failingChain),
      rpc: vi.fn().mockResolvedValue({ data: null, error: simulatedDbError }),
    } as any;
  }

  describe('1. AuthRepository Fail-Closed', () => {
    const authRepo = new AuthRepository();

    it('getProfileById must fail-closed with 503 and log error when Supabase is down', async () => {
      vi.spyOn(adminClientModule, 'getAdminClient').mockReturnValue(createFailingSupabaseClient());

      await expect(authRepo.getProfileById('usr-123')).rejects.toThrow(AppError);
      try {
        await authRepo.getProfileById('usr-123');
      } catch (err: any) {
        expect(err.statusCode).toBe(503);
        expect(err.code).toBe('SERVICE_UNAVAILABLE');
      }
      expect(loggerErrorSpy).toHaveBeenCalled();
    });

    it('forceLogout must fail-closed with 503 and log error when Supabase is down', async () => {
      vi.spyOn(adminClientModule, 'getAdminClient').mockReturnValue(createFailingSupabaseClient());

      await expect(authRepo.forceLogout('usr-123')).rejects.toThrow(AppError);
      try {
        await authRepo.forceLogout('usr-123');
      } catch (err: any) {
        expect(err.statusCode).toBe(503);
        expect(err.code).toBe('SERVICE_UNAVAILABLE');
      }
      expect(loggerErrorSpy).toHaveBeenCalled();
    });

    it('recordLoginFailure must fail-closed with 503 when Supabase insert fails', async () => {
      vi.spyOn(adminClientModule, 'getAdminClient').mockReturnValue(createFailingSupabaseClient());

      await expect(authRepo.recordLoginFailure('testadmin', '192.168.1.1')).rejects.toThrow(AppError);
      try {
        await authRepo.recordLoginFailure('testadmin', '192.168.1.1');
      } catch (err: any) {
        expect(err.statusCode).toBe(503);
        expect(err.code).toBe('SERVICE_UNAVAILABLE');
      }
      expect(loggerErrorSpy).toHaveBeenCalled();
    });

    it('getLoginFailuresByIp must fail-closed with 503 and not return 0 silently', async () => {
      vi.spyOn(adminClientModule, 'getAdminClient').mockReturnValue(createFailingSupabaseClient());

      await expect(authRepo.getLoginFailuresByIp('192.168.1.1', 60000)).rejects.toThrow(AppError);
      try {
        await authRepo.getLoginFailuresByIp('192.168.1.1', 60000);
      } catch (err: any) {
        expect(err.statusCode).toBe(503);
        expect(err.code).toBe('SERVICE_UNAVAILABLE');
      }
      expect(loggerErrorSpy).toHaveBeenCalled();
    });
  });

  describe('2. AuditRepository Fail-Closed', () => {
    const auditRepo = new AuditRepository();

    it('write must fail-closed with 503 and log error when Supabase insert fails', async () => {
      vi.spyOn(adminClientModule, 'getAdminClient').mockReturnValue(createFailingSupabaseClient());

      await expect(
        auditRepo.write({
          actor_type: 'staff',
          action: 'STAFF_LOGIN_SUCCESS',
          entity: 'profiles',
        })
      ).rejects.toThrow(AppError);

      try {
        await auditRepo.write({
          actor_type: 'staff',
          action: 'STAFF_LOGIN_SUCCESS',
          entity: 'profiles',
        });
      } catch (err: any) {
        expect(err.statusCode).toBe(503);
        expect(err.code).toBe('SERVICE_UNAVAILABLE');
      }
      expect(loggerErrorSpy).toHaveBeenCalled();
    });

    it('query must fail-closed with 503 and log error when Supabase select fails', async () => {
      vi.spyOn(adminClientModule, 'getAdminClient').mockReturnValue(createFailingSupabaseClient());

      await expect(auditRepo.query({ page: 1, limit: 10 })).rejects.toThrow(AppError);

      try {
        await auditRepo.query({ page: 1, limit: 10 });
      } catch (err: any) {
        expect(err.statusCode).toBe(503);
        expect(err.code).toBe('SERVICE_UNAVAILABLE');
      }
      expect(loggerErrorSpy).toHaveBeenCalled();
    });
  });

  describe('3. KioskRepository Fail-Closed', () => {
    const kioskRepo = new KioskRepository();

    it('getKioskById must throw 503 and log error when Supabase query fails (no memory fallback)', async () => {
      vi.spyOn(adminClientModule, 'getAdminClient').mockReturnValue(createFailingSupabaseClient());

      await expect(kioskRepo.getKioskById('kiosk-1')).rejects.toThrow(AppError);
      try {
        await kioskRepo.getKioskById('kiosk-1');
      } catch (err: any) {
        expect(err.statusCode).toBe(503);
        expect(err.code).toBe('SERVICE_UNAVAILABLE');
      }
      expect(loggerErrorSpy).toHaveBeenCalled();
    });

    it('savePairingRecord must throw 503 and log error when Supabase update fails', async () => {
      vi.spyOn(adminClientModule, 'getAdminClient').mockReturnValue(createFailingSupabaseClient());

      await expect(
        kioskRepo.savePairingRecord({
          kioskId: 'kiosk-1',
          codeHash: 'hash-abc',
          expiresAt: new Date(Date.now() + 60000),
          failedAttempts: 0,
          isUsed: false,
          isLocked: false,
          createdAt: new Date(),
        })
      ).rejects.toThrow(AppError);

      try {
        await kioskRepo.savePairingRecord({
          kioskId: 'kiosk-1',
          codeHash: 'hash-abc',
          expiresAt: new Date(Date.now() + 60000),
          failedAttempts: 0,
          isUsed: false,
          isLocked: false,
          createdAt: new Date(),
        });
      } catch (err: any) {
        expect(err.statusCode).toBe(503);
        expect(err.code).toBe('SERVICE_UNAVAILABLE');
      }
      expect(loggerErrorSpy).toHaveBeenCalled();
    });

    it('recordIpFailure must throw 503 when Supabase is down', async () => {
      vi.spyOn(adminClientModule, 'getAdminClient').mockReturnValue(createFailingSupabaseClient());

      await expect(kioskRepo.recordIpFailure('10.0.0.1')).rejects.toThrow(AppError);
      try {
        await kioskRepo.recordIpFailure('10.0.0.1');
      } catch (err: any) {
        expect(err.statusCode).toBe(503);
        expect(err.code).toBe('SERVICE_UNAVAILABLE');
      }
      expect(loggerErrorSpy).toHaveBeenCalled();
    });

    it('getIpFailureCount must throw 503 when Supabase is down (no memory fallback count)', async () => {
      vi.spyOn(adminClientModule, 'getAdminClient').mockReturnValue(createFailingSupabaseClient());

      await expect(kioskRepo.getIpFailureCount('10.0.0.1', 60000)).rejects.toThrow(AppError);
      try {
        await kioskRepo.getIpFailureCount('10.0.0.1', 60000);
      } catch (err: any) {
        expect(err.statusCode).toBe(503);
        expect(err.code).toBe('SERVICE_UNAVAILABLE');
      }
      expect(loggerErrorSpy).toHaveBeenCalled();
    });

    it('matchFaceCandidates must throw 503 and log error when Supabase RPC fails (no memory vector math)', async () => {
      vi.spyOn(adminClientModule, 'getAdminClient').mockReturnValue(createFailingSupabaseClient());

      await expect(kioskRepo.matchFaceCandidates(new Array(512).fill(0.1), ['pat-1', 'pat-2'])).rejects.toThrow(AppError);
      try {
        await kioskRepo.matchFaceCandidates(new Array(512).fill(0.1), ['pat-1', 'pat-2']);
      } catch (err: any) {
        expect(err.statusCode).toBe(503);
        expect(err.code).toBe('SERVICE_UNAVAILABLE');
      }
      expect(loggerErrorSpy).toHaveBeenCalled();
    });

    it('getOrCreateMissionRun must throw 503 and log error when Supabase fails', async () => {
      vi.spyOn(adminClientModule, 'getAdminClient').mockReturnValue(createFailingSupabaseClient());

      await expect(kioskRepo.getOrCreateMissionRun('pat-1', 'crs-1', '2026-10-23')).rejects.toThrow(AppError);
      try {
        await kioskRepo.getOrCreateMissionRun('pat-1', 'crs-1', '2026-10-23');
      } catch (err: any) {
        expect(err.statusCode).toBe(503);
        expect(err.code).toBe('SERVICE_UNAVAILABLE');
      }
      expect(loggerErrorSpy).toHaveBeenCalled();
    });
  });

  describe('4. authenticate Middleware: 401 Invalid Token vs 503 Supabase Outage (Item 1.7)', () => {
    beforeEach(() => {
      setAuthTokenVerifier(null);
    });

    it('Case A: Invalid or expired token must return 401 UNAUTHORIZED', async () => {
      const mockAuthClient = {
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: null },
            error: { status: 401, message: 'Invalid JWT signature or expired' },
          }),
        },
      } as any;
      vi.spyOn(authClientModule, 'getAuthClient').mockReturnValue(mockAuthClient);

      const req = {
        cookies: { access_token: 'bad-token-signature' },
        headers: {},
      } as unknown as Request;
      const res = {} as Response;
      let caughtErr: any;
      const next = vi.fn((err?: any) => {
        caughtErr = err;
      });

      await authenticate(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(caughtErr).toBeInstanceOf(AppError);
      expect(caughtErr.statusCode).toBe(401);
      expect(caughtErr.code).toBe('UNAUTHORIZED');
      expect(caughtErr.message).toBe('Invalid or expired authentication session');
    });

    it('Case B: Supabase Auth server outage/network error must return 503 SERVICE_UNAVAILABLE', async () => {
      const mockAuthClient = {
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: null },
            error: {
              status: 503,
              name: 'AuthRetryableFetchError',
              message: 'fetch failed: connect ECONNREFUSED 127.0.0.1:54321',
            },
          }),
        },
      } as any;
      vi.spyOn(authClientModule, 'getAuthClient').mockReturnValue(mockAuthClient);

      const req = {
        cookies: { access_token: 'some-valid-looking-jwt' },
        headers: {},
      } as unknown as Request;
      const res = {} as Response;
      let caughtErr: any;
      const next = vi.fn((err?: any) => {
        caughtErr = err;
      });

      await authenticate(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(caughtErr).toBeInstanceOf(AppError);
      expect(caughtErr.statusCode).toBe(503);
      expect(caughtErr.code).toBe('SERVICE_UNAVAILABLE');
      expect(caughtErr.message).toBe('Authentication service unavailable');
      expect(loggerErrorSpy).toHaveBeenCalled();
    });

    it('Case C: Supabase database profiles query failure must return 503 SERVICE_UNAVAILABLE', async () => {
      // Auth client succeeds in verifying token
      const mockAuthClient = {
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: 'usr-valid-123' } },
            error: null,
          }),
        },
      } as any;
      vi.spyOn(authClientModule, 'getAuthClient').mockReturnValue(mockAuthClient);

      // But PostgreSQL database crashes on profile lookup
      vi.spyOn(adminClientModule, 'getAdminClient').mockReturnValue(
        createFailingSupabaseClient(new Error('PostgreSQL connection timeout'))
      );

      const validToken = 'eyJhbGciOiJIUzI1NiJ9.' + Buffer.from(JSON.stringify({ sub: 'usr-valid-123', iat: Math.floor(Date.now() / 1000) })).toString('base64') + '.xyz';
      const req = {
        cookies: { access_token: validToken },
        headers: {},
      } as unknown as Request;
      const res = {} as Response;
      let caughtErr: any;
      const next = vi.fn((err?: any) => {
        caughtErr = err;
      });

      await authenticate(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(caughtErr).toBeInstanceOf(AppError);
      expect(caughtErr.statusCode).toBe(503);
      expect(caughtErr.code).toBe('SERVICE_UNAVAILABLE');
      expect(caughtErr.message).toBe('Database service unavailable during authentication');
      expect(loggerErrorSpy).toHaveBeenCalled();
    });
  });
});
