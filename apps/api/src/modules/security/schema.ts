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

export interface AiSettings {
  cosine_similarity: number;
  margin_threshold: number;
  liveness_enabled: boolean;
  pose_confidence: number;
  landmark_visibility: number;
  rom_tolerance: number;
  max_trunk_lean: number;
  max_velocity: number;
  voice_guidance: boolean;
  his_cloud_sync: boolean;
  updated_at?: string;
}

export const DEFAULT_AI_SETTINGS: AiSettings = {
  cosine_similarity: 0.80,
  margin_threshold: 0.08,
  liveness_enabled: true,
  pose_confidence: 0.65,
  landmark_visibility: 0.55,
  rom_tolerance: 10,
  max_trunk_lean: 22,
  max_velocity: 220,
  voice_guidance: true,
  his_cloud_sync: true,
};

