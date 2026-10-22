import { getAdminClient } from '../../lib/supabase/adminClient';

export interface UserProfileRecord {
  id: string;
  role: string;
  first_name: string;
  last_name: string;
  status: string;
  force_logout_at: string | null;
}

export interface FailedLoginEntry {
  username: string;
  ip: string;
  timestamp: number;
}

export class AuthRepository {
  // In-memory store for test/offline mirroring
  private loginFailures: FailedLoginEntry[] = [];

  async getProfileById(userId: string): Promise<UserProfileRecord | null> {
    try {
      const adminClient = getAdminClient();
      const { data, error } = await adminClient
        .from('profiles')
        .select('id, role, first_name, last_name, status, force_logout_at')
        .eq('id', userId)
        .maybeSingle();

      if (error || !data) {
        return null;
      }

      return data as UserProfileRecord;
    } catch {
      return null;
    }
  }

  async recordStaffDevice(userId: string, deviceId: string, userAgent?: string): Promise<void> {
    try {
      const adminClient = getAdminClient();
      await adminClient
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
    } catch {
      // Non-blocking
    }
  }

  /**
   * Persistently records failed login attempts in DB (audit_logs table)
   */
  async recordLoginFailure(username: string, ip: string): Promise<void> {
    const now = Date.now();
    this.loginFailures.push({ username, ip, timestamp: now });

    try {
      const adminClient = getAdminClient();
      await adminClient.from('audit_logs').insert({
        actor_type: 'system',
        action: 'STAFF_LOGIN_FAILED',
        entity: 'profiles',
        ip,
        metadata: {
          username: username.toLowerCase(),
          timestamp: new Date().toISOString(),
        },
      });
    } catch {
      // Fallback in offline/mock test environment
    }
  }

  /**
   * Gets failed login attempts by IP in window from DB
   */
  async getLoginFailuresByIp(ip: string, windowMs: number): Promise<number> {
    const cutoff = Date.now() - windowMs;
    try {
      const adminClient = getAdminClient();
      const cutoffIso = new Date(cutoff).toISOString();
      const { count } = await adminClient
        .from('audit_logs')
        .select('id', { count: 'exact', head: true })
        .eq('action', 'STAFF_LOGIN_FAILED')
        .eq('ip', ip)
        .gte('created_at', cutoffIso);

      if (typeof count === 'number' && count > 0) {
        return count;
      }
    } catch {
      // Fallback
    }

    return this.loginFailures.filter((f) => f.ip === ip && f.timestamp >= cutoff).length;
  }

  /**
   * Gets failed login attempts by username in window from DB
   */
  async getLoginFailuresByUsername(username: string, windowMs: number): Promise<number> {
    const cutoff = Date.now() - windowMs;
    try {
      const adminClient = getAdminClient();
      const cutoffIso = new Date(cutoff).toISOString();
      const { count } = await adminClient
        .from('audit_logs')
        .select('id', { count: 'exact', head: true })
        .eq('action', 'STAFF_LOGIN_FAILED')
        .contains('metadata', { username: username.toLowerCase() })
        .gte('created_at', cutoffIso);

      if (typeof count === 'number' && count > 0) {
        return count;
      }
    } catch {
      // Fallback
    }

    return this.loginFailures.filter(
      (f) => f.username.toLowerCase() === username.toLowerCase() && f.timestamp >= cutoff
    ).length;
  }

  clearFailures(): void {
    this.loginFailures = [];
  }
}
