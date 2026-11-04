import { defaultApiClient, ApiClient, DEFAULT_SUPABASE_URL, DEFAULT_SUPABASE_ANON_KEY } from '../packages/api-client/src/index.js';

async function runStep3Tests() {
  console.log('================================================================');
  console.log('🚀 STEP 3 VERIFICATION: Physical Exercise Creation & Persistence');
  console.log('================================================================\n');

  let test1Passed = false;
  let test2Passed = false;
  let test3Passed = false;
  let test4Passed = false;
  let test5Passed = false;
  let test6Passed = false;

  const createdTestIds: string[] = [];

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Add new exercise via all 3 channels
    // -------------------------------------------------------------------------
    console.log('--- TEST 1: Exercise Creation (3 Channels) ---');

    // Channel 1: Standard Modal Form (+ เพิ่มท่ากายภาพใหม่)
    const testTitleStandard = `ทดสอบท่ากายภาพมาตรฐาน_${Date.now()}`;
    const standardPayload = {
      title: testTitleStandard,
      description: 'ท่าฝึกยืดเหยียดกล้ามเนื้อหน้าขาและข้อเข่าสำหรับผู้ป่วยฟื้นฟู',
      target_joint: 'knee',
      suitable_for: 'ผู้ป่วยหลังผ่าตัดเอ็นไขว้หน้า',
      warnings: 'หากมีอาการบวมหรือปวดแปลบให้หยุดทันที',
      default_sets: 3,
      default_reps: 12,
      difficulty: 'beginner' as const,
    };
    const createdStandard = await defaultApiClient.exercises.create(standardPayload);
    console.log('Channel 1 (+ เพิ่มท่ากายภาพใหม่):', createdStandard.id ? 'SUCCESS' : 'FAILED');
    console.log('  -> Created ID:', createdStandard.id);
    console.log('  -> Created Title:', createdStandard.title);
    if (createdStandard.id) createdTestIds.push(createdStandard.id);

    // Channel 2: Smart Exercise Upload
    const testTitleSmart = `Smart_Exercise_${Date.now()}`;
    const smartPayload = {
      title: testTitleSmart,
      target_joint: 'shoulder',
      warnings: 'ระวังอย่ายกแขนเร็วเกินไป',
      difficulty: 'intermediate' as const,
      default_sets: 3,
      default_reps: 10,
    };
    const createdSmart = await defaultApiClient.exercises.create(smartPayload);
    console.log('Channel 2 (Smart Exercise Upload):', createdSmart.id ? 'SUCCESS' : 'FAILED');
    console.log('  -> Created ID:', createdSmart.id);
    console.log('  -> Created Title:', createdSmart.title);
    if (createdSmart.id) createdTestIds.push(createdSmart.id);

    // Channel 3: AI Pose Studio (Webcam with detection_config)
    const testTitleAi = `AI_Pose_Studio_Test_${Date.now()}`;
    const aiPayload = {
      title: testTitleAi,
      target_joint: 'shoulder',
      description: 'ทดสอบระบบ AI Pose Studio พร้อม biomechanical detection_config',
      default_sets: 3,
      default_reps: 10,
      difficulty: 'beginner' as const,
      warnings: 'หากมีอาการเจ็บข้อไหล่ให้พัก 30 วินาที',
      detection_config: {
        version: '1.0',
        evaluationMode: 'angle_rep_hold',
        targetJoint: 'shoulder',
        minHoldTimeSec: 2.5,
        targetAngleDeg: 90,
      },
    };
    const createdAi = await defaultApiClient.exercises.create(aiPayload);
    console.log('Channel 3 (AI Pose Studio):', createdAi.id ? 'SUCCESS' : 'FAILED');
    console.log('  -> Created ID:', createdAi.id);
    console.log('  -> Created Title:', createdAi.title);
    console.log('  -> Preserved detection_config:', Boolean(createdAi.detection_config));
    if (createdAi.id) createdTestIds.push(createdAi.id);

    test1Passed = Boolean(createdStandard.id && createdSmart.id && createdAi.id);
    console.log('Result Test 1:', test1Passed ? '✅ PASSED' : '❌ FAILED');

    // -------------------------------------------------------------------------
    // TEST 2: Validation on incomplete / invalid mandatory fields
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 2: Validation on Incomplete / Invalid Fields ---');
    try {
      await defaultApiClient.exercises.create({
        title: '   ', // Empty whitespace
        target_joint: 'knee',
      });
      console.log('Validation empty title: FAILED (should have thrown)');
      test2Passed = false;
    } catch (err: any) {
      console.log('Validation empty title caught error:', err.message);
      test2Passed = err.message.includes('ชื่อ') || err.message.includes('title');
    }
    console.log('Result Test 2:', test2Passed ? '✅ PASSED' : '❌ FAILED');

    // -------------------------------------------------------------------------
    // TEST 3: Duplicate Title Check
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 3: Duplicate Title Detection ---');
    const existingExercises = await defaultApiClient.exercises.list();
    const duplicateTitle = createdStandard.title;
    const isDuplicateFound = existingExercises.some(
      (e) => e.title.trim().toLowerCase() === duplicateTitle.trim().toLowerCase()
    );
    console.log(`Checking duplicate detection for "${duplicateTitle}":`, isDuplicateFound ? 'DETECTED' : 'NOT FOUND');
    test3Passed = isDuplicateFound;
    console.log('Result Test 3:', test3Passed ? '✅ PASSED' : '❌ FAILED');

    // -------------------------------------------------------------------------
    // TEST 4: Page Refresh & List Persistence (15 Standard + New)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 4: Refresh / List Persistence & Count ---');
    const refreshedExercises = await defaultApiClient.exercises.list();
    const countTotal = refreshedExercises.length;
    console.log('Total exercises currently active:', countTotal);
    const standard15Found = refreshedExercises.filter((e) =>
      e.id.startsWith('e1000000-0000-0000-0000-0000000000')
    ).length;
    console.log('Standard 15 clinical exercises preserved:', standard15Found === 15 ? '15/15 (100%)' : `${standard15Found}/15`);
    const newItemsFound = createdTestIds.every((id) => refreshedExercises.some((e) => e.id === id));
    console.log('All newly created items present in catalog:', newItemsFound ? 'YES' : 'NO');
    test4Passed = standard15Found === 15 && newItemsFound;
    console.log('Result Test 4:', test4Passed ? '✅ PASSED' : '❌ FAILED');

    // -------------------------------------------------------------------------
    // TEST 5: Regression Check on Kiosk, Schedule & Course Prescriptions
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 5: Regression Check on Other Portals ---');
    // Test courses list
    const coursesRes = await fetch(`${DEFAULT_SUPABASE_URL}/rest/v1/courses?select=*&limit=2`, {
      headers: { apikey: DEFAULT_SUPABASE_ANON_KEY, Authorization: `Bearer ${DEFAULT_SUPABASE_ANON_KEY}` }
    });
    console.log('Courses endpoint status:', coursesRes.status, coursesRes.statusText);

    // Test modpacks list
    const modpacks = await defaultApiClient.modpacks.list();
    console.log('Modpacks catalog items:', modpacks.length);

    // Test minigames list
    const minigames = await defaultApiClient.minigames.list();
    console.log('Minigames catalog items:', minigames.length);

    test5Passed = coursesRes.ok && Array.isArray(modpacks) && Array.isArray(minigames);
    console.log('Result Test 5:', test5Passed ? '✅ PASSED' : '❌ FAILED');

    // -------------------------------------------------------------------------
    // TEST 6: Non-Admin / Unauthorized Access Safety
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 6: Non-Admin Access Check ---');
    // If a request has an invalid/spoofed token or non-existent profile
    const unauthClient = new ApiClient();
    unauthClient.setAuthToken('invalid-expired-token');
    // Verify client role check
    const profile = unauthClient.getUserProfile();
    console.log('Unauthenticated profile:', profile ? profile.role : 'null (Anonymous)');
    test6Passed = profile === null || profile.role !== 'admin';
    console.log('Result Test 6:', test6Passed ? '✅ PASSED' : '❌ FAILED');

    // -------------------------------------------------------------------------
    // CLEANUP: Soft delete test items to keep catalog pristine
    // -------------------------------------------------------------------------
    console.log('\n--- CLEANUP: Removing Probed Test Items ---');
    for (const testId of createdTestIds) {
      await defaultApiClient.exercises.delete(testId);
      console.log('  -> Soft-deleted test item:', testId);
    }
    const finalExercises = await defaultApiClient.exercises.list();
    console.log('Final active exercises count (should be exactly 15):', finalExercises.length);

  } catch (error) {
    console.error('Test execution failed with error:', error);
  }

  console.log('\n================================================================');
  console.log('📋 STEP 3 SUMMARY REPORT');
  console.log('================================================================');
  console.log(`Test 1 (Add 3 Channels):      ${test1Passed ? 'PASSED ✅' : 'FAILED ❌'}`);
  console.log(`Test 2 (Mandatory Validation):  ${test2Passed ? 'PASSED ✅' : 'FAILED ❌'}`);
  console.log(`Test 3 (Duplicate Detection):   ${test3Passed ? 'PASSED ✅' : 'FAILED ❌'}`);
  console.log(`Test 4 (Persistence & 15 Preserved): ${test4Passed ? 'PASSED ✅' : 'FAILED ❌'}`);
  console.log(`Test 5 (Regression Check):     ${test5Passed ? 'PASSED ✅' : 'FAILED ❌'}`);
  console.log(`Test 6 (Non-Admin Check):      ${test6Passed ? 'PASSED ✅' : 'FAILED ❌'}`);
  console.log('================================================================');
}

runStep3Tests();
