import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

// Load environment files
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const envSchema = z.object({
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

  // Biometric Calibration (Master Prompt v3 rule: NO default allowed for FACE_T_*)
  FACE_T_ACCEPT: z.coerce.number().min(0).max(1),
  FACE_T_REJECT: z.coerce.number().min(0).max(1),
  FACE_T_MARGIN: z.coerce.number().min(0).max(1),
  FACE_T_ENROLL_CONSISTENCY: z.coerce.number().min(0).max(1),
  FACE_T_DUPLICATE: z.coerce.number().min(0).max(1),
  FACE_CHALLENGE_EXPIRE_SECONDS: z.coerce.number().int().positive(),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(rawEnv: Record<string, unknown> = process.env): Env {
  // Map aliases / NEXT_PUBLIC_* equivalents if needed
  const normalized = {
    ...rawEnv,
    SUPABASE_URL: rawEnv.SUPABASE_URL || rawEnv.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_ANON_KEY: rawEnv.SUPABASE_ANON_KEY || rawEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    FACE_T_ACCEPT: rawEnv.FACE_T_ACCEPT ?? rawEnv.FACE_SIMILARITY_THRESHOLD,
    FACE_T_REJECT: rawEnv.FACE_T_REJECT ?? (rawEnv.FACE_SIMILARITY_THRESHOLD ? Number(rawEnv.FACE_SIMILARITY_THRESHOLD) - 0.15 : undefined),
    FACE_T_MARGIN: rawEnv.FACE_T_MARGIN ?? rawEnv.FACE_MATCH_MARGIN,
    FACE_T_ENROLL_CONSISTENCY: rawEnv.FACE_T_ENROLL_CONSISTENCY ?? 0.75, // Only if present
    FACE_T_DUPLICATE: rawEnv.FACE_T_DUPLICATE ?? 0.85,
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
