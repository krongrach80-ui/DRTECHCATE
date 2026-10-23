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

  // 1. POSITIVE CONTROL: Verify that the anon key is valid and can reach public endpoints
  console.log('\n--- 1. Positive Control Check & Public Signup Lockdown ---');
  try {
    const positiveUrl = `${supabaseUrl}/auth/v1/settings`;
    const posRes = await fetch(positiveUrl, {
      method: 'GET',
      headers: {
        'apikey': anonKey,
        'Authorization': `Bearer ${anonKey}`,
      },
    });

    if (posRes.status === 200) {
      const settingsBody = (await posRes.json()) as {
        disable_signup?: boolean;
        external?: { anonymous_users?: boolean; [key: string]: unknown };
        [key: string]: unknown;
      };
      console.log(`  ✓ PASS: Positive control endpoint /auth/v1/settings returned 200 OK (Key is active & valid)`);

      // REQUIREMENT 1: Assert disable_signup === true (Item H12)
      if (settingsBody.disable_signup === true) {
        console.log(`  ✓ PASS: Settings assertion passed (disable_signup === true: public signup is strictly disabled)`);
        totalPassed++;
      } else {
        console.error(`  ✗ FAIL: Settings assertion failed! disable_signup is ${settingsBody.disable_signup}, expected true`);
        console.error(`  🚨 ABORTING IMMEDIATELY: Public signup is NOT disabled. Refusing to send POST /auth/v1/signup to prevent phantom account creation.`);
        totalFailed++;
        console.log('\n========================================================================');
        console.log(`Summary: ${totalPassed} passed, ${totalFailed} failed (HALTED ON SAFETY GUARD)`);
        console.log('========================================================================');
        process.exit(1);
      }

      // REQUIREMENT 2: Assert external.anonymous_users is false (Zero unauthenticated/anonymous user creation)
      if (settingsBody.external?.anonymous_users === false) {
        console.log(`  ✓ PASS: Settings assertion passed (external.anonymous_users === false: anonymous login strictly disabled)`);
        totalPassed++;
      } else {
        console.error(`  ✗ FAIL: Settings assertion failed! external.anonymous_users is ${settingsBody.external?.anonymous_users}, expected false`);
        totalFailed++;
      }
    } else {
      console.error(`  ✗ FAIL: Positive control endpoint failed! Status: ${posRes.status}`);
      totalFailed++;
      process.exit(1);
    }

    // REQUIREMENT 1: Attempt POST /auth/v1/signup with anon key
    // MUST be rejected SPECIFICALLY because signups are disabled (e.g. error code "signup_disabled")
    // Errors caused by .invalid email domain (e.g. "Email address ... is invalid") or 429 rate limit MUST FAIL
    const signupUrl = `${supabaseUrl}/auth/v1/signup`;
    const signupRes = await fetch(signupUrl, {
      method: 'POST',
      headers: {
        'apikey': anonKey,
        'Authorization': `Bearer ${anonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: `unauthorized_signup_${Date.now()}@example.invalid`,
        password: 'MaliciousPassword123!',
      }),
    });

    const signupBody = (await signupRes.json()) as {
      code?: string | number;
      error_code?: string;
      message?: string;
      msg?: string;
      error?: string;
      error_description?: string;
    };

    const code = String(signupBody.code || signupBody.error_code || '');
    const msg = String(signupBody.msg || signupBody.message || signupBody.error_description || '');

    // Strictly detect signup_disabled error code or explicit message from Gotrue
    const isSignupDisabled =
      signupRes.status !== 429 &&
      (code === 'signup_disabled' ||
        msg.toLowerCase().includes('signups not allowed') ||
        msg.toLowerCase().includes('signup is disabled') ||
        msg.toLowerCase().includes('signups are disabled'));

    if (signupRes.status === 429) {
      console.error(`  ✗ FAIL: POST /auth/v1/signup returned 429 Rate Limit. Cannot verify signup lockdown from 429.`);
      totalFailed++;
    } else if (msg.toLowerCase().includes('is invalid') || code === 'validation_failed') {
      console.error(`  ✗ FAIL: POST /auth/v1/signup failed due to invalid email address format ("${msg}"), NOT because signup was disabled! Must disable signups in Supabase dashboard.`);
      totalFailed++;
    } else if (isSignupDisabled) {
      console.log(`  ✓ PASS: POST /auth/v1/signup rejected specifically because signup is disabled (Status ${signupRes.status}: "${msg || code || 'Signups not allowed'}")`);
      totalPassed++;
    } else {
      console.error(`  ✗ FAIL: POST /auth/v1/signup was NOT rejected with signup_disabled! Status: ${signupRes.status}, Body: ${JSON.stringify(signupBody)}`);
      totalFailed++;
    }
  } catch (err: unknown) {
    console.error(`  ✗ FAIL: Positive control / signup check error: ${(err as Error).message}`);
    totalFailed++;
  }

  // 2. NEGATIVE CONTROLS: Verify all 27 tables return Status 401 with PostgreSQL Error Code 42501 (insufficient_privilege)
  console.log('\n--- 2. Table Zero-Trust Verification (Checking Code 42501) ---');
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

      const body = (await res.json()) as { code?: string; message?: string };

      // Requirement: Check Postgres error code 42501 in body (insufficient_privilege)
      const hasCode42501 = body?.code === '42501';
      const isDenied = res.status === 401 && hasCode42501;

      if (isDenied) {
        console.log(`  ✓ PASS: Table "${table}" blocked with code 42501 (Status ${res.status}: "${body.message}")`);
        totalPassed++;
      } else {
        console.error(`  ✗ FAIL: Table "${table}" did NOT return code 42501! Status: ${res.status}, Body: ${JSON.stringify(body)}`);
        totalFailed++;
      }
    } catch (err: unknown) {
      console.error(`  ✗ FAIL: Table "${table}" request error: ${(err as Error).message}`);
      totalFailed++;
    }
  }

  // 3. NEGATIVE CONTROL: Verify match_face_candidates RPC returns Status 401 with Code 42501
  console.log('\n--- 3. Biometric RPC Zero-Trust Verification (Checking Code 42501) ---');
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

    const body = (await res.json()) as { code?: string; message?: string };
    const hasCode42501 = body?.code === '42501';
    const isDenied = res.status === 401 && hasCode42501;

    if (isDenied) {
      console.log(`  ✓ PASS: RPC match_face_candidates blocked with code 42501 (Status ${res.status}: "${body.message}")`);
      totalPassed++;
    } else {
      console.error(`  ✗ FAIL: RPC match_face_candidates did NOT return code 42501! Status: ${res.status}, Body: ${JSON.stringify(body)}`);
      totalFailed++;
    }
  } catch (err: unknown) {
    console.error(`  ✗ FAIL: RPC match_face_candidates request error: ${(err as Error).message}`);
    totalFailed++;
  }

  console.log('\n========================================================================');
  console.log(`Summary: ${totalPassed} passed, ${totalFailed} failed`);
  console.log('========================================================================');

  if (totalFailed > 0) {
    process.exit(1);
  }
}

runAnonRestSecurityTest();
