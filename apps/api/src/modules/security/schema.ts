import { z } from 'zod';

export const BanTypeSchema = z.enum(['ip', 'device', 'account']);
export type BanType = z.infer<typeof BanTypeSchema>;

export const BanCreateSchema = z.object({
  type: BanTypeSchema,
  value: z.string().trim().min(1, 'Ban target value cannot be empty').max(255),
  reason: z.string().max(500).optional(),
  expires_at: z
    .string()
    .datetime({ offset: true })
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?)?$/))
    .optional()
    .nullable(),
});

export type BanCreateInput = z.infer<typeof BanCreateSchema>;

export const BanQuerySchema = z.object({
  type: BanTypeSchema.optional(),
  active_only: z.coerce.boolean().default(false),
});

export type BanQueryFilter = z.infer<typeof BanQuerySchema>;

export interface BanRecord {
  id: string;
  type: BanType;
  value: string;
  reason: string | null;
  expires_at: string | null;
  created_by: string | null;
  created_at: string;
}
