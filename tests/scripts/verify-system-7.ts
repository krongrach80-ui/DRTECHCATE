/**
 * scripts/verify-system-7.ts
 * Live HTTP Verification script for System 7: Kiosk Face Authentication & Liveness
 * 
 * Verifies Definition of Done (DoD) per Master Prompt v3 line 344:
 * 1. คนที่ไม่ได้นัดวันนี้สแกนไม่ผ่าน (Patient with no appointment today fails face verification)
 * 2. คนที่ 2 ผ่านเกณฑ์แต่ห่างอันดับ 1 ไม่พอถูกปฏิเสธ (Candidate 2 meets threshold but score delta from candidate 1 is below FACE_T_MARGIN -> rejected)
 * 3. สแกนผิด 3 ครั้งสร้าง staff_call จริง (3 failed scans creates a real staff_calls record in DB and dispatches SSE alert without keyboard interaction)
 */

import request from 'supertest';
import { createApp } from '../apps/api/src/app';
import { defaultKioskRepository } from '../apps/api/src/modules/kiosk/repository';
import { defaultCourseRepository } from '../apps/api/src/modules/courses/repository';
import { defaultPatientRepository } from '../apps/api/src/modules/patients/repository';
import { hospitalEventBus, HospitalEvent } from '../apps/api/src/modules/events/routes';
import {
  generateSyntheticVector,
  l2Normalize,
} from '../packages/face-client/src/index';

