import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getEnv } from '../../config/env';

let authClientInstance: SupabaseClient | null = null;

/**
 * Public auth client using SUPABASE_ANON_KEY.
 * Exclusively used for initial staff login via auth.signInWithPassword.
 */
export function getAuthClient(): SupabaseClient {
  if (!authClientInstance) {
    const env = getEnv();
    authClientInstance = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }
  return authClientInstance;
}
