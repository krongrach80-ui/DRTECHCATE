import { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler';
import { logger } from './logger';
import { getAdminClient } from '../lib/supabase/adminClient';
import { getAuthClient } from '../lib/supabase/authClient';
import { getEnv } from '../config/env';

export interface UserSession {
  id: string;
  role: string;
  full_name: string;
  status: string;
  iat?: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: UserSession;
      kioskDevice?: {
        id: string;
        name: string;
        location?: string | null;
      };
    }
  }
}

// In-memory cache for user profile lookups (TTL = 15 seconds) to avoid pounding Postgres on every request
interface CachedProfile {
  profile: UserSession;
  forceLogoutAtMs: number | null;
  cachedAt: number;
}

const profileCache = new Map<string, CachedProfile>();
const forceLoggedOutUsers = new Set<string>();
const CACHE_TTL_MS = 15 * 1000; // 15 seconds

export function markUserForceLoggedOut(userId: string): void {
  forceLoggedOutUsers.add(userId);
  profileCache.delete(userId);
}

export function clearProfileCache(): void {
  profileCache.clear();
}

export function resetAuthTestState(): void {
  profileCache.clear();
  forceLoggedOutUsers.clear();
}

function decodeJwtPayload(token: string): { iat?: number; exp?: number; sub?: string } | null {
  try {
    const parts = token.split('.');
    if (parts.length === 3) {
      return JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
    }
  } catch {
    return null;
  }
  return null;
}

export type AuthTokenVerifier = (token: string) => Promise<{
  id: string;
  role: string;
  full_name: string;
  status: string;
  force_logout_at?: string | null;
} | null>;

let customTokenVerifier: AuthTokenVerifier | null = null;

export function setAuthTokenVerifier(verifier: AuthTokenVerifier | null): void {
  customTokenVerifier = verifier;
}

/**
 * Authentication Middleware
 * 1. Checks access token in HttpOnly cookie or Authorization Bearer header
 * 2. Validates JWT and retrieves user profile
 * 3. Checks active status and force_logout_at timestamp
 * 4. Caches profile for max 15 seconds
 */
export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const env = getEnv();
    const isProd = env.NODE_ENV === 'production';
    const allowBearerInProd = env.ALLOW_BEARER_IN_PROD;
    const bearerAllowed = !isProd || allowBearerInProd;

    const token =
      req.cookies?.access_token ||
      (bearerAllowed && req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.slice(7)
        : undefined);

    if (!token) {
      throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    // If a custom token verifier has been injected (e.g. by test suite fixture), use it
    if (customTokenVerifier) {
      const verified = await customTokenVerifier(token);
      if (!verified) {
        throw new AppError('Invalid or expired authentication session', 401, 'UNAUTHORIZED');
      }
      if (verified.status !== 'active') {
        throw new AppError('User account is inactive or suspended', 403, 'ACCOUNT_INACTIVE');
      }
      if (
        forceLoggedOutUsers.has(verified.id) ||
        Boolean(verified.force_logout_at)
      ) {
        throw new AppError('Session has been revoked by administrator', 401, 'SESSION_TERMINATED');
      }
      req.user = {
        id: verified.id,
        role: verified.role,
        full_name: verified.full_name,
        status: verified.status,
      };
      return next();
    }

    // 1. Verify token with Supabase Auth
    let authUser: { id: string; email?: string } | null = null;
    try {
      const authClient = getAuthClient();
      const res = await authClient.auth.getUser(token);
      if (res.error) {
        const errStatus = (res.error as { status?: number }).status;
        const errMsg = String(res.error.message || '').toLowerCase();
        const isNetworkOr5xx =
          (typeof errStatus === 'number' && errStatus >= 500) ||
          res.error.name === 'AuthRetryableFetchError' ||
          errMsg.includes('fetch failed') ||
          errMsg.includes('econnrefused') ||
          errMsg.includes('network') ||
          errMsg.includes('timeout') ||
          errMsg.includes('unavailable');

        if (isNetworkOr5xx) {
          logger.error({ error: res.error }, 'Supabase Auth network/service outage during token verification');
          throw new AppError('Authentication service unavailable', 503, 'SERVICE_UNAVAILABLE');
        }

        // Token is genuinely invalid, expired, or malformed -> 401
        throw new AppError('Invalid or expired authentication session', 401, 'UNAUTHORIZED');
      }
      if (res.data?.user) {
        authUser = { id: res.data.user.id, email: res.data.user.email };
      }
    } catch (authErr) {
      if (authErr instanceof AppError) throw authErr;
      logger.error({ authErr }, 'Network error communicating with Supabase Auth');
      throw new AppError('Authentication service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }

    if (!authUser) {
      throw new AppError('Invalid or expired authentication session', 401, 'UNAUTHORIZED');
    }

    const userId = authUser.id;
    const now = Date.now();
    const jwtPayload = decodeJwtPayload(token);
    if (!jwtPayload || typeof jwtPayload.iat !== 'number') {
      throw new AppError('Invalid token: missing issued-at (iat) timestamp', 401, 'UNAUTHORIZED');
    }
    const tokenIatMs = jwtPayload.iat * 1000;

    // 2. Check in-memory profile cache (<= 15 seconds)
    const cached = profileCache.get(userId);
    if (cached && now - cached.cachedAt < CACHE_TTL_MS) {
      if (cached.profile.status !== 'active') {
        throw new AppError('User account is inactive or suspended', 403, 'ACCOUNT_INACTIVE');
      }
      if (forceLoggedOutUsers.has(userId) || (cached.forceLogoutAtMs && cached.forceLogoutAtMs > tokenIatMs)) {
        throw new AppError('Session has been revoked by administrator', 401, 'SESSION_TERMINATED');
      }
      req.user = cached.profile;
      return next();
    }

    // 3. Fetch latest profile from DB via adminClient
    const adminClient = getAdminClient();
    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .select('id, role, first_name, last_name, status, force_logout_at')
      .eq('id', userId)
      .single();

    if (profileError) {
      logger.error({ profileError, userId }, 'Failed to query user profile from Supabase during authentication');
      throw new AppError('Database service unavailable during authentication', 503, 'SERVICE_UNAVAILABLE');
    }

    if (!profile) {
      throw new AppError('User profile not found', 401, 'UNAUTHORIZED');
    }

    if (profile.status !== 'active') {
      throw new AppError('User account is inactive or suspended', 403, 'ACCOUNT_INACTIVE');
    }

    const forceLogoutAtMs = profile.force_logout_at
      ? new Date(profile.force_logout_at).getTime()
      : null;

    if (forceLoggedOutUsers.has(userId) || (forceLogoutAtMs && forceLogoutAtMs > tokenIatMs)) {
      throw new AppError('Session has been revoked by administrator', 401, 'SESSION_TERMINATED');
    }

    const sessionUser: UserSession = {
      id: profile.id,
      role: profile.role,
      full_name: `${profile.first_name} ${profile.last_name}`.trim(),
      status: profile.status,
    };

    // Cache profile for 15 seconds
    profileCache.set(userId, {
      profile: sessionUser,
      forceLogoutAtMs,
      cachedAt: now,
    });

    req.user = sessionUser;
    next();
  } catch (err) {
    next(err);
  }
}
