import { randomUUID } from 'crypto';
import { getAdminClient } from '../../lib/supabase/adminClient';
import { AuditWriteInput, AuditQueryFilter, AuditLogRecord } from './schema';
import { logger } from '../../middleware/logger';
import { AppError } from '../../middleware/errorHandler';

export interface IAuditRepository {
  write(input: AuditWriteInput): Promise<AuditLogRecord>;
  query(filter: AuditQueryFilter): Promise<{ logs: AuditLogRecord[]; total: number }>;
  clearInMemoryLogs(): void;
}

export class AuditRepository implements IAuditRepository {
  /**
   * Persistently appends an audit log into the DB audit_logs table (insert-only).
   * Fail closed: Throws 503 if database insertion fails.
   */
  async write(input: AuditWriteInput): Promise<AuditLogRecord> {
    const recordId = randomUUID();
    const createdAt = new Date().toISOString();

    try {
      const adminClient = getAdminClient();
      const { data, error } = await adminClient
        .from('audit_logs')
        .insert({
          id: recordId,
          actor_type: input.actor_type,
          actor_id: input.actor_id || null,
          action: input.action,
          entity: input.entity,
          entity_id: input.entity_id || null,
          ip: input.ip || null,
          device_id: input.device_id || null,
          metadata: input.metadata || {},
          created_at: createdAt,
        })
        .select()
        .single();

      if (error) {
        logger.error({ error, action: input.action, entity: input.entity }, 'Failed to insert audit log in Supabase');
        throw new AppError('Audit service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }

      return data as AuditLogRecord;
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, action: input.action, entity: input.entity }, 'Unexpected database connection error in audit write');
      throw new AppError('Audit service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
  }

  /**
   * Queries audit logs with pagination and filters (actor, action, date range).
   * Fail closed: Throws 503 if database query fails.
   */
  async query(filter: AuditQueryFilter): Promise<{ logs: AuditLogRecord[]; total: number }> {
    const page = filter.page || 1;
    const limit = filter.limit || 50;
    const offset = (page - 1) * limit;

    try {
      const adminClient = getAdminClient();
      let query = adminClient
        .from('audit_logs')
        .select('*', { count: 'exact' });

      if (filter.actor_id) {
        query = query.eq('actor_id', filter.actor_id);
      }
      if (filter.action) {
        query = query.eq('action', filter.action);
      }
      if (filter.entity) {
        query = query.eq('entity', filter.entity);
      }
      if (filter.from) {
        query = query.gte('created_at', filter.from);
      }
      if (filter.to) {
        query = query.lte('created_at', filter.to);
      }

      query = query
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      const { data, count, error } = await query;

      if (error) {
        logger.error({ error, filter }, 'Failed to query audit logs from Supabase');
        throw new AppError('Audit service unavailable', 503, 'SERVICE_UNAVAILABLE');
      }

      return {
        logs: (data as AuditLogRecord[]) || [],
        total: count ?? (data?.length || 0),
      };
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err, filter }, 'Unexpected database error in audit query');
      throw new AppError('Audit service unavailable', 503, 'SERVICE_UNAVAILABLE');
    }
  }

  clearInMemoryLogs(): void {
    // No-op in fail-closed architecture; provided for backwards compatibility in test suites
  }
}

let currentAuditRepository: IAuditRepository = new AuditRepository();

export function setDefaultAuditRepository(repo: IAuditRepository): void {
  currentAuditRepository = repo;
}

export const defaultAuditRepository: IAuditRepository = new Proxy(
  {} as unknown as IAuditRepository,
  {
    get(_target, prop) {
      const val = Reflect.get(currentAuditRepository, prop);
      if (typeof val === 'function') {
        return (val as (...args: unknown[]) => unknown).bind(currentAuditRepository);
      }
      return val;
    },
    set(_target, prop, value) {
      return Reflect.set(currentAuditRepository, prop, value);
    },
  }
);
