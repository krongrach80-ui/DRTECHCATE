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
    adminClientInstance = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }
  return adminClientInstance;
}
