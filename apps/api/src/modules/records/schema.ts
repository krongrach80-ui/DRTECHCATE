/**
 * apps/api/src/modules/records/schema.ts
 * Zod schemas and TypeScript interfaces for Medical Records (Notes & Versioned Treatment Results)
 * Conforms to Master Prompt v3 System 9 (Line 353-358) & Locked Decision #2.
 */

import { z } from 'zod';

export const createMedicalNoteSchema = z.object({
  body: z
    .string({ message: 'Note content is required' })
    .trim()
    .min(1, 'Note content cannot be empty')
    .max(10000, 'Note content must not exceed 10000 characters'),
});

export type CreateMedicalNoteInput = z.infer<typeof createMedicalNoteSchema>;

export const createTreatmentResultSchema = z.object({
  body: z
    .string({ message: 'Treatment result content is required' })
    .trim()
    .min(1, 'Treatment result content cannot be empty')
    .max(10000, 'Treatment result content must not exceed 10000 characters'),
  supersedes_id: z
    .string()
    .uuid('supersedes_id must be a valid UUID')
    .optional()
    .nullable(),
});

export type CreateTreatmentResultInput = z.infer<typeof createTreatmentResultSchema>;

export interface MedicalNoteRecord {
  id: string;
  patient_id: string;
  author_id: string;
  body: string;
  created_at: string;
  author?: {
    id: string;
    full_name: string;
    role: string;
  } | null;
}

export interface TreatmentResultRecord {
  id: string;
  patient_id: string;
  version: number;
  body: string;
  author_id: string;
  supersedes_id: string | null;
  created_at: string;
  author?: {
    id: string;
    full_name: string;
    role: string;
  } | null;
}
