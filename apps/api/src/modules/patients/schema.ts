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

export function normalizeCreatePatientInput(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object') return {};
  const obj = { ...(raw as Record<string, unknown>) };

  // 1. Automatically split fullName or name into first_name and last_name
  const fullName = (obj.fullName || obj.name || obj.full_name) as string | undefined;
  if (fullName && typeof fullName === 'string' && (!obj.first_name || String(obj.first_name).trim() === '')) {
    const parts = fullName.trim().split(/\s+/);
    obj.first_name = parts[0] || 'ผู้ป่วย';
    obj.last_name = parts.slice(1).join(' ') || '-';
  }

  if (obj.first_name && typeof obj.first_name === 'string') {
    obj.first_name = obj.first_name.trim();
  }
  if (!obj.first_name || String(obj.first_name).trim() === '') {
    obj.first_name = 'ผู้ป่วย';
  }

  if (obj.last_name && typeof obj.last_name === 'string') {
    obj.last_name = obj.last_name.trim();
  }
  if (!obj.last_name || String(obj.last_name).trim() === '') {
    obj.last_name = '-';
  }

  // 2. Normalize gender / sex if provided
  const rawSex = (obj.sex ?? obj.gender) as string | undefined;
  if (rawSex !== undefined && rawSex !== null && String(rawSex).trim() !== '') {
    const s = String(rawSex).trim().toLowerCase();
    if (s === 'male' || s === 'm' || s === 'ชาย') {
      obj.sex = 'male';
    } else if (s === 'female' || s === 'f' || s === 'หญิง') {
      obj.sex = 'female';
    } else {
      obj.sex = 'other';
    }
  }

  // 3. Fallbacks for empty string optional fields
  if (obj.injury === '') {
    obj.injury = '-';
  }
  if (obj.phone === '') {
    obj.phone = '-';
  }

  return obj;
}

// =========================================================================
// 2. PATIENT CRUD SCHEMAS
// =========================================================================
export const CreatePatientSchema = z.preprocess(
  normalizeCreatePatientInput,
  z.object({
    hn: z.string().trim().optional().nullable(),
    first_name: z.string().trim().min(1, 'First name is required').max(100),
    last_name: z.string().trim().min(1, 'Last name is required').max(100),
    age: z.coerce.number().int().min(0).max(150).optional().nullable(),
    sex: PatientSexSchema.optional().nullable(),
    phone: z.string().trim().max(30).optional().nullable(),
    injury: z.string().trim().max(500).optional().nullable(),
    history: z.record(z.string(), z.unknown()).optional().default({}),
    responsible_pt_id: z.string().trim().optional().nullable(),
    registered_via: PatientRegisteredViaSchema.optional().default('reception'),
  })
);

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
