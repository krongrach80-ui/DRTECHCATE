import { getAdminClient } from '../../lib/supabase/adminClient';

export interface UserProfileRecord {
  id: string;
  role: string;
  first_name: string;
  last_name: string;
  status: string;
  force_logout_at: string | null;
}

export class AuthRepository {
  async getProfileById(userId: string): Promise<UserProfileRecord | null> {
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
  }

  async recordStaffDevice(userId: string, deviceId: string, userAgent?: string): Promise<void> {
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
  }
}
