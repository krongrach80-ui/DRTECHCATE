process.env.NODE_ENV = 'production';
process.env.USE_LOCAL_STORAGE = 'true';
process.env.ALLOW_BEARER_IN_PROD = 'true';
process.env.VERCEL = '1';

async function testAll() {
  const { createApp } = await import('../../apps/api/src/app');
  const { activateLocalPersistenceEngine } = await import('../../apps/api/src/lib/localStorage/localPersistenceEngine');
  activateLocalPersistenceEngine();

  const request = (await import('supertest')).default;
  const app = createApp();

  console.log('1. Testing Login as director...');
  const loginRes = await request(app)
    .post('/api/auth/login')
    .set('Origin', 'https://drtechcarev2.vercel.app')
    .set('X-Requested-With', 'XMLHttpRequest')
    .send({ username: 'director', password: 'Admin12345678!' });

  console.log('Login status:', loginRes.status);
  console.log('Login user:', loginRes.body.user);

  const token = loginRes.body.token || loginRes.body.accessToken;
  if (!token) throw new Error('No token returned from login!');

  const authHeader = 'Bearer ' + token;

  console.log('\n2. Testing GET /api/staff ...');
  const staffRes = await request(app)
    .get('/api/staff')
    .set('Authorization', authHeader);
  console.log('GET /api/staff status:', staffRes.status, 'Count:', staffRes.body.data?.length);
  console.log('Staff list:', staffRes.body.data?.map((s: any) => `${s.username} (${s.full_name}, ${s.role})`));

  if (staffRes.status !== 200) throw new Error(`GET /api/staff failed with ${staffRes.status}`);
  if (!staffRes.body.data || staffRes.body.data.length < 3) throw new Error('Staff list must contain director, admin, pt_somchai');

  console.log('\n3. Testing GET /api/patients ...');
  const patRes = await request(app)
    .get('/api/patients')
    .set('Authorization', authHeader);
  console.log('GET /api/patients status:', patRes.status, 'Count:', staffRes.body.data?.length);
  if (patRes.status !== 200) throw new Error(`GET /api/patients failed with ${patRes.status}`);

  console.log('\n4. Testing GET /api/directory/pts ...');
  const ptRes = await request(app)
    .get('/api/directory/pts')
    .set('Authorization', authHeader);
  console.log('GET /api/directory/pts status:', ptRes.status);
  if (ptRes.status !== 200) throw new Error(`GET /api/directory/pts failed with ${ptRes.status}`);

  console.log('\n5. Testing GET /api/courses ...');
  const coursesRes = await request(app)
    .get('/api/courses')
    .set('Authorization', authHeader);
  console.log('GET /api/courses status:', coursesRes.status);
  if (coursesRes.status !== 200) throw new Error(`GET /api/courses failed with ${coursesRes.status}`);

  console.log('\n6. Testing GET /api/audit ...');
  const auditRes = await request(app)
    .get('/api/audit')
    .set('Authorization', authHeader);
  console.log('GET /api/audit status:', auditRes.status);
  if (auditRes.status !== 200) throw new Error(`GET /api/audit failed with ${auditRes.status}`);

  console.log('\n7. Testing POST /api/staff (create new staff) ...');
  const testUsername = 'pt_test_' + Date.now().toString().slice(-4);
  const createStaffRes = await request(app)
    .post('/api/staff')
    .set('Authorization', authHeader)
    .set('Origin', 'https://drtechcarev2.vercel.app')
    .set('X-Requested-With', 'XMLHttpRequest')
    .send({
      username: testUsername,
      password: 'CorrectPassword123!',
      role: 'pt',
      full_name: 'กภ. กิตติศักดิ์ มีชัย',
      phone: '089-111-2222',
      license_no: 'กภ.99887'
    });
  console.log('POST /api/staff status:', createStaffRes.status, 'Created:', createStaffRes.body.data?.username);
  if (createStaffRes.status !== 200 && createStaffRes.status !== 201) throw new Error('Create staff failed');

  const staffRes2 = await request(app)
    .get('/api/staff')
    .set('Authorization', authHeader);
  console.log('Updated staff count:', staffRes2.body.data?.length);
  console.log('Updated staff list:', staffRes2.body.data?.map((s: any) => s.username));

  console.log('\n8. Testing POST /api/patients (create new patient) ...');
  const createPatRes = await request(app)
    .post('/api/patients')
    .set('Authorization', authHeader)
    .set('Origin', 'https://drtechcarev2.vercel.app')
    .set('X-Requested-With', 'XMLHttpRequest')
    .send({
      first_name: 'วีระชัย',
      last_name: 'เจริญผล',
      age: 42,
      sex: 'male',
      phone: '081-888-9999',
      injury: 'ปวดข้อไหล่เรื้อรัง',
      responsible_pt_id: 'pt-somchai-uuid'
    });
  console.log('POST /api/patients status:', createPatRes.status, 'Created HN:', createPatRes.body.data?.hn);
  if (createPatRes.status !== 200 && createPatRes.status !== 201) throw new Error('Create patient failed');

  console.log('\n======================================================');
  console.log('✓ ALL 8 CRITICAL ENDPOINT TESTS PASSED WITH 200/201 OK!');
  console.log('======================================================\n');
}

testAll().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
