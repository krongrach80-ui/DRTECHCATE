import { z } from 'zod';

export const createPairCodeSchema = z.object({
  kiosk_id: z.string().uuid('Invalid kiosk UUID'),
});

export const pairKioskSchema = z.object({
  kiosk_id: z.string().uuid('Invalid kiosk UUID'),
  code: z
    .string({ required_error: 'Pairing code is required' })
    .min(4, 'Pairing code must be at least 4 characters')
    .max(32, 'Pairing code must not exceed 32 characters'),
});

export type CreatePairCodeInput = z.infer<typeof createPairCodeSchema>;
export type PairKioskInput = z.infer<typeof pairKioskSchema>;
