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

export type AuthSignInFn = (credentials: {
  email: string;
  password: string;
}) => Promise<{ data: { user: any; session: any } | null; error: any }>;

export class AuthService {
  constructor(
    private repo = new AuthRepository(),
    private customSignIn?: AuthSignInFn
  ) {}

  /**
   * Internal constant-time delay dummy function.
   * Ensures execution time distribution is indistinguishable between
   * nonexistent users and invalid passwords.
   */
  private constantTimeDummyWork(password: string): void {
    const dummyHash = crypto.createHash('sha256').update('timing-salt-' + password).digest();
    const fixedHash = crypto.createHash('sha256').update('timing-fixed-salt-constant').digest();
    crypto.timingSafeEqual(dummyHash, fixedHash);
  }

  async login(
    username: string,
    password: string,
    existingDeviceId?: string,
    userAgent?: string
  ): Promise<LoginResult> {
    const env = getEnv();
    const cleanUsername = username.trim().toLowerCase();
    const internalEmail = `${cleanUsername}@${env.INTERNAL_EMAIL_DOMAIN}`;

    let authData: { user: any; session: any } | null = null;
    let authError: any = null;

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
    } catch (err) {
      authError = err;
    }

    // REQUIREMENT: login must respond IDENTICALLY whether the user does not exist or the password is wrong!
    if (authError || !authData?.user || !authData?.session) {
      // Execute constant-time dummy work to mitigate timing discrepancies
      this.constantTimeDummyWork(password);
      throw new AppError('Invalid username or password', 401, 'INVALID_CREDENTIALS');
    }

    // Fetch user profile from database
    let profile: UserProfileRecord | null = null;
    try {
      profile = await this.repo.getProfileById(authData.user.id);
    } catch {
      // On DB error, mask with identical invalid credentials
      this.constantTimeDummyWork(password);
      throw new AppError('Invalid username or password', 401, 'INVALID_CREDENTIALS');
    }

    if (!profile || profile.status !== 'active') {
      this.constantTimeDummyWork(password);
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

  async logout(userId: string): Promise<void> {
    try {
      const authClient = getAuthClient();
      await authClient.auth.signOut();
    } catch {
      // Graceful logout
    }
  }
}
