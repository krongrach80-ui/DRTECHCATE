import { z } from 'zod';

export const AuditWriteSchema = z.object({
  actor_type: z.enum(['staff', 'kiosk', 'patient', 'system']),
  actor_id: z.string().uuid().optional().nullable(),
  action: z.string().min(1).max(100),
  entity: z.string().min(1).max(100),
  entity_id: z.string().optional().nullable(),
  ip: z.string().optional().nullable(),
  device_id: z.string().optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).default({}).optional(),
});

export type AuditWriteInput = z.infer<typeof AuditWriteSchema>;

export const AuditQueryFilterSchema = z.object({
  actor_id: z.string().uuid().optional(),
  action: z.string().min(1).optional(),
  entity: z.string().min(1).optional(),
  from: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)).optional(),
  to: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type AuditQueryFilter = z.infer<typeof AuditQueryFilterSchema>;

export interface AuditLogRecord {
  id: string;
  actor_type: string;
  actor_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  ip: string | null;
  device_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}
