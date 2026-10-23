/**
 * scripts/verify-system-5b.ts
 * Live HTTP Verification script for System 5B: Patients & Registration
 * 
 * Verifies Definition of Done (DoD) per Master Prompt v3 line 325:
 * 1. Two users editing same patient concurrently receive 409 Conflict without overwriting
 * 2. PT does not see patients of other PTs (2 PTs test)
 * 3. Search with real Thai names returns matching records
 */

import request from 'supertest';
import { createApp } from '../apps/api/src/app';
import { defaultPatientRepository } from '../apps/api/src/modules/patients/repository';
import { defaultDirectoryRepository } from '../apps/api/src/modules/directory/repository';
import { defaultStaffRepository } from '../apps/api/src/modules/staff/repository';

async function main() {
  (process.env as Record<string, string>).NODE_ENV = 'test';
  console.log('================================================================');
  console.log('  SYSTEM 5B: LIVE HTTP VERIFICATION RUNNER');
  console.log('================================================================\n');

  const app = createApp();

  defaultPatientRepository.clearInMemory();
  defaultDirectoryRepository.clearAllInMemory();
  defaultStaffRepository.clearInMemoryStaff();

  // -------------------------------------------------------------------------
  // DoD Item 1: Two users editing same patient concurrently -> 409 Conflict
  // -------------------------------------------------------------------------
  console.log('--- TEST 1: Optimistic Locking Concurrent Conflict Protection ---');
  
  // 1. Create a patient
  const createPatientRes = await request(app)
    .post('/api/patients')
    .set('Cookie', ['access_token=mock-token:admin-001:admin:active'])
    .set('X-Requested-With', 'XMLHttpRequest')
    .send({
      first_name: 'สมชาย',
      last_name: 'รักการรักษา',
      age: 42,
      injury: 'Initial Assessment: Mild Lumbar Strain',
    });

  const patientId = createPatientRes.body.data?.id;
  const initialVersion = createPatientRes.body.data?.version;
  console.log(`[INIT] Patient Created: ${patientId}, HN: ${createPatientRes.body.data?.hn}, Version: ${initialVersion}`);

  // User A updates patient at version 1
  const userAUpdateRes = await request(app)
    .patch(`/api/patients/${patientId}`)
    .set('Cookie', ['access_token=mock-token:admin-001:admin:active'])
    .set('X-Requested-With', 'XMLHttpRequest')
    .send({
      injury: 'Diagnosed by User A: Lumbar Strain Grade 2',
      version: initialVersion,
    });

  console.log(`[User A] Update with version ${initialVersion} -> Status: ${userAUpdateRes.status}, New Version: ${userAUpdateRes.body.data?.version}`);

  // User B submits concurrent update with stale version 1
  const userBUpdateRes = await request(app)
    .patch(`/api/patients/${patientId}`)
    .set('Cookie', ['access_token=mock-token:admin-001:admin:active'])
    .set('X-Requested-With', 'XMLHttpRequest')
    .send({
      injury: 'Overwritten by User B: Disc Herniation',
      version: initialVersion, // Stale!
    });

  console.log(`[User B] Concurrent update with stale version ${initialVersion} -> Status: ${userBUpdateRes.status}, Code: ${userBUpdateRes.body.error?.code}`);

  // Verify User A's data remains intact
  const verifyRes = await request(app)
    .get(`/api/patients/${patientId}`)
    .set('Cookie', ['access_token=mock-token:admin-001:admin:active']);

  const preservedData = verifyRes.body.data?.injury.includes('User A');
  console.log(`[VERIFY] Database record preserved User A data without overwrite: ${preservedData ? 'YES' : 'NO'}`);

  const dod1Passed = userAUpdateRes.status === 200 && userBUpdateRes.status === 409 && preservedData;
  console.log(`>>> DoD Item 1 Result: ${dod1Passed ? 'PASSED' : 'FAILED'}\n`);

  // -------------------------------------------------------------------------
  // DoD Item 2: PT does not see patients of other PTs (2 PTs Test)
  // -------------------------------------------------------------------------
  console.log('--- TEST 2: Multi-PT Patient Data Isolation ---');

  // PT-1 creates Patient 1
  const pt1CreateRes = await request(app)
    .post('/api/patients')
    .set('Cookie', ['access_token=mock-token:pt-001:pt:active'])
    .set('X-Requested-With', 'XMLHttpRequest')
    .send({
      first_name: 'คนไข้ประจำตัว',
      last_name: 'หมอสมชาย',
    });
  const pt1PatientId = pt1CreateRes.body.data?.id;

  // PT-2 creates Patient 2
  const pt2CreateRes = await request(app)
    .post('/api/patients')
    .set('Cookie', ['access_token=mock-token:pt-002:pt:active'])
    .set('X-Requested-With', 'XMLHttpRequest')
    .send({
      first_name: 'คนไข้ประจำตัว',
      last_name: 'หมอสมศรี',
    });
  const pt2PatientId = pt2CreateRes.body.data?.id;

  // PT-2 attempts to view PT-1 patient
  const pt2AccessPt1 = await request(app)
    .get(`/api/patients/${pt1PatientId}`)
    .set('Cookie', ['access_token=mock-token:pt-002:pt:active']);

  console.log(`[PT-2] Direct GET PT-1 Patient -> Status: ${pt2AccessPt1.status}, Code: ${pt2AccessPt1.body.error?.code}`);

  // PT-2 lists patients: check that PT-1 patient is not present
  const pt2ListRes = await request(app)
    .get('/api/patients')
    .set('Cookie', ['access_token=mock-token:pt-002:pt:active']);

  const pt2SeesOwn = pt2ListRes.body.patients.some((p: { id: string }) => p.id === pt2PatientId);
  const pt2SeesOther = pt2ListRes.body.patients.some((p: { id: string }) => p.id === pt1PatientId);

  console.log(`[PT-2] List Patients -> Sees own patient: ${pt2SeesOwn ? 'YES' : 'NO'}, Sees PT-1 patient: ${pt2SeesOther ? 'YES (LEAK)' : 'NO (PROTECTED)'}`);

  const dod2Passed = pt2AccessPt1.status === 403 && pt2SeesOwn && !pt2SeesOther;
  console.log(`>>> DoD Item 2 Result: ${dod2Passed ? 'PASSED' : 'FAILED'}\n`);

  // -------------------------------------------------------------------------
  // DoD Item 3: Search with Real Thai Names
  // -------------------------------------------------------------------------
  console.log('--- TEST 3: Search with Real Thai Names ---');

  await defaultPatientRepository.createPatient(
    {
      first_name: 'ศิริพร',
      last_name: 'อำนวยโชค',
      phone: '085-555-4433',
    },
    'admin-001',
    'pt-001'
  );

  const searchRes = await request(app)
    .get('/api/patients?q=ศิริพร')
    .set('Cookie', ['access_token=mock-token:admin-001:admin:active']);

  const foundCount = searchRes.body.patients?.length;
  const foundName = searchRes.body.patients?.[0]?.first_name;
  console.log(`[SEARCH] Query "ศิริพร" -> Found records: ${foundCount}, Name: "${foundName}"`);

  const dod3Passed = searchRes.status === 200 && foundCount === 1 && foundName === 'ศิริพร';
  console.log(`>>> DoD Item 3 Result: ${dod3Passed ? 'PASSED' : 'FAILED'}\n`);

  // -------------------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------------------
  console.log('================================================================');
  if (dod1Passed && dod2Passed && dod3Passed) {
    console.log('  ALL DEFINITION OF DONE (DoD) CRITERIA FOR SYSTEM 5B PASSED');
    console.log('================================================================');
    process.exit(0);
  } else {
    console.error('  SOME DoD CRITERIA FAILED');
    console.log('================================================================');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('FATAL SYSTEM 5B VERIFICATION ERROR:', err);
  process.exit(1);
});
