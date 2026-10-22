import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Request } from 'express';
import { getEnv } from '../../config/env';

/**
 * Creates a Supabase client scoped to the caller's JWT token.
 * This ensures PostgreSQL Row-Level Security (RLS) is strictly enforced.
 */
export function createUserClient(req: Request): SupabaseClient {
  const env = getEnv();

  // Extract access token from HttpOnly cookie or Authorization header
  const token = req.cookies?.access_token ||
    (req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.slice(7)
      : undefined);

  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    },
  });
}
