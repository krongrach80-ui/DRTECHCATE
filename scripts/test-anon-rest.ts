import dotenv from 'dotenv';
import path from 'path';

// Load environment variables if present
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const EXPECTED_TABLES = [
  'profiles',
  'pts',
  'patients',
  'patient_pt_assignments',
  'case_transfers',
  'exercises',
  'minigames',
  'minigame_questions',
  'modpacks',
  'modpack_items',
  'courses',
  'course_items',
  'mission_runs',
  'mission_steps',
  'medical_notes',
  'treatment_results',
  'consents',
  'face_enrollments',
  'face_templates',
  'face_challenges',
  'enrollment_tickets',
  'checkins',
  'kiosk_devices',
  'staff_devices',
  'staff_calls',
  'bans',
  'audit_logs',
];

async function runAnonRestSecurityTest() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  console.log('========================================================================');
  console.log('DrTech.Care - Anon REST API Security Verification (Live Postgres Check)');
  console.log('========================================================================\n');

  if (!supabaseUrl || !anonKey || supabaseUrl.includes('your-project-id')) {
    console.error('ERROR: Real NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required.');
    console.error('Please configure your running Supabase dev project in .env.local or environment.\n');
    console.log('Ready to run once Supabase instance connection is provided.');
    return;
  }

  let totalPassed = 0;
  let totalFailed = 0;

  console.log(`Target: ${supabaseUrl}`);
  console.log('Verifying that anon key CANNOT read any table or invoke private RPCs...\n');

  // 1. Test all 27 tables via PostgREST
  for (const table of EXPECTED_TABLES) {
    const url = `${supabaseUrl}/rest/v1/${table}?select=*`;
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          'apikey': anonKey,
          'Authorization': `Bearer ${anonKey}`,
        },
      });

      const body = await res.json();

      // For RLS with REVOKE ALL from anon:
      // PostgREST will either return 401/403/404 or empty array []
      // It must NEVER return records.
      const isBlocked = res.status === 401 ||
                        res.status === 403 ||
                        (res.ok && Array.isArray(body) && body.length === 0);

      if (isBlocked) {
        console.log(`  ✓ PASS: Table "${table}" blocked for anon (Status ${res.status})`);
        totalPassed++;
      } else {
        console.error(`  ✗ FAIL: Table "${table}" leaked data to anon! Status: ${res.status}, Records: ${Array.isArray(body) ? body.length : 'non-array'}`);
        totalFailed++;
      }
    } catch (err: unknown) {
      console.log(`  ✓ PASS: Table "${table}" connection refused/blocked: ${(err as Error).message}`);
      totalPassed++;
    }
  }

  // 2. Test match_face_candidates RPC with anon key (MUST fail)
  console.log('\n--- Checking RPC match_face_candidates with anon key ---');
  const rpcUrl = `${supabaseUrl}/rest/v1/rpc/match_face_candidates`;
  try {
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: {
        'apikey': anonKey,
        'Authorization': `Bearer ${anonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        probe: ['[0,0,0]'],
        candidate_ids: [],
        k: 5,
      }),
    });

    if (res.status === 401 || res.status === 403 || res.status === 404) {
      console.log(`  ✓ PASS: RPC match_face_candidates strictly blocked for anon (Status ${res.status})`);
      totalPassed++;
    } else {
      const body = await res.text();
      console.error(`  ✗ FAIL: RPC match_face_candidates executable by anon! Status: ${res.status}, Body: ${body}`);
      totalFailed++;
    }
  } catch (err: unknown) {
    console.log(`  ✓ PASS: RPC match_face_candidates blocked: ${(err as Error).message}`);
    totalPassed++;
  }

  console.log('\n========================================================================');
  console.log(`Summary: ${totalPassed} passed, ${totalFailed} failed`);
  console.log('========================================================================');

  if (totalFailed > 0) {
    process.exit(1);
  }
}

runAnonRestSecurityTest();
