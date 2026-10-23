/**
 * scripts/verify-system-5a.ts
 * Live HTTP Verification script for System 5A: Staff & Directory
 * 
 * Verifies Definition of Done (DoD) per Master Prompt v3 line 316:
 * 1. PT cannot delete exercises they did not create (direct API call -> 403 Forbidden)
 * 2. PT cannot create admin/pt (direct API call -> 403 Forbidden)
 * 3. Destination PT sees patient ONLY during active transfer date window
 */

import request from 'supertest';
import { createApp } from '../apps/api/src/app';
import { defaultStaffRepository } from '../apps/api/src/modules/staff/repository';
import { defaultDirectoryRepository } from '../apps/api/src/modules/directory/repository';

async function main() {
  (process.env as Record<string, string>).NODE_ENV = 'test';
  console.log('================================================================');
  console.log('  SYSTEM 5A: LIVE HTTP VERIFICATION RUNNER');
  console.log('================================================================\n');

  const app = createApp();

  // Reset in-memory states if available in test harness
  (defaultStaffRepository as any).clearInMemoryStaff?.();
  (defaultDirectoryRepository as any).clearAllInMemory?.();

  // -------------------------------------------------------------------------
  // DoD Item 1: PT cannot delete or edit an exercise created by another PT
  // -------------------------------------------------------------------------
  console.log('--- TEST 1: Exercise Ownership Protection ---');
  
  // 1. PT-1 creates an exercise
  const createExRes = await request(app)
    .post('/api/exercises')
    .set('Cookie', ['access_token=mock-token:pt-001:pt:active'])
    .set('X-Requested-With', 'XMLHttpRequest')
    .send({
      title: 'Shoulder External Rotation',
      target_joint: 'shoulder',
      difficulty: 'beginner',
      default_sets: 3,
      default_reps: 12,
    });

  console.log(`[PT-1] Created Exercise ID: ${createExRes.body.data?.id}, Status: ${createExRes.status}`);
  const exerciseId = createExRes.body.data?.id;

  // 2. PT-2 attempts to edit PT-1's exercise
  const editExRes = await request(app)
    .patch(`/api/exercises/${exerciseId}`)
    .set('Cookie', ['access_token=mock-token:pt-002:pt:active'])
    .set('X-Requested-With', 'XMLHttpRequest')
    .send({ title: 'Tampered Title' });

  console.log(`[PT-2] Attempt PATCH PT-1 exercise -> Status: ${editExRes.status}, Code: ${editExRes.body.error?.code}`);

  // 3. PT-2 attempts to delete PT-1's exercise
  const deleteExRes = await request(app)
    .delete(`/api/exercises/${exerciseId}`)
    .set('Cookie', ['access_token=mock-token:pt-002:pt:active'])
    .set('X-Requested-With', 'XMLHttpRequest');

  console.log(`[PT-2] Attempt DELETE PT-1 exercise -> Status: ${deleteExRes.status}, Code: ${deleteExRes.body.error?.code}`);

  const dod1Passed = editExRes.status === 403 && deleteExRes.status === 403;
  console.log(`>>> DoD Item 1 Result: ${dod1Passed ? 'PASSED' : 'FAILED'}\n`);

  // -------------------------------------------------------------------------
  // DoD Item 2: PT cannot create admin or pt accounts
  // -------------------------------------------------------------------------
  console.log('--- TEST 2: Staff Creation Role Boundary ---');
  
  // PT attempts to create an admin account
  const ptCreateAdminRes = await request(app)
    .post('/api/staff')
    .set('Cookie', ['access_token=mock-token:pt-001:pt:active'])
    .set('X-Requested-With', 'XMLHttpRequest')
    .send({
      username: 'rogue_admin',
      password: 'StrongPassword1234!',
      role: 'admin',
      full_name: 'Rogue Admin',
    });

  console.log(`[PT-1] Attempt POST /api/staff (admin) -> Status: ${ptCreateAdminRes.status}, Code: ${ptCreateAdminRes.body.error?.code}`);

  // PT attempts to create another PT account
  const ptCreatePtRes = await request(app)
    .post('/api/staff')
    .set('Cookie', ['access_token=mock-token:pt-001:pt:active'])
    .set('X-Requested-With', 'XMLHttpRequest')
    .send({
      username: 'rogue_pt',
      password: 'StrongPassword1234!',
      role: 'pt',
      full_name: 'Rogue PT',
    });

  console.log(`[PT-1] Attempt POST /api/staff (pt) -> Status: ${ptCreatePtRes.status}, Code: ${ptCreatePtRes.body.error?.code}`);

  const dod2Passed = ptCreateAdminRes.status === 403 && ptCreatePtRes.status === 403;
  console.log(`>>> DoD Item 2 Result: ${dod2Passed ? 'PASSED' : 'FAILED'}\n`);

  // -------------------------------------------------------------------------
  // DoD Item 3: Destination PT sees patient ONLY during active transfer dates
  // -------------------------------------------------------------------------
  console.log('--- TEST 3: Temporary Case Transfer Date Integrity ---');

  const patientId = 'p-uuid-999';
  const delegatePtId = 'pt-002';
  const startDate = '2026-11-05';
  const endDate = '2026-11-15';

  // Create case transfer
  const createTransferRes = await request(app)
    .post('/api/case-transfers')
    .set('Cookie', ['access_token=mock-token:pt-001:pt:active'])
    .set('X-Requested-With', 'XMLHttpRequest')
    .send({
      patient_id: patientId,
      to_pt_id: delegatePtId,
      start_date: startDate,
      end_date: endDate,
    });

  console.log(`[PT-1] Created Case Transfer -> Status: ${createTransferRes.status}, Window: ${startDate} to ${endDate}`);

  // Check access on 2026-11-01 (Before transfer window)
  const accessBefore = await defaultDirectoryRepository.isPatientDelegatedToPt(patientId, delegatePtId, '2026-11-01');
  console.log(`Access check before window (2026-11-01): ${accessBefore ? 'GRANTED (INVALID)' : 'DENIED (CORRECT)'}`);

  // Check access on 2026-11-10 (Inside transfer window)
  const accessInside = await defaultDirectoryRepository.isPatientDelegatedToPt(patientId, delegatePtId, '2026-11-10');
  console.log(`Access check inside window (2026-11-10): ${accessInside ? 'GRANTED (CORRECT)' : 'DENIED (INVALID)'}`);

  // Check access on 2026-11-20 (After transfer window)
  const accessAfter = await defaultDirectoryRepository.isPatientDelegatedToPt(patientId, delegatePtId, '2026-11-20');
  console.log(`Access check after window (2026-11-20): ${accessAfter ? 'GRANTED (INVALID)' : 'DENIED (CORRECT)'}`);

  const dod3Passed = !accessBefore && accessInside && !accessAfter;
  console.log(`>>> DoD Item 3 Result: ${dod3Passed ? 'PASSED' : 'FAILED'}\n`);

  // -------------------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------------------
  console.log('================================================================');
  if (dod1Passed && dod2Passed && dod3Passed) {
    console.log('  ALL DEFINITION OF DONE (DoD) CRITERIA PASSED SUCCESSFULLY');
    console.log('================================================================');
    process.exit(0);
  } else {
    console.error('  SOME DoD CRITERIA FAILED');
    console.log('================================================================');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('FATAL VERIFICATION ERROR:', err);
  process.exit(1);
});
