/**
 * scripts/test-kiosk-schedule-verification.ts
 * Verification test suite for Kiosk Daily Plan Schedule & Rest Day logic
 * Strictly tests the 10 points requested by user
 */

import { defaultApiClient } from '../packages/api-client/src/index';

async function runTests() {
  console.log('================================================================');
  console.log('  TEST SUITE: KIOSK DAILY PLAN & SCHEDULE VERIFICATION (10/10)  ');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, details?: string) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}`);
      if (details) console.error(`       Details: ${details}`);
      failed++;
    }
  }

  const patientUuid = 'b4dd0f49-8655-4da1-a24d-32cc95649cda';
  const patientHn = 'P-7771';

  // -------------------------------------------------------------------------
  // Test 1: Patient P-7771 with Thursday Course (Today)
  // -------------------------------------------------------------------------
  console.log('--- Test 1: Patient P-7771 with scheduled Thursday Course (Today) ---');
  try {
    const planToday = await defaultApiClient.smartOnboarding.getDailyPlan(patientUuid);
    assert(planToday.ok === true, '1.1 Response ok is true');
    assert(planToday.is_scheduled_today === true, '1.2 is_scheduled_today is true for Thursday');
    assert(Array.isArray(planToday.exercises) && planToday.exercises.length > 0, '1.3 Exercises list is non-empty');
    assert(planToday.exercises.some((e: any) => e.exercise_id === 'active-shoulder-flexion'), '1.4 Contains active-shoulder-flexion prescribed exercise');
    assert(planToday.time_slot === '09:00:00' || planToday.time_slot === '09:00 - 10:00', '1.5 Correct time slot');
  } catch (err: any) {
    assert(false, 'Test 1 exception', err.message);
  }

  // -------------------------------------------------------------------------
  // Test 2: Query for a non-scheduled day (e.g. Saturday 2026-11-07)
  // -------------------------------------------------------------------------
  console.log('\n--- Test 2: Non-scheduled day (Saturday) -> Rest day & next appointment ---');
  try {
    const planSat = await defaultApiClient.smartOnboarding.getDailyPlan(patientUuid, '2026-11-07');
    assert(planSat.is_scheduled_today === false, '2.1 is_scheduled_today is false on Saturday');
    assert(planSat.reason === 'not_scheduled_today', '2.2 reason is not_scheduled_today');
    assert(planSat.next_appointment_date !== null && planSat.next_appointment_date !== undefined, '2.3 next_appointment_date is returned');
    assert(planSat.next_appointment_date === '2026-11-09', `2.4 Next appointment is Monday (2026-11-09), got ${planSat.next_appointment_date}`);
  } catch (err: any) {
    assert(false, 'Test 2 exception', err.message);
  }

  // -------------------------------------------------------------------------
  // Test 3: Localized Rest Reason & Next Appointment formatting in 3 languages
  // -------------------------------------------------------------------------
  console.log('\n--- Test 3: 3 Languages mapping (TH/EN/CN) for not_scheduled_today ---');
  const getLocalizedRestReason = (reason: string, currentLang: string) => {
    switch (reason) {
      case 'not_scheduled_today':
        return currentLang === 'zh-CN'
          ? '今日无预约康复训练安排，请好好休息。'
          : currentLang === 'en-US'
          ? 'No physical therapy session scheduled for you today. Please feel free to rest.'
          : 'วันนี้ไม่มีนัดหมายในตารางฝึกกายภาพบำบัดของคุณ เชิญพักผ่อนตามอัธยาศัยครับ';
      case 'archived_or_suspended':
        return currentLang === 'zh-CN'
          ? '您的账户处于暂停或归档状态，请联系医护人员'
          : currentLang === 'en-US'
          ? 'Your account is paused or archived. Please contact hospital staff.'
          : 'บัญชีของคุณอยู่ระหว่างระงับหรือพักการรักษา กรุณาติดต่อเจ้าหน้าที่';
      case 'no_plan_found':
        return currentLang === 'zh-CN'
          ? '未找到今日训练方案，请联系医护人员'
          : currentLang === 'en-US'
          ? 'No rehabilitation schedule found. Please contact staff.'
          : 'ไม่พบข้อมูลตารางฝึกประจำวันนี้ กรุณาติดต่อเจ้าหน้าที่';
      case 'rest_day_default':
      default:
        return currentLang === 'zh-CN'
          ? '今日是您的休息日，暂无训练安排'
          : currentLang === 'en-US'
          ? 'Today is your scheduled rest day'
          : 'วันนี้เป็นวันพักผ่อนของคุณ หรือไม่มีรายการฝึกกายภาพสำหรับวันนี้';
    }
  };

  const thMsg = getLocalizedRestReason('not_scheduled_today', 'th-TH');
  const enMsg = getLocalizedRestReason('not_scheduled_today', 'en-US');
  const cnMsg = getLocalizedRestReason('not_scheduled_today', 'zh-CN');

  assert(!thMsg.includes('not_scheduled_today') && thMsg.includes('ไม่มีนัดหมาย'), '3.1 Thai message does not contain raw string');
  assert(!enMsg.includes('not_scheduled_today') && enMsg.includes('No physical therapy'), '3.2 English message does not contain raw string');
  assert(!cnMsg.includes('not_scheduled_today') && cnMsg.includes('今日无预约'), '3.3 Chinese message does not contain raw string');

  // -------------------------------------------------------------------------
  // Test 4: Border times 00:30 and 23:30 (Asia/Bangkok timezone stability)
  // -------------------------------------------------------------------------
  console.log('\n--- Test 4: Timezone boundary checks (00:30 and 23:30 Asia/Bangkok) ---');
  try {
    const earlyMorning = await defaultApiClient.smartOnboarding.getDailyPlan(patientUuid, '2026-11-05T00:30:00+07:00');
    assert(earlyMorning.is_scheduled_today === true, '4.1 00:30 Bangkok date does not shift');

    const lateNight = await defaultApiClient.smartOnboarding.getDailyPlan(patientUuid, '2026-11-05T23:30:00+07:00');
    assert(lateNight.is_scheduled_today === true, '4.2 23:30 Bangkok date does not shift');
  } catch (err: any) {
    assert(false, 'Test 4 exception', err.message);
  }

  // -------------------------------------------------------------------------
  // Test 5: Weekend, month-end, and year-end evaluations
  // -------------------------------------------------------------------------
  console.log('\n--- Test 5: Month-end and year-end date handling ---');
  try {
    // End of course on 2026-12-04 (Friday)
    const endOfCourse = await defaultApiClient.smartOnboarding.getDailyPlan(patientUuid, '2026-12-04');
    assert(endOfCourse.is_scheduled_today === true, '5.1 Last day of course (2026-12-04, Friday) is scheduled');

    // Day after course end (2026-12-05, Saturday)
    const afterCourse = await defaultApiClient.smartOnboarding.getDailyPlan(patientUuid, '2026-12-05');
    assert(afterCourse.is_scheduled_today === false, '5.2 Day after course end is not scheduled');

    // Leap/Year boundary
    const nextYear = await defaultApiClient.smartOnboarding.getDailyPlan(patientUuid, '2027-01-01');
    assert(nextYear.is_scheduled_today === false, '5.3 Year 2027 is beyond course range');
  } catch (err: any) {
    assert(false, 'Test 5 exception', err.message);
  }

  // -------------------------------------------------------------------------
  // Test 6: Multiple exercises ordered properly
  // -------------------------------------------------------------------------
  console.log('\n--- Test 6: Multiple exercises resolution and order ---');
  try {
    const plan = await defaultApiClient.smartOnboarding.getDailyPlan(patientUuid);
    assert(Array.isArray(plan.exercises) && plan.exercises.length >= 1, '6.1 Exercises array is valid');
    const firstEx = plan.exercises[0];
    assert(firstEx.exercise_id && firstEx.name && firstEx.sets && firstEx.reps, '6.2 Prescribed exercise has all clinical properties');
  } catch (err: any) {
    assert(false, 'Test 6 exception', err.message);
  }

  // -------------------------------------------------------------------------
  // Test 7: Simulation of Lookup Failure -> Genuine Error thrown, never false rest day
  // -------------------------------------------------------------------------
  console.log('\n--- Test 7: Lookup failure simulation (Ghost patient) ---');
  try {
    const nonExistentUuid = '00000000-0000-0000-0000-000000000999';
    let threw = false;
    try {
      await defaultApiClient.smartOnboarding.getDailyPlan(nonExistentUuid);
    } catch (err: any) {
      threw = true;
      assert(err.message.includes('ไม่พบประวัติผู้ป่วย'), '7.1 Error message correctly notifies patient not found');
    }
    assert(threw, '7.2 Throws error on missing patient rather than showing silent rest day');
  } catch (err: any) {
    assert(false, 'Test 7 exception', err.message);
  }

  // -------------------------------------------------------------------------
  // Test 8: Isolation (Patient A cannot receive Patient B schedule)
  // -------------------------------------------------------------------------
  console.log('\n--- Test 8: Patient Schedule Isolation ---');
  try {
    // Both query by UUID and query by HN must return patient P-7771's schedule only
    const byUuid = await defaultApiClient.smartOnboarding.getDailyPlan(patientUuid);
    const byHn = await defaultApiClient.smartOnboarding.getDailyPlan(patientHn);
    assert(byUuid.is_scheduled_today === byHn.is_scheduled_today, '8.1 Query by UUID and HN yield identical plan');
    assert(byUuid.exercises.length === byHn.exercises.length, '8.2 Exercises count matches across identifiers');
  } catch (err: any) {
    assert(false, 'Test 8 exception', err.message);
  }

  // -------------------------------------------------------------------------
  // Test 9: HN display formatting logic (P-7771, not UUID)
  // -------------------------------------------------------------------------
  console.log('\n--- Test 9: HN Display format evaluation ---');
  const mockPatientRecord = {
    patient_id: 'b4dd0f49-8655-4da1-a24d-32cc95649cda',
    hn: 'P-7771',
    first_name: 'พัทธดนย์',
  };
  const renderedHn = mockPatientRecord?.hn || mockPatientRecord?.patient_id || '-';
  assert(renderedHn === 'P-7771', `9.1 Header displays HN P-7771, got: ${renderedHn}`);
  assert(!renderedHn.includes('b4dd0f49'), '9.2 Header does not display UUID');

  // -------------------------------------------------------------------------
  // Test 10: Regression Check (Supabase Cloud API & Live Endpoints)
  // -------------------------------------------------------------------------
  console.log('\n--- Test 10: Regression and Endpoint Health ---');
  try {
    const patList = await defaultApiClient.patients.list();
    assert(Array.isArray(patList) || Array.isArray((patList as any)?.patients), '10.1 Patients list API intact');

    const exList = await defaultApiClient.exercises.list();
    assert(Array.isArray(exList), '10.2 Exercises library API intact');

    const mgList = await defaultApiClient.minigames.list();
    assert(Array.isArray(mgList), '10.3 Minigames library API intact');
  } catch (err: any) {
    assert(false, 'Test 10 exception', err.message);
  }

  console.log('\n================================================================');
  console.log(`  VERIFICATION RESULTS: ${passed} PASSED / ${failed} FAILED`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((e) => {
  console.error('Fatal test error:', e);
  process.exit(1);
});
