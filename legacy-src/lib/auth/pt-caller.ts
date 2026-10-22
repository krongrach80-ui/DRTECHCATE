import { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';
import { Profile } from '@/types/database';

export interface VerifiedPtCaller {
  user: {
    id: string;
    email?: string;
  };
  profile: Profile;
}

/**
 * Verifies that the incoming request is authenticated and belongs to an active Physiotherapist (PT).
 * Returns the caller's profile and user object, or null if unauthorized.
 */
export async function verifyPtCaller(req: NextRequest): Promise<VerifiedPtCaller | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: () => {},
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const adminClient = createAdminClient();
  const { data: profile } = await adminClient
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'pt' || !profile.is_active) {
    return null;
  }

  return {
    user: {
      id: user.id,
      email: user.email,
    },
    profile: profile as Profile,
  };
}

/**
 * Checks if a patient is accessible by the PT (either primary assigned or through an active case transfer).
 */
export async function isPatientAccessibleByPt(ptId: string, patientId: string): Promise<boolean> {
  const adminClient = createAdminClient();

  // 1. Check primary assignment
  const { data: assignment } = await adminClient
    .from('patient_pt_assignments')
    .select('id')
    .eq('patient_id', patientId)
    .eq('pt_id', ptId)
    .maybeSingle();

  if (assignment) return true;

  // 2. Check active temporary case transfer (within date range)
  const today = new Date().toISOString().split('T')[0];
  const { data: transfer } = await adminClient
    .from('case_transfers')
    .select('id')
    .eq('patient_id', patientId)
    .eq('to_pt_id', ptId)
    .eq('status', 'active')
    .lte('start_date', today)
    .gte('end_date', today)
    .maybeSingle();

  if (transfer) return true;

  return false;
}
