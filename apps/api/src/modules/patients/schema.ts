import { z } from 'zod';

// =========================================================================
// 1. REGISTRATION STATE MACHINE & ENUMS
// =========================================================================
export const PatientRegistrationStatusSchema = z.enum([
  'awaiting_face',
  'face_enrolled',
  'active',
  'archived',
]);

export type PatientRegistrationStatus = z.infer<typeof PatientRegistrationStatusSchema>;

export const PatientSexSchema = z.enum(['male', 'female', 'other']);
export type PatientSex = z.infer<typeof PatientSexSchema>;

export const PatientRegisteredViaSchema = z.enum(['reception', 'kiosk']);
export type PatientRegisteredVia = z.infer<typeof PatientRegisteredViaSchema>;

// Helper for phone normalization
export function normalizePhone(rawPhone?: string | null): string | null {
  if (!rawPhone) return null;
  const digits = rawPhone.replace(/\D/g, '');
  if (digits.startsWith('66') && digits.length >= 11) {
    return '0' + digits.slice(2);
  }
  return digits;
}

// =========================================================================
// 2. PATIENT CRUD SCHEMAS
// =========================================================================
export const CreatePatientSchema = z.object({
  first_name: z.string().trim().min(1, 'First name is required').max(100),
  last_name: z.string().trim().min(1, 'Last name is required').max(100),
  age: z.coerce.number().int().min(0).max(150).optional().nullable(),
  sex: PatientSexSchema.optional().nullable(),
  phone: z.string().trim().max(30).optional().nullable(),
  injury: z.string().trim().max(500).optional().nullable(),
  history: z.record(z.string(), z.unknown()).optional().default({}),
  responsible_pt_id: z.string().trim().optional().nullable(),
  registered_via: PatientRegisteredViaSchema.optional().default('reception'),
});

export type CreatePatientInput = z.infer<typeof CreatePatientSchema>;

export const UpdatePatientSchema = z.object({
  first_name: z.string().trim().min(1).max(100).optional(),
  last_name: z.string().trim().min(1).max(100).optional(),
  age: z.coerce.number().int().min(0).max(150).optional().nullable(),
  sex: PatientSexSchema.optional().nullable(),
  phone: z.string().trim().max(30).optional().nullable(),
  injury: z.string().trim().max(500).optional().nullable(),
  history: z.record(z.string(), z.unknown()).optional(),
  responsible_pt_id: z.string().trim().optional().nullable(),
  registration_status: PatientRegistrationStatusSchema.optional(),
  // Optimistic locking: client sends the version it previously read
  version: z.coerce.number().int().min(1, 'Version is required for optimistic locking'),
});

export type UpdatePatientInput = z.infer<typeof UpdatePatientSchema>;

export const PatientQuerySchema = z.object({
  q: z.string().trim().optional(),
  status: PatientRegistrationStatusSchema.optional(),
  responsible_pt_id: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type PatientQueryFilter = z.infer<typeof PatientQuerySchema>;

// =========================================================================
// 3. SEND TO KIOSK & CHECKIN SCHEMAS
// =========================================================================
export const SendToKioskSchema = z.object({
  kiosk_id: z.string().trim().min(1, 'Kiosk ID is required'),
});

export type SendToKioskInput = z.infer<typeof SendToKioskSchema>;

export const CheckinSchema = z.object({
  kiosk_id: z.string().trim().optional().nullable(),
});

export type CheckinInput = z.infer<typeof CheckinSchema>;

// =========================================================================
// 4. RECORD INTERFACES
// =========================================================================
export interface PatientRecord {
  id: string;
  hn: string;
  first_name: string;
  last_name: string;
  age: number | null;
  sex: PatientSex | null;
  phone: string | null;
  history: Record<string, unknown>;
  injury: string | null;
  responsible_pt_id: string | null;
  registration_status: PatientRegistrationStatus;
  registered_via: PatientRegisteredVia;
  pending_expires_at: string | null;
  started_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  // Extra joined info
  responsible_pt?: {
    id: string;
    full_name: string;
    username: string;
  } | null;
}

export interface EnrollmentTicketRecord {
  id: string;
  patient_id: string;
  kiosk_id: string;
  created_by: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

export interface CheckinRecord {
  id: string;
  patient_id: string;
  kiosk_id: string | null;
  checked_in_by: string | null;
  date: string;
  created_at: string;
}
