import { z } from 'zod';

export const StaffRoleSchema = z.enum(['admin', 'pt']);
export type StaffRole = z.infer<typeof StaffRoleSchema>;

export const StaffStatusSchema = z.enum(['active', 'suspended', 'archived']);
export type StaffStatus = z.infer<typeof StaffStatusSchema>;

export const CreateStaffSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username cannot exceed 30 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain alphanumeric characters and underscores'),
  password: z
    .string()
    .min(12, 'Password must be at least 12 characters (Master Prompt v3 Section 6)'),
  role: StaffRoleSchema,
  full_name: z.string().trim().min(1, 'Full name is required').max(100),
  phone: z.string().trim().max(20).optional().nullable(),
  bio: z.string().trim().max(500).optional().nullable(),
  // PT specific fields
  license_no: z.string().trim().max(50).optional(),
  license_expiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional().nullable(),
  specialty: z.string().trim().max(100).optional().nullable(),
  age: z.coerce.number().int().min(18).max(100).optional().nullable(),
  sex: z.enum(['male', 'female', 'other']).optional().nullable(),
}).refine(
  (data) => {
    if (data.role === 'pt' && !data.license_no) {
      return false;
    }
    return true;
  },
  {
    message: 'Physiotherapist license number is required when role is pt',
    path: ['license_no'],
  }
);

export type CreateStaffInput = z.infer<typeof CreateStaffSchema>;

export const UpdateStaffSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3)
    .max(30)
    .regex(/^[a-zA-Z0-9_]+$/)
    .optional(),
  full_name: z.string().trim().min(1).max(100).optional(),
  phone: z.string().trim().max(20).optional().nullable(),
  bio: z.string().trim().max(500).optional().nullable(),
  role: StaffRoleSchema.optional(),
  status: StaffStatusSchema.optional(),
  // PT specific fields
  license_no: z.string().trim().max(50).optional(),
  license_expiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  specialty: z.string().trim().max(100).optional().nullable(),
  age: z.coerce.number().int().min(18).max(100).optional().nullable(),
  sex: z.enum(['male', 'female', 'other']).optional().nullable(),
});

export type UpdateStaffInput = z.infer<typeof UpdateStaffSchema>;

export const ResetPasswordSchema = z.object({
  password: z
    .string()
    .min(12, 'Password must be at least 12 characters (Master Prompt v3 Section 6)'),
});

export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>;

export const StaffQuerySchema = z.object({
  role: StaffRoleSchema.optional(),
  status: StaffStatusSchema.optional(),
  search: z.string().trim().optional(),
});

export type StaffQueryFilter = z.infer<typeof StaffQuerySchema>;

export interface StaffProfileRecord {
  id: string;
  role: StaffRole;
  username: string;
  full_name: string;
  phone: string | null;
  bio: string | null;
  avatar_url: string | null;
  status: StaffStatus;
  force_logout_at: string | null;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
  pt_details?: {
    license_no: string;
    license_expiry: string | null;
    specialty: string | null;
    age: number | null;
    sex: string | null;
  } | null;
}
