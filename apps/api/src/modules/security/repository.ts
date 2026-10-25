import { getAdminClient } from '../../lib/supabase/adminClient';
import { AppError } from '../../middleware/errorHandler';
import { logger } from '../../middleware/logger';
import { BanRecord, BanType, BanQueryFilter, AiSettings, DEFAULT_AI_SETTINGS } from './schema';
import { randomUUID } from 'crypto';

export interface ISecurityRepository {
  createBan(data: {
    id?: string;
    type: BanType;
    value: string;
    reason?: string | null;
    expires_at?: string | null;
    created_by?: string | null;
  }): Promise<BanRecord>;
  getBanById(id: string): Promise<BanRecord | null>;
  getBanByTypeAndValue(type: BanType, value: string): Promise<BanRecord | null>;
  listBans(filter?: BanQueryFilter): Promise<BanRecord[]>;
  deleteBan(id: string): Promise<boolean>;
  getActiveBans(): Promise<BanRecord[]>;
  getAiSettings(): Promise<AiSettings>;
  saveAiSettings(
    settings: AiSettings,
    auditInput: { actor_type: string; actor_id: string; ip?: string; device_id?: string | null; action?: string }
  ): Promise<AiSettings>;
}

export class SecurityRepository implements ISecurityRepository {
  async createBan(data: {
    id?: string;
    type: BanType;
    value: string;
    reason?: string | null;
    expires_at?: string | null;
    created_by?: string | null;
  }): Promise<BanRecord> {
    try {
      const adminClient = getAdminClient();
      const { data: dbData, error } = await adminClient
        .from('bans')
        .upsert(
          {
            ...(data.id ? { id: data.id } : {}),
            type: data.type,
            value: data.value,
            reason: data.reason || null,
            expires_at: data.expires_at || null,
            created_by: data.created_by || null,
            created_at: new Date().toISOString(),
          },
          { onConflict: 'type,value' }
        )
        .select()
        .single();

      if (error || !dbData) {
        logger.error({ error, data }, 'Database error creating/upserting ban');
        throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }

      return dbData as BanRecord;
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, data }, 'Unexpected error in createBan');
      throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
  }

  async getBanById(id: string): Promise<BanRecord | null> {
    try {
      const adminClient = getAdminClient();
      const { data, error } = await adminClient
        .from('bans')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error) {
        logger.error({ error, id }, 'Database error querying ban by id');
        throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }

      return (data as BanRecord) || null;
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, id }, 'Unexpected error in getBanById');
      throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
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

      if (error) {
        logger.error({ error, type, value }, 'Database error querying ban by type and value');
        throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }

      return (data as BanRecord) || null;
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, type, value }, 'Unexpected error in getBanByTypeAndValue');
      throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
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
        query = query.or(`expires_at.is.null,expires_at.gt.${nowIso}`);
      }

      const { data, error } = await query;
      if (error) {
        logger.error({ error, filter }, 'Database error listing bans');
        throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }

      return (data as BanRecord[]) || [];
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, filter }, 'Unexpected error in listBans');
      throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
  }

  async deleteBan(id: string): Promise<boolean> {
    try {
      const adminClient = getAdminClient();
      const { error, count } = await adminClient.from('bans').delete({ count: 'exact' }).eq('id', id);
      if (error) {
        logger.error({ error, id }, 'Database error deleting ban');
        throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }

      return (count ?? 1) > 0;
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, id }, 'Unexpected error in deleteBan');
      throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
  }

  async getActiveBans(): Promise<BanRecord[]> {
    return this.listBans({ active_only: true });
  }

  async getAiSettings(): Promise<AiSettings> {
    try {
      const adminClient = getAdminClient();
      const { data, error } = await adminClient
        .from('audit_logs')
        .select('metadata, created_at')
        .eq('entity', 'system_settings')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error || !data || !data.metadata) {
        return DEFAULT_AI_SETTINGS;
      }
      return {
        ...DEFAULT_AI_SETTINGS,
        ...(data.metadata as Partial<AiSettings>),
        updated_at: data.created_at,
      };
    } catch {
      return DEFAULT_AI_SETTINGS;
    }
  }

  async saveAiSettings(
    settings: AiSettings,
    auditInput: { actor_type: string; actor_id: string; ip?: string; device_id?: string | null; action?: string }
  ): Promise<AiSettings> {
    try {
      const adminClient = getAdminClient();
      const now = new Date().toISOString();
      const saved: AiSettings = { ...settings, updated_at: now };
      await adminClient.from('audit_logs').insert({
        id: randomUUID(),
        actor_type: auditInput.actor_type,
        actor_id: auditInput.actor_id,
        action: auditInput.action || 'AI_SETTINGS_UPDATED',
        entity: 'system_settings',
        entity_id: 'ai_calibration',
        ip: auditInput.ip || null,
        device_id: auditInput.device_id || null,
        metadata: saved as unknown as Record<string, unknown>,
        created_at: now,
      });
      return saved;
    } catch (err) {
      logger.warn({ err }, 'Failed to persist AI settings audit log');
      return settings;
    }
  }
}

let currentSecurityRepository: ISecurityRepository = new SecurityRepository();

export function setDefaultSecurityRepository(repo: ISecurityRepository): void {
  currentSecurityRepository = repo;
}

export const defaultSecurityRepository: ISecurityRepository = new Proxy(
  {} as unknown as ISecurityRepository,
  {
    get(_target, prop) {
      const val = Reflect.get(currentSecurityRepository, prop);
      if (typeof val === 'function') {
        return (val as (...args: unknown[]) => unknown).bind(currentSecurityRepository);
      }
      return val;
    },
    set(_target, prop, value) {
      return Reflect.set(currentSecurityRepository, prop, value);
    },
  }
);