async function main() {
  (process.env as Record<string, string>).NODE_ENV = 'test';
  process.env.SUPABASE_URL = 'http://127.0.0.1:54321';
  process.env.SUPABASE_ANON_KEY = 'sb_publishable_RIM7hit0_ZY0y5fBCK_Uuw_bEJY7H5I';
  process.env.INTERNAL_EMAIL_DOMAIN = 'drtech.care';
  process.env.FACE_T_ACCEPT = '0.60';
  process.env.FACE_T_REJECT = '0.45';
  process.env.FACE_T_MARGIN = '0.10';
  process.env.FACE_T_ENROLL_CONSISTENCY = '0.75';
  process.env.FACE_T_DUPLICATE = '0.85';
  process.env.FACE_CHALLENGE_EXPIRE_SECONDS = '60';

  console.log('================================================================');
  console.log('  SYSTEM 7: KIOSK FACE AUTHENTICATION LIVE VERIFICATION RUNNER');
  console.log('================================================================\n');

  const app = createApp();

  defaultKioskRepository.clearPairings();
  (defaultCourseRepository as any).clearInMemory?.();
  (defaultPatientRepository as any).clearInMemory?.();

  // -------------------------------------------------------------------------
  // DoD Item 1: คนที่ไม่ได้นัดวันนี้สแกนไม่ผ่าน
  // -------------------------------------------------------------------------
  console.log('--- TEST 1: Candidate Set Pruning (DoD 1: No Appointment Today Fails) ---');

  // 1. Create Patient without any appointment
  const unscheduledPatient = await defaultPatientRepository.createPatient(
    { first_name: 'สมเกียรติ', last_name: 'ไม่ได้นัดวันนี้' },
    'pt-001',
    'pt-001'
  );
  console.log(`[SETUP] Registered Patient without appointment: ${unscheduledPatient.id} (${unscheduledPatient.first_name})`);

  // Register face template
  const unscheduledVector = generateSyntheticVector('unscheduled-patient-seed', 512);
  await defaultKioskRepository.saveFaceTemplate(unscheduledPatient.id, unscheduledVector);

  // Request challenge
  const chal1 = await request(app)
    .post('/api/kiosk/challenge')
    .set('X-Requested-With', 'XMLHttpRequest')
    .send({ kiosk_id: 'kiosk-main-01' });

  console.log(`[CHALLENGE] Nonce: ${chal1.body.nonce.slice(0, 16)}..., Steps: [${chal1.body.steps.join(', ')}]`);

  // Attempt verification with exact facial probe
  const verifyRes1 = await request(app)
    .post('/api/kiosk/verify')
    .set('X-Requested-With', 'XMLHttpRequest')
    .send({
      kiosk_id: 'kiosk-main-01',
      nonce: chal1.body.nonce,
      probe: unscheduledVector,
    });

  console.log(`[VERIFY RESULT] Status: ${verifyRes1.status}, Error Code: ${verifyRes1.body.error?.code}`);
  console.log(`[VERIFY MESSAGE] ${verifyRes1.body.error?.message}`);

  if (verifyRes1.status === 401 && verifyRes1.body.error?.code === 'NO_APPOINTMENT_FOUND') {
    console.log('>>> [PASS] DoD Item 1: คนที่ไม่ได้นัดวันนี้สแกนไม่ผ่าน (401 NO_APPOINTMENT_FOUND) — VERIFIED!\n');
  } else {
    console.error('>>> [FAIL] DoD Item 1 Failed! Expected 401 NO_APPOINTMENT_FOUND\n');
    process.exit(1);
  }

  // -------------------------------------------------------------------------
  // DoD Item 2: คนที่ 2 ผ่านเกณฑ์แต่ห่างอันดับ 1 ไม่พอถูกปฏิเสธ
  // -------------------------------------------------------------------------
  console.log('--- TEST 2: Dual Criteria & Margin Delta Protection (DoD 2) ---');

  const todayStr = new Date().toISOString().split('T')[0];
  const currentDayOfWeek = new Date().getUTCDay();

  // Create twin patients both scheduled today
  const twin1 = await defaultPatientRepository.createPatient(
    { first_name: 'กิตติพงศ์', last_name: 'ฝาแฝดคนพี่' },
    'pt-001',
    'pt-001'
  );
  const twin2 = await defaultPatientRepository.createPatient(
    { first_name: 'กิตติศักดิ์', last_name: 'ฝาแฝดคนน้อง' },
    'pt-001',
    'pt-001'
  );

  await defaultCourseRepository.createCourse(
    {
      patient_id: twin1.id,
      start_date: todayStr,
      end_date: todayStr,
      weekdays: [currentDayOfWeek],
      kiosk_id: 'kiosk-main-01',
    },
    'pt-001'
  );
  await defaultCourseRepository.createCourse(
    {
      patient_id: twin2.id,
      start_date: todayStr,
      end_date: todayStr,
      weekdays: [currentDayOfWeek],
      kiosk_id: 'kiosk-main-01',
    },
    'pt-001'
  );
  console.log(`[SETUP] Registered twin courses for today: ${twin1.id} & ${twin2.id}`);

  // Base vector
  const baseVector = generateSyntheticVector('twin-base-seed', 512);
  const orthogonalVector = generateSyntheticVector('orthogonal-perturb-seed', 512);

  // Twin 1 has exact base vector (similarity ~ 1.0)
  await defaultKioskRepository.saveFaceTemplate(twin1.id, baseVector);

  // Twin 2 has 96% blend with probe (similarity ~ 0.96)
  // Delta = 1.0 - 0.96 = 0.04 < FACE_T_MARGIN (0.10)
  const blendedVector = l2Normalize(
    baseVector.map((v, idx) => 0.96 * v + 0.04 * orthogonalVector[idx])
  );
  await defaultKioskRepository.saveFaceTemplate(twin2.id, blendedVector);

  const chal2 = await request(app)
    .post('/api/kiosk/challenge')
    .set('X-Requested-With', 'XMLHttpRequest')
    .send({ kiosk_id: 'kiosk-main-01' });

  const ambiguousRes = await request(app)
    .post('/api/kiosk/verify')
    .set('X-Requested-With', 'XMLHttpRequest')
    .send({
      kiosk_id: 'kiosk-main-01',
      nonce: chal2.body.nonce,
      probe: baseVector,
    });

  console.log(`[AMBIGUOUS RESULT] Status: ${ambiguousRes.status}, Error Code: ${ambiguousRes.body.error?.code}`);
  console.log(`[AMBIGUOUS MESSAGE] ${ambiguousRes.body.error?.message}`);

  if (ambiguousRes.status === 401 && ambiguousRes.body.error?.code === 'FACE_VERIFY_AMBIGUOUS') {
    console.log('>>> [PASS] DoD Item 2: คนที่ 2 ผ่านเกณฑ์แต่ห่างอันดับ 1 ไม่พอ (< 0.10) ถูกปฏิเสธ — VERIFIED!\n');
  } else {
    console.error('>>> [FAIL] DoD Item 2 Failed! Expected 401 FACE_VERIFY_AMBIGUOUS\n');
    process.exit(1);
  }

  // -------------------------------------------------------------------------
  // DoD Item 3: สแกนผิด 3 ครั้งสร้าง staff_call จริง
  // -------------------------------------------------------------------------
  console.log('--- TEST 3: Lockout & Automatic Staff Call Dispatch (DoD 3) ---');

  let sseEventCaptured: HospitalEvent | null = null;
  const sseListener = (evt: HospitalEvent) => {
    if (evt.event === 'staff_call') {
      sseEventCaptured = evt;
    }
  };
  hospitalEventBus.on('hospital_event', sseListener);

  const failedProbe = generateSyntheticVector('failed-probe-vector', 512);

  // Attempt 1
  const cA = await request(app).post('/api/kiosk/challenge').set('X-Requested-With', 'XMLHttpRequest').send({ kiosk_id: 'kiosk-lockout-99' });
  await request(app).post('/api/kiosk/verify').set('X-Requested-With', 'XMLHttpRequest').send({ kiosk_id: 'kiosk-lockout-99', nonce: cA.body.nonce, probe: failedProbe });
  console.log(`[SCAN 1] Failed attempts: ${defaultKioskRepository.getFailedFaceAttempts('kiosk-lockout-99')}, Staff calls: ${(await defaultKioskRepository.listStaffCalls('kiosk-lockout-99')).length}`);

  // Attempt 2
  const cB = await request(app).post('/api/kiosk/challenge').set('X-Requested-With', 'XMLHttpRequest').send({ kiosk_id: 'kiosk-lockout-99' });
  await request(app).post('/api/kiosk/verify').set('X-Requested-With', 'XMLHttpRequest').send({ kiosk_id: 'kiosk-lockout-99', nonce: cB.body.nonce, probe: failedProbe });
  console.log(`[SCAN 2] Failed attempts: ${defaultKioskRepository.getFailedFaceAttempts('kiosk-lockout-99')}, Staff calls: ${(await defaultKioskRepository.listStaffCalls('kiosk-lockout-99')).length}`);

  // Attempt 3: Triggers staff_calls
  const cC = await request(app).post('/api/kiosk/challenge').set('X-Requested-With', 'XMLHttpRequest').send({ kiosk_id: 'kiosk-lockout-99' });
  await request(app).post('/api/kiosk/verify').set('X-Requested-With', 'XMLHttpRequest').send({ kiosk_id: 'kiosk-lockout-99', nonce: cC.body.nonce, probe: failedProbe });

  const finalFailedAttempts = defaultKioskRepository.getFailedFaceAttempts('kiosk-lockout-99');
  const staffCalls = await defaultKioskRepository.listStaffCalls('kiosk-lockout-99');
  const capturedSse = sseEventCaptured as unknown as HospitalEvent | null;
  console.log(`[SCAN 3] Failed attempts: ${finalFailedAttempts}, Staff calls: ${staffCalls.length}`);
  console.log(`[STAFF CALL RECORD] ID: ${staffCalls[0]?.id}, Reason: ${staffCalls[0]?.reason}`);
  console.log(`[SSE EVENT EMITTED] Event: ${capturedSse?.event}, Data:`, capturedSse?.data);

  hospitalEventBus.off('hospital_event', sseListener);

  if (
    finalFailedAttempts >= 3 &&
    staffCalls.length >= 1 &&
    staffCalls[0].reason.includes('Excessive failed face verification') &&
    capturedSse !== null &&
    capturedSse.event === 'staff_call'
  ) {
    console.log('>>> [PASS] DoD Item 3: สแกนผิด 3 ครั้งสร้าง staff_call จริงและส่ง SSE Alert — VERIFIED!\n');
  } else {
    console.error('>>> [FAIL] DoD Item 3 Failed! Expected staff_calls record and SSE broadcast\n');
    process.exit(1);
  }

  console.log('================================================================');
  console.log('  ALL SYSTEM 7 DoD CRITERIA PASSED LIVE (100%)');
  console.log('================================================================');
}

main().catch((err) => {
  console.error('FATAL EXCEPTION in System 7 Verification:', err);
  process.exit(1);
});
