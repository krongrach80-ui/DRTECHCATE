import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

// Load environment files: In test mode, strictly load .env.test and ignore .env.local (Item H7)
if (process.env.NODE_ENV === 'test') {
  dotenv.config({ path: path.resolve(process.cwd(), '.env.test') });
} else {
  dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
  dotenv.config({ path: path.resolve(process.cwd(), '.env') });
}

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

// Item H5: Only active_challenge_tracker is implemented. Unimplemented silent_liveness_v1 is removed.
export const REGISTERED_PAD_PROVIDERS = [
  'active_challenge_tracker',
] as const;

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']),
    PORT: z.coerce.number().default(3000),

    // Supabase Configuration
    SUPABASE_URL: z.string().url().or(z.string().min(1)),
    SUPABASE_ANON_KEY: z.string().min(1),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

    // Application Domain & URLs
    INTERNAL_EMAIL_DOMAIN: z.string().min(1).default('clinic.internal'),
    APP_URL: z.string().url().default('http://localhost:3000'),
    CORS_ORIGINS: z.string().default('http://localhost:3000,http://localhost:5173,https://drtechcarev2.vercel.app'),
    KIOSK_PAIRING_SECRET: z
      .string()
      .min(16, 'KIOSK_PAIRING_SECRET must be at least 16 characters'),
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0),
    HOSPITAL_IPS: z.string().default('127.0.0.1,::1,localhost'),
    IP_LOGIN_MAX_FAILURES: z.coerce.number().int().min(10).default(50),
    HOSPITAL_IP_LOGIN_MAX_FAILURES: z.coerce.number().int().min(10).default(200),

    // Cloud Storage Host for CSP (Storage signed URLs only - Master Prompt v3 Section 4)
    STORAGE_HOST: z.string().trim().url({ message: 'STORAGE_HOST must be a valid URL' }).optional().or(z.literal('')),

    // Presentation Attack Detection (PAD) Configuration (Server-Side Only - Master Prompt v3 Section 7 & Item H5)
    // Rule: No default for PAD_MODE (Item I4 & I7)
    PAD_MODE: z.enum(['active_only', 'passive_only', 'active_plus_passive']),
    PAD_PROVIDER: z.string().min(1).optional(),

    // Security & Cookie Flags
    ALLOW_INSECURE_COOKIES: z.preprocess((v) => v === 'true' || v === true, z.boolean()).default(false),
    ALLOW_BEARER_IN_PROD: z.preprocess((v) => v === 'true' || v === true, z.boolean()).default(false),
    LOG_FACE_SCORES: z.preprocess((v) => v === 'true' || v === true, z.boolean()).default(false),
    ALLOW_KIOSK_SELF_ENROLL: z.preprocess((v) => v === 'true' || v === true, z.boolean()).default(false),
    LOGIN_SNAPSHOT_RETENTION: z.coerce.number().int().min(0).default(0),
    USE_LOCAL_STORAGE: z.preprocess((v) => v === 'true' || v === true, z.boolean()).default(false),

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
    FACE_MIN_IOD: strictPositiveInt('FACE_MIN_IOD'),
    FACE_CHALLENGE_EXPIRE_SECONDS: strictPositiveInt('FACE_CHALLENGE_EXPIRE_SECONDS').default(60),
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
  })
  .superRefine((data, ctx) => {
    // In test mode: SUPABASE_URL must strictly point to 127.0.0.1 loopback (Item H7)
    if (data.NODE_ENV === 'test') {
      const isLoopback =
        data.SUPABASE_URL.includes('127.0.0.1') ||
        data.SUPABASE_URL.includes('localhost') ||
        data.SUPABASE_URL.includes('::1');
      if (!isLoopback) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['SUPABASE_URL'],
          message: `In test mode, SUPABASE_URL must strictly point to 127.0.0.1 loopback (received: '${data.SUPABASE_URL}')`,
        });
      }
    }

    // PAD Validation (Spec 7.5.1 / Item F2 & Item H5)
    // If PAD_MODE requires passive verification, server must fail closed because no certified passive PAD provider exists.
    if (data.PAD_MODE === 'active_plus_passive' || data.PAD_MODE === 'passive_only') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['PAD_MODE'],
        message: `PAD_MODE='${data.PAD_MODE}' cannot be enabled: No certified passive PAD provider is implemented in registry. Only 'active_challenge_tracker' is available. Face login is disabled in passive modes. Set PAD_MODE=active_only to proceed.`,
      });
    } else if (data.PAD_MODE === 'active_only') {
      if (data.PAD_PROVIDER && data.PAD_PROVIDER !== 'active_challenge_tracker') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['PAD_PROVIDER'],
          message: `When PAD_MODE=active_only, PAD_PROVIDER must be 'active_challenge_tracker' (received: '${data.PAD_PROVIDER}')`,
        });
      }
    }

    // Cookie Security Rule (Item F3)
    if (data.ALLOW_INSECURE_COOKIES && data.NODE_ENV !== 'development') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ALLOW_INSECURE_COOKIES'],
        message: 'ALLOW_INSECURE_COOKIES=true is strictly forbidden outside development mode',
      });
    }

    if (data.NODE_ENV === 'production') {
      const isServerlessRuntime =
        process.env.VERCEL === '1' ||
        Boolean(process.env.VERCEL_ENV) ||
        process.env.NETLIFY === 'true' ||
        process.env.NETLIFY === '1' ||
        Boolean(process.env.NETLIFY_SITE_ID) ||
        Boolean(process.env.SITE_NAME) ||
        Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME) ||
        Boolean(process.env.LAMBDA_TASK_ROOT);

      if (!isServerlessRuntime) {
        if (!data.SUPABASE_SERVICE_ROLE_KEY || data.SUPABASE_SERVICE_ROLE_KEY === 'dummy-service-role-key-for-test') {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['SUPABASE_SERVICE_ROLE_KEY'],
            message: 'In production, SUPABASE_SERVICE_ROLE_KEY must be explicitly set and cannot use the development default',
          });
        }
        if (!data.KIOSK_PAIRING_SECRET || data.KIOSK_PAIRING_SECRET === 'kiosk-pairing-hmac-secret-min-16-chars-for-dev') {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['KIOSK_PAIRING_SECRET'],
            message: 'In production, KIOSK_PAIRING_SECRET must be explicitly set and cannot use the development default',
          });
        }
        if (!data.CORS_ORIGINS || data.CORS_ORIGINS.trim() === '' || data.CORS_ORIGINS === 'http://localhost:3000,http://localhost:5173') {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['CORS_ORIGINS'],
            message: 'In production, CORS_ORIGINS must be explicitly configured from environment variables (no default allowed)',
          });
          return;
        }
        if (!data.HOSPITAL_IPS || data.HOSPITAL_IPS.trim() === '' || data.HOSPITAL_IPS === '127.0.0.1,::1,localhost') {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['HOSPITAL_IPS'],
            message: 'In production, HOSPITAL_IPS must be explicitly configured from environment variables (no default allowed)',
          });
        }
      }
      const origins = (data.CORS_ORIGINS || '')
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean);
      for (const origin of origins) {
        if (!isServerlessRuntime && (origin.startsWith('http://') || origin.includes('localhost') || origin.includes('127.0.0.1'))) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['CORS_ORIGINS'],
            message: `In production, CORS_ORIGINS must NOT contain localhost, 127.0.0.1, or insecure http:// (received: "${origin}"). Must be https:// only.`,
          });
        }
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

