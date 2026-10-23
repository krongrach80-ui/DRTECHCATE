import { z } from 'zod';

// =========================================================================
// 1. KIOSK PAIRING SCHEMAS
// =========================================================================
export const createPairCodeSchema = z.object({
  kiosk_id: z.string().trim().min(1, 'Invalid kiosk ID'),
});

export const pairKioskSchema = z.object({
  kiosk_id: z.string().trim().min(1, 'Invalid kiosk ID'),
  code: z
    .string({ message: 'Pairing code is required' })
    .min(4, 'Pairing code must be at least 4 characters')
    .max(32, 'Pairing code must not exceed 32 characters'),
});

export type CreatePairCodeInput = z.infer<typeof createPairCodeSchema>;
export type PairKioskInput = z.infer<typeof pairKioskSchema>;

// =========================================================================
// 2. FACE AUTHENTICATION & CHALLENGE SCHEMAS
// =========================================================================
export const ChallengeRequestSchema = z.object({
  kiosk_id: z.string().trim().min(1, 'Kiosk ID is required'),
});

export type ChallengeRequestInput = z.infer<typeof ChallengeRequestSchema>;

export const VerifyFaceSchema = z.object({
  kiosk_id: z.string().trim().min(1, 'Kiosk ID is required'),
  nonce: z.string().trim().min(1, 'Challenge nonce is required'),
  probe: z
    .array(z.number())
    .length(512, 'Probe must be a 512-dimensional vector of numbers'),
  liveness_score: z.number().optional(),
});

export type VerifyFaceInput = z.infer<typeof VerifyFaceSchema>;

export const ConfirmIdentitySchema = z.object({
  session_token: z.string().trim().min(1, 'Session token is required'),
  confirmed: z.boolean(),
});

export type ConfirmIdentityInput = z.infer<typeof ConfirmIdentitySchema>;

// =========================================================================
// 2.1 DAILY MISSION SCHEMAS (Master Prompt v3 Section 9 & 14)
// =========================================================================
export const KioskPlanQuerySchema = z
  .object({
    kiosk_id: z.string().trim().optional(),
  })
  .strict();

export type KioskPlanQuery = z.infer<typeof KioskPlanQuerySchema>;

export const KioskMissionStepSchema = z
  .object({
    course_id: z.string().trim().min(1, 'Course ID is required'),
    step_type: z.enum(['exercise', 'minigame', 'rest']),
    ref_id: z.string().trim().optional(),
    score: z.any().optional(),
  })
  .strict();

export type KioskMissionStepInput = z.infer<typeof KioskMissionStepSchema>;

export const KioskFinishMissionSchema = z
  .object({
    course_id: z.string().trim().min(1, 'Course ID is required'),
  })
  .strict();

export type KioskFinishMissionInput = z.infer<typeof KioskFinishMissionSchema>;

// =========================================================================
// 3. RECORD TYPES
// =========================================================================
export interface ChallengeRecord {
  nonce: string;
  device_id: string;
  steps: string[];
  expires_at: Date;
  used_at: Date | null;
  created_at: Date;
}

export interface KioskSessionRecord {
  token: string;
  kiosk_id: string;
  patient_id: string;
  expires_at: Date;
  confirmed_at: Date | null;
  is_active: boolean;
  created_at: Date;
}

export interface StaffCallRecord {
  id: string;
  kiosk_id: string;
  reason: string;
  created_at: string;
  handled_by: string | null;
  handled_at: string | null;
}

export interface FaceTemplateRecord {
  id: string;
  patient_id: string;
  enrollment_id: string;
  embedding: number[];
  pose: 'front' | 'left' | 'right' | 'nod';
  model_version: string;
  created_at: string;
}
