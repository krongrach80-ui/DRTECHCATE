import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getEnv } from '../../config/env';

let adminClientInstance: SupabaseClient | null = null;

/**
 * Privileged Supabase client using SUPABASE_SERVICE_ROLE_KEY.
 * Must ONLY be used in modules explicitly authorized (e.g. audit, biometrics RPC, admin auth provisioning).
 */
export function getAdminClient(): SupabaseClient {
  if (!adminClientInstance) {
    const env = getEnv();
    const isPlaceholder =
      !env.SUPABASE_SERVICE_ROLE_KEY ||
      env.SUPABASE_SERVICE_ROLE_KEY.includes('placeholder') ||
      env.SUPABASE_SERVICE_ROLE_KEY.includes('bypass') ||
      env.SUPABASE_SERVICE_ROLE_KEY.includes('local-dev');
    const keyToUse = isPlaceholder ? env.SUPABASE_ANON_KEY : env.SUPABASE_SERVICE_ROLE_KEY;
    adminClientInstance = createClient(env.SUPABASE_URL, keyToUse, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }
  return adminClientInstance;
}

export function resetAdminClient(): void {
  adminClientInstance = null;
}
