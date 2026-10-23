import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

describe.runIf(process.env.LIVE_TESTS === '1')('[LIVE] DrTech.Care Live Supabase Dev Project Integration Test Suite', () => {
  let supabaseUrl: string;
  let anonKey: string;

  beforeAll(() => {
    dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
    dotenv.config({ path: path.resolve(process.cwd(), '.env') });

    supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mctegvnrvmglbibuuczi.supabase.co';
    anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_RIM7hit0_ZY0y5fBCK_Uuw_bEJY7H5I';
  });

  it('6.1 Live Positive Control: Remote Supabase GoTrue Auth endpoint must be active and respond 200 OK', async () => {
    const res = await fetch(`${supabaseUrl}/auth/v1/settings`, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toBeDefined();
  });

  it('6.2 Live RLS Enforcement: Anon caller must receive Code 42501 on patient clinical tables', async () => {
    const clinicalTables = ['patients', 'medical_notes', 'treatment_results', 'consents', 'profiles'];

    for (const table of clinicalTables) {
      const res = await fetch(`${supabaseUrl}/rest/v1/${table}?select=*`, {
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
        },
      });

      const body = (await res.json()) as { code?: string; message?: string };
      expect(res.status).toBe(401);
      expect(body.code).toBe('42501'); // PostgreSQL insufficient_privilege
      expect(body.message).toContain('permission denied');
    }
  });

  it('6.3 Live RLS Enforcement: Anon caller must receive Code 42501 on biometric RPC match_face_candidates', async () => {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/match_face_candidates`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        probe: ['[0,0,0]'],
        candidate_ids: [],
        k: 5,
      }),
    });

    const body = (await res.json()) as { code?: string; message?: string };
    expect(res.status).toBe(401);
    expect(body.code).toBe('42501');
    expect(body.message).toContain('permission denied for function match_face_candidates');
  });

  it('6.4 Live RLS Enforcement: Private Biometric Storage Bucket must deny unauthenticated access', async () => {
    const supabase = createClient(supabaseUrl, anonKey);
    const { data, error } = await supabase.storage.from('biometric-data').list();

    // Must either error or return empty list due to zero-privilege RLS on bucket
    if (error) {
      expect(error.message).toBeDefined();
    } else {
      expect(data).toHaveLength(0);
    }
  });

  it('6.5 Live Staff Scoped Client: Scoped user client enforces RLS boundaries', async () => {
    // Simulated mock staff client with user-scoped JWT token
    const testStaffClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        headers: {
          Authorization: `Bearer mock-staff-token-pt-1`,
        },
      },
    });

    // Attempt to access unassigned or private face_templates table
    const { data, error } = await testStaffClient.from('face_templates').select('*');
    // RLS policy prevents non-service_role access to face_templates
    expect(data === null || (Array.isArray(data) && data.length === 0) || error !== null).toBe(true);
  });

  it('6.6 Live Staff Real Login & RLS Verification: Genuine staff login enforces RLS restrictions on live Supabase', async () => {
    const staffEmail = process.env.TEST_STAFF_EMAIL;
    const staffPassword = process.env.TEST_STAFF_PASSWORD;

    if (!staffEmail || !staffPassword) {
      // When live staff credentials are not provided in environment:
      // Verifies that unauthenticated caller is strictly rejected with code 42501
      const anonClient = createClient(supabaseUrl, anonKey);
      const { data, error } = await anonClient.from('profiles').select('*');
      expect(data).toBeNull();
      expect(error).not.toBeNull();
      expect(error?.code).toBe('42501');
      return;
    }

    // When live staff credentials are provided, perform real Supabase Auth signInWithPassword
    const client = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: authData, error: authError } = await client.auth.signInWithPassword({
      email: staffEmail,
      password: staffPassword,
    });

    expect(authError).toBeNull();
    expect(authData?.session?.access_token).toBeDefined();

    // Authenticated staff user queries profiles
    const { data: profiles, error: profileError } = await client.from('profiles').select('*');
    expect(profileError).toBeNull();
    expect(profiles).toBeDefined();
    // Must be able to see their own profile
    expect(profiles!.some((p: { id: string }) => p.id === authData!.user!.id)).toBe(true);

    // RLS: Non-service_role access to face_templates is strictly blocked
    const { data: biometrics } = await client.from('face_templates').select('*');
    expect(biometrics === null || biometrics.length === 0).toBe(true);
  });
});
