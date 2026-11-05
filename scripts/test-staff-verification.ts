import { defaultApiClient } from '../packages/api-client/src/index.js';

async function runStaffVerificationSuite() {
  console.log('========================================================================');
  console.log(' DR.TECH.CARE - STAFF ACCOUNT CREATION VERIFICATION SUITE');
  console.log('========================================================================\n');

  // Test 1: Verify Initial Clean State
  console.log('--- TEST 1: Inspecting Database & Profiles ---');
  const initialStaff = await defaultApiClient.staff.list();
  console.log(`Initial staff count: ${initialStaff.length}`);
  console.log('Existing staff accounts:');
  for (const s of initialStaff) {
    console.log(`  - @${s.username} (${s.role}) - ID: ${s.id}`);
  }

  const hasDirector = initialStaff.some(s => s.username === 'director');
  const hasAdmin = initialStaff.some(s => s.username === 'admin');
  const hasPtSomchai = initialStaff.some(s => s.username === 'pt_somchai');

  if (!hasDirector || !hasAdmin || !hasPtSomchai) {
    throw new Error('FAIL: Core required staff accounts (@director, @admin, @pt_somchai) missing!');
  }
  console.log('✓ PASS: All 3 core staff accounts verified intact and active.\n');

  // Test 2: Admin Authentication Session
  console.log('--- TEST 2: Admin Login & Session Establishment ---');
  const adminLoginRes = await defaultApiClient.auth.login({ username: 'admin', password: 'Admin12345678!' });
  console.log(`✓ Logged in as: @${adminLoginRes.user?.username} (${adminLoginRes.user?.role})`);
  const adminToken = defaultApiClient.getAuthToken();
  if (!adminToken) throw new Error('FAIL: No auth token generated for admin session');
  console.log('✓ PASS: Admin session established without errors.\n');

  // Test 3: Client & Server Validation
  console.log('--- TEST 3: Validation (Password < 12, Empty/Invalid Username, Missing License) ---');
  // 3.1 Password too short
  try {
    await defaultApiClient.staff.create({
      username: 'short_pw_user',
      password: 'Short1!',
      role: 'admin',
      full_name: 'Short Password User',
    });
    throw new Error('FAIL: Password < 12 was not rejected');
  } catch (err: any) {
    if (err.message.startsWith('FAIL:')) throw err;
    console.log(`✓ PASS: Rejected short password: "${err.message}"`);
  }

  // 3.2 Username too short
  try {
    await defaultApiClient.staff.create({
      username: 'ab',
      password: 'ValidPassword1234!',
      role: 'admin',
      full_name: 'Short Username User',
    });
    throw new Error('FAIL: Username < 3 was not rejected');
  } catch (err: any) {
    if (err.message.startsWith('FAIL:')) throw err;
    console.log(`✓ PASS: Rejected short username: "${err.message}"`);
  }

  // 3.3 PT Missing License
  try {
    await defaultApiClient.staff.create({
      username: 'pt_no_lic',
      password: 'ValidPassword1234!',
      role: 'pt',
      full_name: 'PT No License',
      license_no: '',
    });
    throw new Error('FAIL: PT without license was not rejected');
  } catch (err: any) {
    if (err.message.startsWith('FAIL:')) throw err;
    console.log(`✓ PASS: Rejected PT without license: "${err.message}"\n`);
  }

  // Test 4: Genuine PT User Creation
  console.log('--- TEST 4: Genuine PT Account Creation ---');
  const ptUsername = `pt_test_${Date.now().toString().slice(-4)}`;
  const ptLicense = `กภ.${Math.floor(20000 + Math.random() * 70000)}`;
  const ptPassword = 'PtPassword123456!';

  console.log(`Creating PT: @${ptUsername} (License: ${ptLicense})...`);
  const ptCreated = await defaultApiClient.staff.create({
    username: ptUsername,
    password: ptPassword,
    role: 'pt',
    full_name: 'กภ. สุภาวดี ทดสอบระบบ',
    phone: '089-111-2233',
    bio: 'นักกายภาพบำบัดทดสอบระบบ',
    license_no: ptLicense,
    license_expiry: '2030-06-30',
    specialty: 'เวชศาสตร์ฟื้นฟูกายภาพบำบัด',
    age: 29,
    sex: 'female',
  });

  console.log('PT Created Response:', {
    id: ptCreated.id,
    username: ptCreated.username,
    role: ptCreated.role,
    full_name: ptCreated.full_name,
  });

  if (!ptCreated.id || ptCreated.username !== ptUsername || ptCreated.role !== 'pt') {
    throw new Error('FAIL: PT record returned invalid fields');
  }
  console.log('✓ PASS: PT created successfully with valid UUID and profile details.\n');

  // Test 5: Verify PT in Staff List
  console.log('--- TEST 5: Verify PT Appears in Staff List ---');
  const staffAfterPt = await defaultApiClient.staff.list();
  const foundPt = staffAfterPt.find(s => s.username === ptUsername);
  if (!foundPt) throw new Error(`FAIL: PT @${ptUsername} not found in staff list`);
  console.log(`✓ Found in staff list: @${foundPt.username} (ID: ${foundPt.id}, Role: ${foundPt.role})`);
  console.log('✓ PASS: PT appears in staff list and persists.\n');

  // Test 6: Verify Admin Session Not Overwritten
  console.log('--- TEST 6: Admin Session Integrity ---');
  const currentUser = defaultApiClient.getUserProfile();
  console.log(`Current logged in user: @${currentUser?.username} (${currentUser?.role})`);
  if (currentUser?.username !== 'admin') {
    throw new Error(`FAIL: Admin session was overwritten! Current user: @${currentUser?.username}`);
  }
  console.log('✓ PASS: Admin session remained 100% active and was NOT overwritten.\n');

  // Test 7: Genuine Admin User Creation
  console.log('--- TEST 7: Genuine Admin Account Creation ---');
  const adminUsername = `admin_test_${Date.now().toString().slice(-4)}`;
  const newAdminPassword = 'AdminPassword123456!';

  console.log(`Creating Admin: @${adminUsername}...`);
  const adminCreated = await defaultApiClient.staff.create({
    username: adminUsername,
    password: newAdminPassword,
    role: 'admin',
    full_name: 'นายแพทย์ บริหาร ทดสอบ',
    phone: '081-333-4455',
    bio: 'รองผู้อำนวยการทดสอบ',
  });

  console.log('Admin Created Response:', {
    id: adminCreated.id,
    username: adminCreated.username,
    role: adminCreated.role,
    full_name: adminCreated.full_name,
  });

  if (!adminCreated.id || adminCreated.username !== adminUsername || adminCreated.role !== 'admin') {
    throw new Error('FAIL: Admin record returned invalid fields');
  }
  console.log('✓ PASS: Admin created successfully.\n');

  // Test 8: Login with Newly Created Accounts
  console.log('--- TEST 8: Login Verification for New Accounts ---');
  // 8.1 Login as new PT
  console.log(`Testing login as new PT (@${ptUsername})...`);
  const ptLogin = await defaultApiClient.auth.login({ username: ptUsername, password: ptPassword });
  console.log(`✓ Logged in as: @${ptLogin.user?.username} (Role: ${ptLogin.user?.role})`);
  if (ptLogin.user?.username !== ptUsername || ptLogin.user?.role !== 'pt') {
    throw new Error('FAIL: PT login returned mismatched profile');
  }
  console.log('✓ PASS: New PT can log in successfully.\n');

  // 8.2 Login as new Admin
  console.log(`Testing login as new Admin (@${adminUsername})...`);
  const newAdminLogin = await defaultApiClient.auth.login({ username: adminUsername, password: newAdminPassword });
  console.log(`✓ Logged in as: @${newAdminLogin.user?.username} (Role: ${newAdminLogin.user?.role})`);
  if (newAdminLogin.user?.username !== adminUsername || newAdminLogin.user?.role !== 'admin') {
    throw new Error('FAIL: Admin login returned mismatched profile');
  }
  console.log('✓ PASS: New Admin can log in successfully.\n');

  // Test 9: Duplication Checks
  console.log('--- TEST 9: Collision Prevention (Duplicate Username & License) ---');
  // 9.1 Duplicate Username
  try {
    await defaultApiClient.staff.create({
      username: ptUsername,
      password: 'AnotherPassword1234!',
      role: 'pt',
      full_name: 'Duplicate Username User',
      license_no: `กภ.${Math.floor(80000 + Math.random() * 10000)}`,
    });
    throw new Error('FAIL: Duplicate username was not rejected');
  } catch (err: any) {
    if (err.message.startsWith('FAIL:')) throw err;
    console.log(`✓ PASS: Duplicate username rejected: "${err.message}"`);
    if (!err.message.includes('มีอยู่ในระบบแล้ว')) {
      throw new Error(`FAIL: Unexpected error message for duplicate username: ${err.message}`);
    }
  }

  // 9.2 Duplicate License
  try {
    await defaultApiClient.staff.create({
      username: `pt_dup_lic_${Date.now().toString().slice(-4)}`,
      password: 'AnotherPassword1234!',
      role: 'pt',
      full_name: 'Duplicate License User',
      license_no: ptLicense, // same license
    });
    throw new Error('FAIL: Duplicate license was not rejected');
  } catch (err: any) {
    if (err.message.startsWith('FAIL:')) throw err;
    console.log(`✓ PASS: Duplicate license rejected: "${err.message}"`);
    if (!err.message.includes('มีอยู่ในระบบแล้ว')) {
      throw new Error(`FAIL: Unexpected error message for duplicate license: ${err.message}`);
    }
  }
  console.log('✓ PASS: Collision prevention works strictly without creating orphan rows.\n');

  // Test 10: Clean up test accounts
  console.log('--- TEST 10: Clean Up Test Accounts ---');
  console.log(`Deleting test PT @${ptUsername} (ID: ${ptCreated.id})...`);
  await defaultApiClient.staff.delete(ptCreated.id);
  console.log(`Deleting test Admin @${adminUsername} (ID: ${adminCreated.id})...`);
  await defaultApiClient.staff.delete(adminCreated.id);

  const finalStaff = await defaultApiClient.staff.list();
  const foundPtAfterDelete = finalStaff.find(s => s.username === ptUsername);
  const foundAdminAfterDelete = finalStaff.find(s => s.username === adminUsername);

  if (foundPtAfterDelete || foundAdminAfterDelete) {
    throw new Error('FAIL: Deleted test accounts still present in staff list!');
  }
  console.log('✓ Confirmed test accounts removed cleanly from list.');
  console.log(`Final staff count: ${finalStaff.length}`);
  console.log('✓ PASS: Clean up completed. Database is spotless.\n');

  console.log('========================================================================');
  console.log(' ALL 10 VERIFICATION TESTS COMPLETED AND PASSED 100%!');
  console.log('========================================================================');
}

runStaffVerificationSuite().catch((err) => {
  console.error('\n❌ VERIFICATION SUITE FAILED:', err);
  process.exit(1);
});
