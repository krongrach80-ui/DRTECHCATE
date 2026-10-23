import { getAdminClient } from '../../lib/supabase/adminClient';
import { AppError } from '../../middleware/errorHandler';
import { logger } from '../../middleware/logger';
import { BanRecord, BanType, BanQueryFilter } from './schema';

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
