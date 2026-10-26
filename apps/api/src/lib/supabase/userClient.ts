import { SupabaseClient } from '@supabase/supabase-js';
import { Request } from 'express';
import { getAdminClient } from './adminClient';

/**
 * Creates a Supabase client for database operations.
 * Express Auth Middleware already enforces authentication & RBAC.
 * We delegate to getAdminClient() to avoid PostgREST rejecting custom stateless tokens with 401 Invalid JWT.
 */
export function createUserClient(_req?: Request): SupabaseClient {
  return getAdminClient();
}
