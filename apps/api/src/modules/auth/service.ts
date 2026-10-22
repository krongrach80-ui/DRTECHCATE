import crypto from 'crypto';
import { AppError } from '../../middleware/errorHandler';
import { getEnv } from '../../config/env';
import { AuthRepository, UserProfileRecord } from './repository';
import { getAuthClient } from '../../lib/supabase/authClient';

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: {
    id: string;
    role: string;
    full_name: string;
  };
  deviceId: string;
}

export interface AuthUserSession {
  user: { id: string; email?: string } | null;
  session: { access_token: string; refresh_token: string; expires_in?: number } | null;
}

export type AuthSignInFn = (credentials: {
  email: string;
  password: string;
}) => Promise<{ data: AuthUserSession | null; error: Error | { message: string; status?: number } | null }>;

export class AuthService {
  private readonly MAX_IP_ATTEMPTS = 5;
  private readonly MAX_USERNAME_ATTEMPTS = 5;
  private readonly LOCK_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

  constructor(
    private repo = new AuthRepository(),
    private customSignIn?: AuthSignInFn
  ) {}

  async login(
    username: string,
    password: string,
    clientIp: string = '127.0.0.1',
    existingDeviceId?: string,
    userAgent?: string
  ): Promise<LoginResult> {
    const env = getEnv();
    const cleanUsername = username.trim().toLowerCase();

    // 1. Throttle per IP (DB-persisted)
    const ipFailures = await this.repo.getLoginFailuresByIp(clientIp, this.LOCK_WINDOW_MS);
    if (ipFailures >= this.MAX_IP_ATTEMPTS) {
      throw new AppError(
        'Too many failed login attempts from this IP. Please wait 15 minutes.',
        429,
        'TOO_MANY_FAILED_ATTEMPTS'
      );
    }

    // 2. Throttle per username (DB-persisted)
    const userFailures = await this.repo.getLoginFailuresByUsername(cleanUsername, this.LOCK_WINDOW_MS);
    if (userFailures >= this.MAX_USERNAME_ATTEMPTS) {
      throw new AppError(
        'Account is temporarily locked due to repeated failed logins. Please try again later.',
        429,
        'ACCOUNT_TEMPORARILY_LOCKED'
      );
    }

    // Always invoke Supabase Auth signInWithPassword using internal domain email
    // Even when the user does not exist, Supabase Auth runs its password evaluation natively
    const internalEmail = `${cleanUsername}@${env.INTERNAL_EMAIL_DOMAIN}`;
    let authData: AuthUserSession | null = null;
    let authError: Error | { message: string; status?: number } | null = null;

    try {
      if (this.customSignIn) {
        const res = await this.customSignIn({ email: internalEmail, password });
        authData = res.data;
        authError = res.error;
      } else {
        const authClient = getAuthClient();
        const res = await authClient.auth.signInWithPassword({
          email: internalEmail,
          password,
        });
        authData = res.data;
        authError = res.error;
      }
    } catch (err: unknown) {
      authError = err instanceof Error ? err : new Error(String(err));
    }

    // REQUIREMENT: login must respond IDENTICALLY whether user does not exist or password is wrong!
    if (authError || !authData?.user || !authData?.session) {
      // Record failed attempt in DB (both for IP and username)
      await this.repo.recordLoginFailure(cleanUsername, clientIp);
      throw new AppError('Invalid username or password', 401, 'INVALID_CREDENTIALS');
    }

    // Fetch user profile from database
    let profile: UserProfileRecord | null = null;
    try {
      profile = await this.repo.getProfileById(authData.user.id);
    } catch {
      await this.repo.recordLoginFailure(cleanUsername, clientIp);
      throw new AppError('Invalid username or password', 401, 'INVALID_CREDENTIALS');
    }

    if (!profile || profile.status !== 'active') {
      await this.repo.recordLoginFailure(cleanUsername, clientIp);
      throw new AppError('Invalid username or password', 401, 'INVALID_CREDENTIALS');
    }

    // Device tracking: reuse existing device_id from cookie or generate a new random UUID
    const deviceId = existingDeviceId || crypto.randomUUID();
    try {
      await this.repo.recordStaffDevice(profile.id, deviceId, userAgent);
    } catch {
      // Non-blocking device recording
    }

    return {
      accessToken: authData.session.access_token,
      refreshToken: authData.session.refresh_token,
      expiresIn: authData.session.expires_in || 3600,
      user: {
        id: profile.id,
        role: profile.role,
        full_name: `${profile.first_name} ${profile.last_name}`.trim(),
      },
      deviceId,
    };
  }

  async refresh(refreshToken: string): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
    if (!refreshToken) {
      throw new AppError('Refresh token required', 401, 'UNAUTHORIZED');
    }

    // In testing: handle mock tokens
    if (process.env.NODE_ENV === 'test' && refreshToken.startsWith('mock-refresh-')) {
      return {
        accessToken: 'mock-access-token-refreshed-' + Date.now(),
        refreshToken: 'mock-refresh-token-refreshed-' + Date.now(),
        expiresIn: 3600,
      };
    }

    const authClient = getAuthClient();
    const { data, error } = await authClient.auth.refreshSession({
      refresh_token: refreshToken,
    });

    if (error || !data.session) {
      throw new AppError('Invalid or expired refresh token', 401, 'UNAUTHORIZED');
    }

    return {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresIn: data.session.expires_in || 3600,
    };
  }

  async logout(_userId: string): Promise<void> {
    try {
      const authClient = getAuthClient();
      await authClient.auth.signOut();
    } catch {
      // Graceful logout
    }
  }
}
