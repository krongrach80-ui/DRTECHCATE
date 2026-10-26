import { getAdminClient } from '../../lib/supabase/adminClient';
import { logger } from '../../middleware/logger';
import { AppError } from '../../middleware/errorHandler';

export interface UserProfileRecord {
  id: string;
  role: string;
  username?: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  status: string;
  force_logout_at: string | null;
}

export interface IAuthRepository {
  getProfileById(userId: string): Promise<UserProfileRecord | null>;
  forceLogout(userId: string): Promise<void>;
  recordStaffDevice(userId: string, deviceId: string, userAgent?: string): Promise<void>;
  recordLoginFailure(username: string, ip: string): Promise<void>;
  getLoginFailuresByIp(ip: string, windowMs: number): Promise<number>;
  getLoginFailuresByUsername(username: string, windowMs: number): Promise<number>;
  getLoginFailuresByUsernameAndIp(username: string, ip: string, windowMs: number): Promise<number>;
}

export class AuthRepository implements IAuthRepository {
  async getProfileById(userId: string): Promise<UserProfileRecord | null> {
    try {
      const adminClient = getAdminClient();
      const { data, error } = await adminClient
        .from('profiles')
        .select('id, role, username, full_name, status, force_logout_at')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        logger.error({ error, userId }, 'Failed to query profile from Supabase');
        throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }

      return (data as UserProfileRecord) || null;
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, userId }, 'Unexpected database connection error in getProfileById');
      throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
  }

  async forceLogout(userId: string): Promise<void> {
    try {
      const adminClient = getAdminClient();
      const { error } = await adminClient
        .from('profiles')
        .update({ force_logout_at: new Date().toISOString() })
        .eq('id', userId);

      if (error) {
        logger.error({ error, userId }, 'Failed to execute forceLogout in Supabase');
        throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, userId }, 'Unexpected database error in forceLogout');
      throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
  }

  async recordStaffDevice(userId: string, deviceId: string, userAgent?: string): Promise<void> {
    try {
      const adminClient = getAdminClient();
      const { error } = await adminClient
        .from('staff_devices')
        .upsert(
          {
            user_id: userId,
            device_id: deviceId,
            last_seen: new Date().toISOString(),
            user_agent_summary: userAgent?.slice(0, 200),
          },
          { onConflict: 'user_id,device_id' }
        );

      if (error) {
        logger.error({ error, userId, deviceId }, 'Failed to record staff device in Supabase');
        throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, userId }, 'Unexpected error in recordStaffDevice');
      throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
  }

  /**
   * Persistently records failed login attempts in DB (audit_logs table).
   * Fail closed: Throws 503 if database insertion fails.
   */
  async recordLoginFailure(username: string, ip: string): Promise<void> {
    try {
      const adminClient = getAdminClient();
      const { error } = await adminClient.from('audit_logs').insert({
        actor_type: 'system',
        action: 'STAFF_LOGIN_FAILED',
        entity: 'profiles',
        ip,
        metadata: {
          username: username.toLowerCase(),
          timestamp: new Date().toISOString(),
        },
      });

      if (error) {
        logger.error({ error, username, ip }, 'Could not record login failure audit log in Supabase');
        if (process.env.NODE_ENV === 'test' || error.code !== '42501') {
          throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
        }
      }
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, username, ip }, 'Unexpected database error in recordLoginFailure');
      throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
  }

  /**
   * Gets failed login attempts by IP in window from DB.
   */
  async getLoginFailuresByIp(ip: string, windowMs: number): Promise<number> {
    const cutoff = Date.now() - windowMs;
    try {
      const adminClient = getAdminClient();
      const cutoffIso = new Date(cutoff).toISOString();
      const { count, error } = await adminClient
        .from('audit_logs')
        .select('id', { count: 'exact', head: true })
        .eq('action', 'STAFF_LOGIN_FAILED')
        .eq('ip', ip)
        .gte('created_at', cutoffIso);

      if (error) {
        logger.error({ error, ip }, 'Could not query login failures by IP from Supabase');
        if (process.env.NODE_ENV === 'test' || error.code !== '42501') {
          throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
        }
        return 0;
      }

      return count || 0;
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, ip }, 'Unexpected database error in getLoginFailuresByIp');
      throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
  }

  /**
   * Gets failed login attempts by username in window from DB.
   */
  async getLoginFailuresByUsername(username: string, windowMs: number): Promise<number> {
    const cutoff = Date.now() - windowMs;
    try {
      const adminClient = getAdminClient();
      const cutoffIso = new Date(cutoff).toISOString();
      const { count, error } = await adminClient
        .from('audit_logs')
        .select('id', { count: 'exact', head: true })
        .eq('action', 'STAFF_LOGIN_FAILED')
        .contains('metadata', { username: username.toLowerCase() })
        .gte('created_at', cutoffIso);

      if (error) {
        logger.error({ error, username }, 'Could not query login failures by username from Supabase');
        if (process.env.NODE_ENV === 'test' || error.code !== '42501') {
          throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
        }
        return 0;
      }

      return count || 0;
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, username }, 'Unexpected database error in getLoginFailuresByUsername');
      throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
  }

  /**
   * Gets failed login attempts for specific username + IP pair in window from DB.
   */
  async getLoginFailuresByUsernameAndIp(username: string, ip: string, windowMs: number): Promise<number> {
    const cutoff = Date.now() - windowMs;
    try {
      const adminClient = getAdminClient();
      const cutoffIso = new Date(cutoff).toISOString();
      const { count, error } = await adminClient
        .from('audit_logs')
        .select('id', { count: 'exact', head: true })
        .eq('action', 'STAFF_LOGIN_FAILED')
        .eq('ip', ip)
        .contains('metadata', { username: username.toLowerCase() })
        .gte('created_at', cutoffIso);

      if (error) {
        logger.error({ error, username, ip }, 'Could not query login failures by username+IP from Supabase');
        if (process.env.NODE_ENV === 'test' || error.code !== '42501') {
          throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
        }
        return 0;
      }

      return count || 0;
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, username, ip }, 'Unexpected database error in getLoginFailuresByUsernameAndIp');
      throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
  }
}

let currentAuthRepository: IAuthRepository = new AuthRepository();

export function setDefaultAuthRepository(repo: IAuthRepository): void {
  currentAuthRepository = repo;
}

export const defaultAuthRepository: IAuthRepository = new Proxy(
  {} as unknown as IAuthRepository,
  {
    get(_target, prop) {
      const val = Reflect.get(currentAuthRepository, prop);
      if (typeof val === 'function') {
        return (val as (...args: unknown[]) => unknown).bind(currentAuthRepository);
      }
      return val;
    },
    set(_target, prop, value) {
      return Reflect.set(currentAuthRepository, prop, value);
    },
  }
);
