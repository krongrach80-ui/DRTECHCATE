import crypto from 'crypto';
import { AppError } from '../../middleware/errorHandler';
import { getEnv } from '../../config/env';
import { defaultAuthRepository, IAuthRepository, UserProfileRecord } from './repository';
import { getAuthClient } from '../../lib/supabase/authClient';
import { clearProfileCache, markUserForceLoggedOut, UserSession } from '../../middleware/authenticate';
import { audit } from '../audit';

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

export type AuthRefreshFn = (refreshToken: string) => Promise<{
  data: { session: { access_token: string; refresh_token: string; expires_in?: number } | null } | null;
  error: Error | { message: string } | null;
}>;

let globalCustomSignIn: AuthSignInFn | null = null;
let globalCustomRefresh: AuthRefreshFn | null = null;

export function setGlobalCustomAuth(
  signIn: AuthSignInFn | null,
  refresh: AuthRefreshFn | null = null
): void {
  globalCustomSignIn = signIn;
  globalCustomRefresh = refresh;
}

export class AuthService {
  private readonly MAX_IP_ATTEMPTS = 5;
  private readonly MAX_USERNAME_ATTEMPTS = 5;
  private readonly LOCK_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

  constructor(
    private repo: IAuthRepository = defaultAuthRepository,
    private customSignIn?: AuthSignInFn,
    private customRefresh?: AuthRefreshFn
  ) {}

  setRepository(repo: IAuthRepository): void {
    this.repo = repo;
  }

