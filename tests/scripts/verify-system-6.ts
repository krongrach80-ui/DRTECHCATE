/**
 * scripts/verify-system-6.ts
 * Live HTTP Verification script for System 6: Courses & Scheduling
 * 
 * Verifies Definition of Done (DoD) per Master Prompt v3 line 332:
 * 1. PT cannot create appointment/course for another PT's patient (403 Forbidden)
 * 2. Today appointments returns the correct patients matching days_of_week and active date window
 */

import request from 'supertest';
import { createApp } from '../apps/api/src/app';
import { defaultCourseRepository } from '../apps/api/src/modules/courses/repository';
import { defaultPatientRepository } from '../apps/api/src/modules/patients/repository';
import { defaultDirectoryRepository } from '../apps/api/src/modules/directory/repository';
import { defaultStaffRepository } from '../apps/api/src/modules/staff/repository';

async function main() {
  (process.env as Record<string, string>).NODE_ENV = 'test';
  console.log('================================================================');
  console.log('  SYSTEM 6: LIVE HTTP VERIFICATION RUNNER');
  console.log('================================================================\n');

  const app = createApp();

  defaultCourseRepository.clearInMemory();
  defaultPatientRepository.clearInMemory();
  defaultDirectoryRepository.clearAllInMemory();
  defaultStaffRepository.clearInMemoryStaff();

  // -------------------------------------------------------------------------
  // DoD Item 1: PT cannot create appointment/course for another PT's patient
  // -------------------------------------------------------------------------
  console.log('--- TEST 1: Course Assignment Cross-PT Boundary Protection ---');

  // PT-1 creates a patient
  const p1Res = await request(app)
    .post('/api/patients')
    .set('Cookie', ['access_token=mock-token:pt-001:pt:active'])
    .set('X-Requested-With', 'XMLHttpRequest')
    .send({
      first_name: 'คนไข้ของหมอหนึ่ง',
      last_name: 'ห้ามหมอสองนัด',
    });

  const patientId = p1Res.body.data?.id;
  console.log(`[PT-1] Created Patient: ${patientId}, HN: ${p1Res.body.data?.hn}`);

  // PT-2 attempts to create a course for PT-1's patient -> 403 Forbidden
  const roguePrescriptionRes = await request(app)
    .post('/api/courses')
    .set('Cookie', ['access_token=mock-token:pt-002:pt:active'])
    .set('X-Requested-With', 'XMLHttpRequest')
    .send({
      patient_id: patientId,
      start_date: '2026-11-01',
      end_date: '2026-11-30',
      weekdays: [1, 3, 5],
      items: [{ exercise_id: 'ex-001', sets: 3, reps: 10, position: 1 }],
    });

  console.log(`[PT-2] Attempt POST /api/courses for PT-1's patient -> Status: ${roguePrescriptionRes.status}, Code: ${roguePrescriptionRes.body.error?.code}`);

  // PT-1 creates a course for their own patient -> 201 Created
  const validPrescriptionRes = await request(app)
    .post('/api/courses')
    .set('Cookie', ['access_token=mock-token:pt-001:pt:active'])
    .set('X-Requested-With', 'XMLHttpRequest')
    .send({
      patient_id: patientId,
      start_date: '2026-11-01',
      end_date: '2026-11-30',
      weekdays: [1, 3, 5],
      items: [{ exercise_id: 'ex-001', sets: 3, reps: 10, position: 1 }],
    });

  console.log(`[PT-1] Valid POST /api/courses for own patient -> Status: ${validPrescriptionRes.status}, Course ID: ${validPrescriptionRes.body.data?.id}`);

  const dod1Passed = roguePrescriptionRes.status === 403 && validPrescriptionRes.status === 201;
  console.log(`>>> DoD Item 1 Result: ${dod1Passed ? 'PASSED' : 'FAILED'}\n`);

  // -------------------------------------------------------------------------
  // DoD Item 2: Today appointments matches days_of_week and active date window
  // -------------------------------------------------------------------------
  console.log('--- TEST 2: Today Appointments (days_of_week & date window integrity) ---');
  defaultCourseRepository.clearInMemory();

  // Let reference date be Friday 2026-11-20 (Day of week = 5)
  const targetDate = '2026-11-20';
  const fridayDay = 5;

  // Patient A: Active course including Friday (5)
  const pA = await defaultPatientRepository.createPatient(
    { first_name: 'คนไข้วันศุกร์', last_name: 'มีนัด' },
    'admin-001',
    'pt-001'
  );
  // Patient B: Active course on Mon/Wed only [1, 3] (NO appointment on Friday)
  const pB = await defaultPatientRepository.createPatient(
    { first_name: 'คนไข้วันจันทร์พุธ', last_name: 'ไม่มีนัดวันศุกร์' },
    'admin-001',
    'pt-001'
  );
  // Patient C: Course with Friday, but date window expired (2026-11-01 to 2026-11-10)
  const pC = await defaultPatientRepository.createPatient(
    { first_name: 'คนไข้คอร์สหมดอายุ', last_name: 'ไม่มีนัด' },
    'admin-001',
    'pt-001'
  );

  // Setup courses
  await defaultCourseRepository.createCourse(
    {
      patient_id: pA.id,
      start_date: '2026-11-01',
      end_date: '2026-11-30',
      weekdays: [1, 3, fridayDay], // Mon, Wed, Fri
      kiosk_id: 'kiosk-01',
      include_minigame: false,
    },
    'pt-001'
  );

  await defaultCourseRepository.createCourse(
    {
      patient_id: pB.id,
      start_date: '2026-11-01',
      end_date: '2026-11-30',
      weekdays: [1, 3], // Mon, Wed only
      kiosk_id: 'kiosk-01',
      include_minigame: false,
    },
    'pt-001'
  );

  await defaultCourseRepository.createCourse(
    {
      patient_id: pC.id,
      start_date: '2026-11-01',
      end_date: '2026-11-10', // Expired!
      weekdays: [fridayDay],
      kiosk_id: 'kiosk-01',
      include_minigame: false,
    },
    'pt-001'
  );

  // Query /api/courses/today for Friday 2026-11-20
  const todayRes = await request(app)
    .get(`/api/courses/today?date=${targetDate}&kiosk_id=kiosk-01`)
    .set('Cookie', ['access_token=mock-token:admin-001:admin:active']);

  console.log(`[API] GET /api/courses/today -> Status: ${todayRes.status}, Total matches: ${todayRes.body.data?.length}`);

  const returnedPatientIds = todayRes.body.data?.map((c: { patient_id: string }) => c.patient_id) || [];
  const pAIncluded = returnedPatientIds.includes(pA.id);
  const pBExcluded = !returnedPatientIds.includes(pB.id);
  const pCExcluded = !returnedPatientIds.includes(pC.id);

  console.log(`- Patient A (Active Fri): ${pAIncluded ? 'INCLUDED (CORRECT)' : 'MISSING (FAILED)'}`);
  console.log(`- Patient B (Mon/Wed only): ${pBExcluded ? 'EXCLUDED (CORRECT)' : 'INCLUDED (FAILED)'}`);
  console.log(`- Patient C (Expired date window): ${pCExcluded ? 'EXCLUDED (CORRECT)' : 'INCLUDED (FAILED)'}`);

  const dod2Passed = todayRes.status === 200 && pAIncluded && pBExcluded && pCExcluded && returnedPatientIds.length === 1;
  console.log(`>>> DoD Item 2 Result: ${dod2Passed ? 'PASSED' : 'FAILED'}\n`);

  // -------------------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------------------
  console.log('================================================================');
  if (dod1Passed && dod2Passed) {
    console.log('  ALL DEFINITION OF DONE (DoD) CRITERIA FOR SYSTEM 6 PASSED');
    console.log('================================================================');
    process.exit(0);
  } else {
    console.error('  SOME DoD CRITERIA FAILED');
    console.log('================================================================');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('FATAL SYSTEM 6 VERIFICATION ERROR:', err);
  process.exit(1);
});
