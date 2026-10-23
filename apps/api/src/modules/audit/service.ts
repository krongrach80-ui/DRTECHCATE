import { AuditRepository, defaultAuditRepository } from './repository';
import { AuditWriteInput, AuditQueryFilter, AuditLogRecord } from './schema';
import { dispatchHospitalEvent } from '../events/routes';

// List of sensitive keys that must never appear in audit_logs metadata
const REDACTED_KEYS = new Set([
  'password',
  'token',
  'access_token',
  'refresh_token',
  'secret',
  'secret_key',
  'authorization',
  'pairing_secret',
  'probe',
  'embedding',
  'vector',
  'templates',
]);

/**
 * Recursively sanitizes metadata by redacting sensitive fields and face vectors.
 */
function sanitizeMetadata(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== 'object') {
    return {};
  }

  if (Array.isArray(data)) {
    return { items: data.map((item) => sanitizeMetadata(item)) };
  }

  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase();

    // 1. Mask arrays of floats (e.g. 512-dim face embeddings / probes)
    if (
      Array.isArray(value) &&
      value.length > 10 &&
      value.every((v) => typeof v === 'number')
    ) {
      sanitized[key] = `[EMBEDDING_VECTOR_${value.length}_DIM_REDACTED]`;
      continue;
    }

    // 2. Redact passwords, tokens, secret keys
    if (REDACTED_KEYS.has(lowerKey)) {
      sanitized[key] = '[REDACTED]';
      continue;
    }

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      sanitized[key] = sanitizeMetadata(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

export class AuditService {
  constructor(private repo: AuditRepository = defaultAuditRepository) {}

  /**
   * Records an audit log entry.
   * 1. Sanitizes sensitive metadata (passwords, tokens, embeddings)
   * 2. Appends to DB audit_logs table (insert-only)
   * 3. Dispatches real-time SSE event to admin listeners
   */
  async write(input: AuditWriteInput): Promise<AuditLogRecord> {
    const cleanMetadata = sanitizeMetadata(input.metadata);

    const record = await this.repo.write({
      ...input,
      metadata: cleanMetadata,
    });

    // Real-time broadcast to admin SSE listeners
    try {
      dispatchHospitalEvent({
        event: 'audit',
        data: record,
      });
    } catch {
      // Non-blocking SSE broadcast failure
    }

    return record;
  }

  /**
   * Queries audit logs with pagination and filters.
   */
  async query(filter: AuditQueryFilter): Promise<{ logs: AuditLogRecord[]; total: number }> {
    return this.repo.query(filter);
  }
}

export const defaultAuditService = new AuditService();