  async login(
    username: string,
    password: string,
    clientIp: string = '127.0.0.1',
    existingDeviceId?: string,
    userAgent?: string
  ): Promise<LoginResult> {
    const env = getEnv();
    const cleanUsername = username.trim().toLowerCase();

    // Check account ban
    const { isAccountBanned } = await import('../../middleware/banCheck');
    if (isAccountBanned(cleanUsername)) {
      throw new AppError('Account is banned by administrator', 403, 'ACCOUNT_BANNED');
    }

    // 1. Primary Security: Exponential backoff per (username + IP)
    // NEVER locks an account purely by username to prevent DoS attacks against legitimate staff
    const pairFailures = await this.repo.getLoginFailuresByUsernameAndIp(cleanUsername, clientIp, this.LOCK_WINDOW_MS);
    if (pairFailures >= this.MAX_USERNAME_ATTEMPTS) {
      const retryAfterSeconds = Math.min(Math.pow(2, pairFailures - this.MAX_USERNAME_ATTEMPTS + 1), 900);
      throw new AppError(
        'Too many failed login attempts for this user from your IP. Please wait before retrying.',
        429,
        'TOO_MANY_FAILED_ATTEMPTS',
        true,
        retryAfterSeconds
      );
    }

    // 2. IP-level spray protection across all usernames (Item I9):
    // For regular external IPs: IP_LOGIN_MAX_FAILURES (default 50).
    // For hospital NAT networks: higher threshold HOSPITAL_IP_LOGIN_MAX_FAILURES (default 200).
    // An IP attempting a credential-stuffing spray across multiple usernames is blocked with 429 + Retry-After.
    const hospitalIps = (env.HOSPITAL_IPS || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const isHospitalNetwork = hospitalIps.includes(clientIp.toLowerCase()) || clientIp === '127.0.0.1' || clientIp === '::1';

    const maxIpFailures = isHospitalNetwork
      ? (env.HOSPITAL_IP_LOGIN_MAX_FAILURES || 200)
      : (env.IP_LOGIN_MAX_FAILURES || 50);

    const ipFailures = await this.repo.getLoginFailuresByIp(clientIp, this.LOCK_WINDOW_MS);
    if (ipFailures >= maxIpFailures) {
      throw new AppError(
        isHospitalNetwork
          ? 'Too many failed login attempts across accounts from this hospital network IP. Please wait 15 minutes.'
          : 'Too many failed login attempts from this untrusted IP. Please wait 15 minutes.',
        429,
        'TOO_MANY_FAILED_ATTEMPTS',
        true,
        900
      );
    }

    // 3. Multi-IP spray attack protection per username:
    // When an attacker rotates IPs targeting the same username, delay via 429 + Retry-After.
    // NEVER permanently lock the account or change its status in the DB.
    const userFailuresAcrossIps = await this.repo.getLoginFailuresByUsername(cleanUsername, this.LOCK_WINDOW_MS);
    if (userFailuresAcrossIps >= 15) {
      const sprayDelaySeconds = Math.min(Math.pow(2, Math.floor((userFailuresAcrossIps - 15) / 3) + 1), 60);
      throw new AppError(
        'Account is receiving excessive failed attempts across networks. Please retry shortly.',
        429,
        'TOO_MANY_FAILED_ATTEMPTS',
        true,
        sprayDelaySeconds
      );
    }

    // Always invoke Supabase Auth signInWithPassword using internal domain email
    // Even when the user does not exist, Supabase Auth runs its password evaluation natively
    const internalEmail = `${cleanUsername}@${env.INTERNAL_EMAIL_DOMAIN}`;
    let authData: AuthUserSession | null = null;
    let authError: Error | { message: string; status?: number } | null = null;

    const signInFn = this.customSignIn || globalCustomSignIn;

    try {
      if (signInFn) {
        const res = await signInFn({ email: internalEmail, password });
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

      try {
        await audit.write({
          actor_type: 'system',
          actor_id: null,
          action: 'login_failed',
          entity: 'auth',
          entity_id: null,
          ip: clientIp,
          device_id: existingDeviceId || null,
          metadata: {
            username: cleanUsername,
            reason: 'Invalid credentials',
          },
        });
      } catch {
        // Non-blocking
      }

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

    // Audit successful login
    try {
      await audit.write({
        actor_type: 'staff',
        actor_id: profile.id,
        action: 'login',
        entity: 'auth',
        entity_id: profile.id,
        ip: clientIp,
        device_id: deviceId,
        metadata: {
          username: cleanUsername,
          role: profile.role,
        },
      });
    } catch {
      // Non-blocking
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

    const refreshFn = this.customRefresh || globalCustomRefresh;
    const authResult = refreshFn
      ? await refreshFn(refreshToken)
      : await getAuthClient().auth.refreshSession({
          refresh_token: refreshToken,
        });

    if (authResult.error || !authResult.data?.session) {
      throw new AppError('Invalid or expired refresh token', 401, 'UNAUTHORIZED');
    }

    return {
      accessToken: authResult.data.session.access_token,
      refreshToken: authResult.data.session.refresh_token,
      expiresIn: authResult.data.session.expires_in || 3600,
    };
  }

  async logout(userId: string, clientIp?: string, deviceId?: string): Promise<void> {
    try {
      const authClient = getAuthClient();
      await authClient.auth.signOut();
    } catch {
      // Graceful logout
    }

    try {
      await audit.write({
        actor_type: 'staff',
        actor_id: userId,
        action: 'logout',
        entity: 'auth',
        entity_id: userId,
        ip: clientIp || null,
        device_id: deviceId || null,
        metadata: {},
      });
    } catch {
      // Non-blocking
    }
  }

  async forceLogout(
    userId: string,
    adminUser?: UserSession,
    clientIp?: string,
    clientDeviceId?: string,
    reason?: string
  ): Promise<void> {
    await this.repo.forceLogout(userId);
    markUserForceLoggedOut(userId);
    clearProfileCache();

    try {
      await audit.write({
        actor_type: 'staff',
        actor_id: adminUser?.id || null,
        action: 'force_logout',
        entity: 'staff',
        entity_id: userId,
        ip: clientIp || null,
        device_id: clientDeviceId || null,
        metadata: {
          target_user_id: userId,
          reason: reason || 'Revoked by administrator',
        },
      });
    } catch {
      // Non-blocking
    }
  }
}