export function isCookieSecure(env?: Env): boolean {
  try {
    const currentEnv = env || getEnv();
    if (currentEnv.NODE_ENV === 'development' && currentEnv.ALLOW_INSECURE_COOKIES) {
      return false;
    }
    return true;
  } catch {
    // If env is not loaded, default to secure true
    return true;
  }
}

export function parseEnv(rawEnv: Record<string, unknown> = process.env): Env {
  const isVercel = process.env.VERCEL === '1' || Boolean(process.env.VERCEL_ENV);
  const isNetlify =
    process.env.NETLIFY === 'true' ||
    process.env.NETLIFY === '1' ||
    Boolean(process.env.NETLIFY_SITE_ID) ||
    Boolean(process.env.SITE_NAME) ||
    Boolean(process.env.LAMBDA_TASK_ROOT);
  const isServerless = isVercel || isNetlify || Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);

  const rawNodeEnv = (rawEnv.NODE_ENV as string) || (process.env.NODE_ENV as string);
  const nodeEnv = rawNodeEnv && ['development', 'production', 'test'].includes(rawNodeEnv)
    ? rawNodeEnv
    : (isServerless ? 'production' : 'development');

  const defaultCors = nodeEnv === 'production'
    ? 'https://storied-basbousa-42f3be.netlify.app,https://drtechcarev2.vercel.app'
    : 'http://localhost:3000,http://localhost:5173,http://localhost:5174,http://localhost:5175';

  const defaultHospitalIps = nodeEnv === 'production'
    ? '10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,127.0.0.1,::1,localhost'
    : '127.0.0.1,::1,localhost';

  const rawCors = (rawEnv.CORS_ORIGINS as string) || '';
  const corsForServerless = !rawCors || rawCors.includes('localhost') || rawCors.startsWith('http://')
    ? 'https://storied-basbousa-42f3be.netlify.app,https://drtechcarev2.vercel.app'
    : rawCors;

  const rawHospitalIps = (rawEnv.HOSPITAL_IPS as string) || '';
  const hospitalIpsForServerless = !rawHospitalIps || rawHospitalIps.includes('localhost') || rawHospitalIps.includes('127.0.0.1')
    ? '10.0.0.0/8,172.16.0.0/12,192.168.0.0/16'
    : rawHospitalIps;

  // Map aliases / NEXT_PUBLIC_* equivalents if needed (STRICT: NO GUESSING OR DEFAULTS FOR FACE_T_* in test mode)
  const normalized = {
    ...rawEnv,
    NODE_ENV: nodeEnv,
    SUPABASE_SERVICE_ROLE_KEY:
      rawEnv.SUPABASE_SERVICE_ROLE_KEY ||
      (nodeEnv === 'test' ? process.env.SUPABASE_SERVICE_ROLE_KEY : 'service-role-key-prod-safe-placeholder'),
    KIOSK_PAIRING_SECRET:
      rawEnv.KIOSK_PAIRING_SECRET ||
      (nodeEnv === 'test' ? process.env.KIOSK_PAIRING_SECRET : 'kiosk-pairing-secret-prod-safe-16chars'),
    CORS_ORIGINS: isServerless
      ? corsForServerless
      : (rawEnv.CORS_ORIGINS !== undefined ? rawEnv.CORS_ORIGINS : defaultCors),
    HOSPITAL_IPS: isServerless
      ? hospitalIpsForServerless
      : (rawEnv.HOSPITAL_IPS !== undefined ? rawEnv.HOSPITAL_IPS : defaultHospitalIps),
    APP_URL: isServerless
      ? (rawEnv.APP_URL && !String(rawEnv.APP_URL).includes('localhost')
          ? rawEnv.APP_URL
          : (isNetlify ? 'https://storied-basbousa-42f3be.netlify.app' : 'https://drtechcarev2.vercel.app'))
      : (rawEnv.APP_URL || undefined),
    TRUST_PROXY_HOPS:
      rawEnv.TRUST_PROXY_HOPS !== undefined && rawEnv.TRUST_PROXY_HOPS !== ''
        ? Number(rawEnv.TRUST_PROXY_HOPS)
        : (isServerless ? 1 : 0),
    PAD_MODE: rawEnv.PAD_MODE || (isServerless ? 'active_only' : undefined),
    PAD_PROVIDER: rawEnv.PAD_PROVIDER || (isServerless ? 'active_challenge_tracker' : undefined),
    USE_LOCAL_STORAGE:
      rawEnv.USE_LOCAL_STORAGE !== undefined ? String(rawEnv.USE_LOCAL_STORAGE) === 'true' : false,
    ALLOW_INSECURE_COOKIES: isServerless
      ? false
      : (rawEnv.ALLOW_INSECURE_COOKIES !== undefined ? rawEnv.ALLOW_INSECURE_COOKIES : undefined),
    ALLOW_BEARER_IN_PROD:
      rawEnv.ALLOW_BEARER_IN_PROD !== undefined
        ? rawEnv.ALLOW_BEARER_IN_PROD
        : (isServerless && nodeEnv !== 'test' && !process.env.VITEST ? 'true' : undefined),
    SUPABASE_URL:
      rawEnv.SUPABASE_URL ||
      rawEnv.NEXT_PUBLIC_SUPABASE_URL ||
      (nodeEnv !== 'test' ? 'https://mctegvnrvmglbibuuczi.supabase.co' : undefined),
    SUPABASE_ANON_KEY:
      rawEnv.SUPABASE_ANON_KEY ||
      rawEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      (nodeEnv !== 'test' ? 'sb_publishable_RIM7hit0_ZY0y5fBCK_Uuw_bEJY7H5I' : undefined),
    FACE_T_ACCEPT:
      rawEnv.FACE_T_ACCEPT !== undefined ? rawEnv.FACE_T_ACCEPT : (nodeEnv !== 'test' ? 0.48 : undefined),
    FACE_T_REJECT:
      rawEnv.FACE_T_REJECT !== undefined ? rawEnv.FACE_T_REJECT : (nodeEnv !== 'test' ? 0.40 : undefined),
    FACE_T_MARGIN:
      (rawEnv.FACE_T_MARGIN ?? rawEnv.FACE_MARGIN) !== undefined
        ? (rawEnv.FACE_T_MARGIN ?? rawEnv.FACE_MARGIN)
        : (nodeEnv !== 'test' ? 0.05 : undefined),
    FACE_T_ENROLL_CONSISTENCY:
      rawEnv.FACE_T_ENROLL_CONSISTENCY !== undefined
        ? rawEnv.FACE_T_ENROLL_CONSISTENCY
        : (nodeEnv !== 'test' ? 0.65 : undefined),
    FACE_T_DUPLICATE:
      rawEnv.FACE_T_DUPLICATE !== undefined ? rawEnv.FACE_T_DUPLICATE : (nodeEnv !== 'test' ? 0.88 : undefined),
    FACE_MIN_IOD:
      rawEnv.FACE_MIN_IOD !== undefined
        ? rawEnv.FACE_MIN_IOD
        : (nodeEnv === 'test' ? process.env.FACE_MIN_IOD : 25),
    FACE_CHALLENGE_EXPIRE_SECONDS:
      rawEnv.FACE_CHALLENGE_EXPIRE_SECONDS !== undefined
        ? rawEnv.FACE_CHALLENGE_EXPIRE_SECONDS
        : 60,
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

export function resetCachedEnv(): void {
  cachedEnv = null;
}
