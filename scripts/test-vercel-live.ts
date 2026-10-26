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
      const staffList = Array.isArray(staffData.data) ? staffData.data : (Array.isArray(staffData.staff) ? staffData.staff : staffData);
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
  console.log('\n[4/6] Testing GET /api/patients...');
  try {
    const patientsRes = await fetch(`${LIVE_URL}/api/patients`, {
      headers: authHeaders,
      signal: AbortSignal.timeout(15000),
    });
    const patientsData: any = await patientsRes.json().catch(() => ({}));
    console.log(`Status: ${patientsRes.status}`);
    if (patientsRes.ok) {
      console.log(`✓ GET /api/patients success!`);
      const patientsList = Array.isArray(patientsData.data) ? patientsData.data : (Array.isArray(patientsData.patients) ? patientsData.patients : patientsData);
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

  // 5. Test Creating a Patient
  console.log('\n[5/6] Testing POST /api/patients (Live Creation)...');
  try {
    const createPatRes = await fetch(`${LIVE_URL}/api/patients`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://drtechcarev2.vercel.app',
        'X-Requested-With': 'XMLHttpRequest',
        ...authHeaders,
      },
      body: JSON.stringify({
        first_name: 'สมชาย',
        last_name: 'รักสงบ',
        age: 45,
        sex: 'male',
        phone: '089-123-4567',
        injury: 'ปวดหลังส่วนล่างเรื้อรัง (LBP)',
        history: { chronic_diseases: '-', allergies: '-', notes: '-' },
        registration_status: 'active',
        registered_via: 'reception',
      }),
      signal: AbortSignal.timeout(15000),
    });
    const createPatData: any = await createPatRes.json().catch(() => ({}));
    console.log(`Status: ${createPatRes.status}`);
    if (createPatRes.ok) {
      console.log(`✓ POST /api/patients success! Patient created:`, createPatData.patient || createPatData);
    } else {
      console.error(`⚠️ POST /api/patients returned:`, createPatData);
    }
  } catch (err: any) {
    console.error(`❌ POST /api/patients error:`, err?.message);
  }

  // 6. Test Creating a PT Staff
  console.log('\n[6/6] Testing POST /api/staff (Live PT Creation)...');
  try {
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const createStaffRes = await fetch(`${LIVE_URL}/api/staff`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://drtechcarev2.vercel.app',
        'X-Requested-With': 'XMLHttpRequest',
        ...authHeaders,
      },
      body: JSON.stringify({
        username: `pt_test_${randomSuffix}`,
        password: 'CorrectPassword123!',
        full_name: `กภ. ทดสอบ ระบบที่${randomSuffix}`,
        role: 'pt',
        phone: '088-777-6666',
        bio: 'นักกายภาพบำบัดทดสอบ',
        license_no: `กภ.${randomSuffix}`,
        specialty: 'เวชศาสตร์ฟื้นฟูกายภาพบำบัด',
        age: 29,
        sex: 'female',
      }),
      signal: AbortSignal.timeout(15000),
    });
    const createStaffData: any = await createStaffRes.json().catch(() => ({}));
    console.log(`Status: ${createStaffRes.status}`);
    if (createStaffRes.ok) {
      console.log(`✓ POST /api/staff success! Staff created:`, createStaffData.staff || createStaffData);
    } else {
      console.error(`⚠️ POST /api/staff returned:`, createStaffData);
    }
  } catch (err: any) {
    console.error(`❌ POST /api/staff error:`, err?.message);
  }

  console.log('\n========================================================================');
  console.log('Verification finished.');
  console.log('========================================================================');
}

testVercel();
