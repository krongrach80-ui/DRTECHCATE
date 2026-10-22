import { createAdminClient } from '@/lib/supabase/admin';

export interface AuditLogParams {
  actor_id?: string | null;
  action: string;
  entity: string;
  entity_id?: string | null;
  ip?: string | null;
  user_agent?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Record an append-only audit log entry directly via Supabase Service Role
 */
export async function recordAuditLog(params: AuditLogParams): Promise<void> {
  try {
    const adminClient = createAdminClient();
    
    // Ensure sensitive data like embeddings or passwords are never logged
    const sanitizedMetadata = { ...(params.metadata || {}) };
    delete sanitizedMetadata.password;
    delete sanitizedMetadata.embedding;
    delete sanitizedMetadata.token;

    const { error } = await adminClient.from('audit_logs').insert({
      actor_id: params.actor_id || null,
      action: params.action,
      entity: params.entity,
      entity_id: params.entity_id || null,
      ip: params.ip || null,
      user_agent: params.user_agent || null,
      metadata: sanitizedMetadata,
    });

    if (error) {
      console.error('Failed to record audit log:', error.message);
    }
  } catch (err) {
    // Audit logging failure should not crash request but must be reported
    console.error('Error recording audit log:', err);
  }
}
