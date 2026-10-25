/**
 * apps/api/src/modules/face/schema.ts
 * Face Enrollment & Biometrics Zod Schemas per Master Prompt v3 Section 7.3
 */

import { z } from 'zod';

export const PoseTypeSchema = z.enum(['front', 'left', 'right', 'nod']);
export type PoseType = z.infer<typeof PoseTypeSchema>;

export const FaceEnrollmentFrameSchema = z.object({
  pose: PoseTypeSchema,
  embedding: z
    .array(z.number())
    .length(512, 'Each embedding must be exactly 512 dimensions')
    .refine(
      (arr) => arr.every((v) => !Number.isNaN(v) && Number.isFinite(v)),
      'Embedding values must be finite valid numbers'
    ),
  image_base64: z.string().optional(),
  jpeg_base64: z.string().optional(),
});
export type FaceEnrollmentFrame = z.infer<typeof FaceEnrollmentFrameSchema>;

export const FaceEnrollInputSchema = z
  .object({
    patient_id: z.string().min(1, 'patient_id is required'),
    model_version: z.string().min(1).default('adaface-ir50-v1'),
    frames: z
      .array(FaceEnrollmentFrameSchema)
      .length(10, 'Face enrollment requires exactly 10 frames (4 front, 2 left, 2 right, 2 nod)'),
    consent_id: z.string().optional(),
    ticket_id: z.string().optional(),
    ticket: z.string().optional(),
  })
  .transform((data) => ({
    ...data,
    ticket_id: data.ticket_id || data.ticket,
  }));
export type FaceEnrollInput = z.infer<typeof FaceEnrollInputSchema>;

export const KioskFaceEnrollSchema = z
  .object({
    patient_id: z.string().min(1, 'patient_id is required'),
    model_version: z.string().min(1).default('adaface-ir50-v1'),
    frames: z
      .array(FaceEnrollmentFrameSchema)
      .length(10, 'Face enrollment requires exactly 10 frames (4 front, 2 left, 2 right, 2 nod)'),
    ticket_id: z.string().optional(),
    ticket: z.string().optional(),
    consent_id: z.string().optional(),
  })
  .transform((data) => ({
    ...data,
    ticket_id: data.ticket_id || data.ticket,
  }));
export type KioskFaceEnrollInput = z.infer<typeof KioskFaceEnrollSchema>;
