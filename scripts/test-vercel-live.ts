const LIVE_URL = 'https://drtechcarev2.vercel.app';

async function testVercel() {
  console.log('========================================================================');
  console.log('Live Verification for DrTechCare V2 on Vercel');
  console.log(`URL: ${LIVE_URL}`);
  console.log('========================================================================\n');

  // 1. Health check
  console.log('[1/4] Checking /api/health...');
  try {
    const healthRes = await fetch(`${LIVE_URL}/api/health`, { signal: AbortSignal.timeout(10000) });
    const healthData = await healthRes.json().catch(() => ({}));
    console.log(`✓ Health status: ${healthRes.status}`, healthData);
  } catch (err: any) {
    console.error(`❌ Health check failed:`, err?.message);
  }

  // 2. Login with director
  console.log('\n[2/4] Logging in as Director (@director)...');
  let token: string | undefined;
  let cookie: string | undefined;
  try {
    const loginRes = await fetch(`${LIVE_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://drtechcarev2.vercel.app',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({
        username: 'director',
        password: 'Admin12345678!',
      }),
      signal: AbortSignal.timeout(15000),
    });
    const loginData = await loginRes.json().catch(() => ({}));
    console.log(`Status: ${loginRes.status}`);
    if (loginRes.ok) {
      console.log('✓ Login success!');
      console.log('  User payload:', (loginData as any).user);
      token = (loginData as any).token || (loginData as any).accessToken;
      cookie = loginRes.headers.get('set-cookie') || undefined;
    } else {
      console.error('❌ Login failed with response:', loginData);
    }
  } catch (err: any) {
    console.error(`❌ Login error:`, err?.message);
  }

  const authHeaders: Record<string, string> = {};
  if (token) authHeaders['Authorization'] = `Bearer ${token}`;
  if (cookie) authHeaders['Cookie'] = cookie;

  // 3. Fetch /api/staff
  console.log('\n[3/4] Testing GET /api/staff...');
  try {
    const staffRes = await fetch(`${LIVE_URL}/api/staff`, {
      headers: authHeaders,
      signal: AbortSignal.timeout(15000),
    });
    const staffData: any = await staffRes.json().catch(() => ({}));
    console.log(`Status: ${staffRes.status}`);
    if (staffRes.ok) {
      console.log(`✓ GET /api/staff success!`);
      const staffList = staffData.staff || staffData;
      console.log(`  Staff count: ${Array.isArray(staffList) ? staffList.length : 'N/A'}`);
      if (Array.isArray(staffList)) {
        staffList.forEach((s: any) => {
          console.log(`    • @${s.username} (${s.full_name}) - ${s.role} [${s.status}]`);
        });
      }
    } else {
      console.error('❌ GET /api/staff failed with response:', staffData);
    }
  } catch (err: any) {
    console.error(`❌ GET /api/staff error:`, err?.message);
  }

  // 4. Fetch /api/patients
  console.log('\n[4/4] Testing GET /api/patients...');
  try {
    const patientsRes = await fetch(`${LIVE_URL}/api/patients`, {
      headers: authHeaders,
      signal: AbortSignal.timeout(15000),
    });
    const patientsData: any = await patientsRes.json().catch(() => ({}));
    console.log(`Status: ${patientsRes.status}`);
    if (patientsRes.ok) {
      console.log(`✓ GET /api/patients success!`);
      const patientsList = patientsData.patients || patientsData;
      console.log(`  Patients count: ${Array.isArray(patientsList) ? patientsList.length : 'N/A'}`);
      if (Array.isArray(patientsList)) {
        patientsList.slice(0, 5).forEach((p: any) => {
          console.log(`    • [${p.hn}] ${p.first_name} ${p.last_name} (${p.injury})`);
        });
      }
    } else {
      console.error('❌ GET /api/patients failed with response:', patientsData);
    }
  } catch (err: any) {
    console.error(`❌ GET /api/patients error:`, err?.message);
  }

  console.log('\n========================================================================');
  console.log('Verification finished.');
  console.log('========================================================================');
}

testVercel();
