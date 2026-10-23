import { randomUUID } from 'crypto';
import { getAdminClient } from '../../lib/supabase/adminClient';
import { BanRecord, BanType, BanQueryFilter } from './schema';

export class SecurityRepository {
  private inMemoryBans: Map<string, BanRecord> = new Map();

  clearInMemoryBans(): void {
    this.inMemoryBans.clear();
  }

  /**
   * Persists a ban in the bans table or updates if already exists (upsert).
   */
  async createBan(data: {
    id?: string;
    type: BanType;
    value: string;
    reason?: string | null;
    expires_at?: string | null;
    created_by?: string | null;
  }): Promise<BanRecord> {
    const record: BanRecord = {
      id: data.id || randomUUID(),
      type: data.type,
      value: data.value,
      reason: data.reason || null,
      expires_at: data.expires_at || null,
      created_by: data.created_by || null,
      created_at: new Date().toISOString(),
    };

    // Keep in memory
    this.inMemoryBans.set(record.id, record);

    try {
      const adminClient = getAdminClient();
      const { data: dbData, error } = await adminClient
        .from('bans')
        .upsert(
          {
            id: record.id,
            type: record.type,
            value: record.value,
            reason: record.reason,
            expires_at: record.expires_at,
            created_by: record.created_by,
            created_at: record.created_at,
          },
          { onConflict: 'type,value' }
        )
        .select()
        .single();

      if (!error && dbData) {
        const result = dbData as BanRecord;
        this.inMemoryBans.set(result.id, result);
        return result;
      }
    } catch {
      // In-memory fallback if database is offline or in unit tests
    }

    return record;
  }

  async getBanById(id: string): Promise<BanRecord | null> {
    try {
      const adminClient = getAdminClient();
      const { data, error } = await adminClient
        .from('bans')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (!error && data) {
        return data as BanRecord;
      }
    } catch {
      // fallback
    }

    return this.inMemoryBans.get(id) || null;
  }

  async getBanByTypeAndValue(type: BanType, value: string): Promise<BanRecord | null> {
    try {
      const adminClient = getAdminClient();
      const { data, error } = await adminClient
        .from('bans')
        .select('*')
        .eq('type', type)
        .eq('value', value)
        .maybeSingle();

      if (!error && data) {
        return data as BanRecord;
      }
    } catch {
      // fallback
    }

    for (const b of this.inMemoryBans.values()) {
      if (b.type === type && b.value === value) {
        return b;
      }
    }

    return null;
  }

  async listBans(filter?: BanQueryFilter): Promise<BanRecord[]> {
    try {
      const adminClient = getAdminClient();
      let query = adminClient.from('bans').select('*').order('created_at', { ascending: false });

      if (filter?.type) {
        query = query.eq('type', filter.type);
      }

      if (filter?.active_only) {
        const nowIso = new Date().toISOString();
        // active = expires_at is null OR expires_at > now
        query = query.or(`expires_at.is.null,expires_at.gt.${nowIso}`);
      }

      const { data, error } = await query;
      if (!error && data) {
        return data as BanRecord[];
      }
    } catch {
      // fallback
    }

    let results = Array.from(this.inMemoryBans.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    if (filter?.type) {
      results = results.filter((b) => b.type === filter.type);
    }

    if (filter?.active_only) {
      const now = Date.now();
      results = results.filter((b) => {
        if (!b.expires_at) return true;
        return new Date(b.expires_at).getTime() > now;
      });
    }

    return results;
  }

  async deleteBan(id: string): Promise<boolean> {
    try {
      const adminClient = getAdminClient();
      const { error } = await adminClient.from('bans').delete().eq('id', id);
      if (!error) {
        this.inMemoryBans.delete(id);
        return true;
      }
    } catch {
      // fallback
    }

    const had = this.inMemoryBans.has(id);
    this.inMemoryBans.delete(id);
    return had;
  }

  async getActiveBans(): Promise<BanRecord[]> {
    return this.listBans({ active_only: true });
  }
}

export const defaultSecurityRepository = new SecurityRepository();

