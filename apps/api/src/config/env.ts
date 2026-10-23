import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

// Load environment files
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// Strict helper for positive ratio between 0 (exclusive) and 1 (inclusive)
// Rejects: empty string "", 0, negative values, and non-numbers
const strictPositiveRatio = (fieldName: string) =>
  z.preprocess(
    (val) => (val === '' || val === null || val === undefined ? undefined : val),
    z.coerce
      .number({ message: `${fieldName} must be a number` })
      .gt(0, { message: `${fieldName} must be strictly greater than 0 (cannot be 0 or negative)` })
      .lte(1, { message: `${fieldName} must be less than or equal to 1.0` })
  );

const strictPositiveInt = (fieldName: string) =>
  z.preprocess(
    (val) => (val === '' || val === null || val === undefined ? undefined : val),
    z.coerce
      .number({ message: `${fieldName} must be an integer` })
      .int({ message: `${fieldName} must be an integer` })
      .gt(0, { message: `${fieldName} must be strictly greater than 0` })
  );

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().default(4000),

    // Supabase Configuration
    SUPABASE_URL: z.string().url().or(z.string().min(1)),
    SUPABASE_ANON_KEY: z.string().min(1),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).default('dummy-service-role-key-for-test'),

    // Application Domain & URLs
    INTERNAL_EMAIL_DOMAIN: z.string().min(1).default('clinic.internal'),
    APP_URL: z.string().url().default('http://localhost:3000'),
    CORS_ORIGINS: z.string().default('http://localhost:3000,http://localhost:5173'),
    KIOSK_PAIRING_SECRET: z
      .string()
      .min(16, 'KIOSK_PAIRING_SECRET must be at least 16 characters')
      .default('kiosk-pairing-hmac-secret-min-16-chars-for-dev'),
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(1),
    HOSPITAL_IPS: z.string().default('127.0.0.1,::1,localhost'),

    // Biometric Calibration (Master Prompt v3 - Section 11 & match_face_candidates)
    // NOTE: Values operate in COSINE SIMILARITY space (score = 1.0 - cosine_distance).
    // Range is [-1.0, 1.0], where 1.0 = identical face. Higher score means MORE SIMILAR.
    // In Similarity space: 0 < FACE_T_REJECT < FACE_T_ACCEPT < FACE_T_DUPLICATE <= 1.0
    // Rejects empty string, 0, negative, and out-of-order thresholds.
    FACE_T_ACCEPT: strictPositiveRatio('FACE_T_ACCEPT'),
    FACE_T_REJECT: strictPositiveRatio('FACE_T_REJECT'),
    FACE_T_MARGIN: strictPositiveRatio('FACE_T_MARGIN'),
    FACE_T_ENROLL_CONSISTENCY: strictPositiveRatio('FACE_T_ENROLL_CONSISTENCY'),
    FACE_T_DUPLICATE: strictPositiveRatio('FACE_T_DUPLICATE'),
    FACE_CHALLENGE_EXPIRE_SECONDS: strictPositiveInt('FACE_CHALLENGE_EXPIRE_SECONDS'),
  })
  .refine((data) => data.FACE_T_REJECT < data.FACE_T_ACCEPT, {
    message: 'threshold order violation: Similarity space invariant: FACE_T_REJECT must be strictly less than FACE_T_ACCEPT',
    path: ['FACE_T_REJECT'],
  })
  .refine((data) => data.FACE_T_ACCEPT < data.FACE_T_DUPLICATE, {
    message: 'threshold order violation: Similarity space invariant: FACE_T_ACCEPT must be strictly less than FACE_T_DUPLICATE',
    path: ['FACE_T_DUPLICATE'],
  })
  .refine((data) => data.FACE_T_MARGIN > 0, {
    message: 'FACE_T_MARGIN must be strictly greater than 0',
    path: ['FACE_T_MARGIN'],
  });

export type Env = z.infer<typeof envSchema>;

export function parseEnv(rawEnv: Record<string, unknown> = process.env): Env {
  // Map aliases / NEXT_PUBLIC_* equivalents if needed
  const normalized = {
    ...rawEnv,
    SUPABASE_URL: rawEnv.SUPABASE_URL || rawEnv.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_ANON_KEY: rawEnv.SUPABASE_ANON_KEY || rawEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    FACE_T_ACCEPT: rawEnv.FACE_T_ACCEPT !== undefined ? rawEnv.FACE_T_ACCEPT : rawEnv.FACE_SIMILARITY_THRESHOLD,
    FACE_T_REJECT:
      rawEnv.FACE_T_REJECT !== undefined
        ? rawEnv.FACE_T_REJECT
        : rawEnv.FACE_SIMILARITY_THRESHOLD
        ? Number(rawEnv.FACE_SIMILARITY_THRESHOLD) - 0.15
        : undefined,
    FACE_T_MARGIN: rawEnv.FACE_T_MARGIN !== undefined ? rawEnv.FACE_T_MARGIN : rawEnv.FACE_MATCH_MARGIN,
    FACE_T_ENROLL_CONSISTENCY:
      rawEnv.FACE_T_ENROLL_CONSISTENCY !== undefined
        ? rawEnv.FACE_T_ENROLL_CONSISTENCY
        : rawEnv.NODE_ENV === 'test'
        ? 0.75
        : undefined,
    FACE_T_DUPLICATE:
      rawEnv.FACE_T_DUPLICATE !== undefined
        ? rawEnv.FACE_T_DUPLICATE
        : rawEnv.NODE_ENV === 'test'
        ? 0.85
        : undefined,
  };

  const parsed = envSchema.safeParse(normalized);
  if (!parsed.success) {
    const errorDetails = parsed.error.issues
      .map((i) => ` - [${i.path.join('.')}]: ${i.message}`)
      .join('\n');
    console.error('FATAL: Invalid environment variables:\n' + errorDetails);
    throw new Error('Environment validation failed:\n' + errorDetails);
  }

  return parsed.data;
}

// Global cached env instance (lazy or exported)
let cachedEnv: Env | null = null;
export function getEnv(): Env {
  if (!cachedEnv) {
    cachedEnv = parseEnv();
  }
  return cachedEnv;
}
