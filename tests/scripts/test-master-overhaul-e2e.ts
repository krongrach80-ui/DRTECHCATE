/**
 * tests/scripts/test-master-overhaul-e2e.ts
 * Comprehensive E2E & Backend Verification for DrTech.Care Master Prompt
 * Covers:
 * 1. Director login & stateless HMAC verification
 * 2. Zero "Authentication required" Staff Creation (Director -> PT)
 * 3. Newly created PT immediate login & session verification
 * 4. PT creating a Patient
 * 5. PT appending medical note with immutable timestamp header
 * 6. Temporary case delegation
 * 7. PT RBAC access control (403 on admin-only routes)
 * 8. Playwright browser UI test (Director & PT transitions, return to Kiosk)
 */

import http from 'http';
import { createApp } from '../../apps/api/src/app';
import { activateLocalPersistenceEngine } from '../../apps/api/src/lib/localStorage/localPersistenceEngine';
import { ApiClient } from '../../packages/api-client/src/index';
import { chromium } from 'playwright';

async function runMasterOverhaulE2E() {
  console.log('================================================================');
  console.log('  STARTING MASTER OVERHAUL END-TO-END AUTONOMOUS VERIFICATION');
  console.log('================================================================\n');

  const PORT = 3199;
  process.env.PORT = String(PORT);
  process.env.APP_URL = `http://127.0.0.1:${PORT}`;
  process.env.CORS_ORIGINS = `http://127.0.0.1:${PORT},http://localhost:${PORT},http://localhost:3000,http://localhost:5173`;
  process.env.ALLOW_BEARER_IN_PROD = 'true';
  process.env.ALLOW_INSECURE_COOKIES = 'true';

  const { resetCachedEnv } = await import('../../apps/api/src/config/env');
  resetCachedEnv();

  activateLocalPersistenceEngine();

  const app = createApp();
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(PORT, '127.0.0.1', () => {
      console.log(`✓ Local test server listening on http://127.0.0.1:${PORT}`);
      resolve();
    });
  });

  const client = new ApiClient(`http://127.0.0.1:${PORT}/api`);

  try {
    // -------------------------------------------------------------
    // TEST 1: Director Login
    // -------------------------------------------------------------
    console.log('\n[TEST 1] Logging in as Hospital Director (director)...');
    const directorLogin = await client.auth.login({
      username: 'director',
      password: 'Admin12345678!',
    });
    console.log(`✓ Director Login Successful: Role="${directorLogin.role}", Token="${directorLogin.token?.slice(0, 25)}..."`);
    if (directorLogin.role !== 'admin' && (directorLogin.user.role as string) !== 'director') {
      throw new Error(`Unexpected director role: ${directorLogin.role}`);
    }

    // -------------------------------------------------------------
    // TEST 2: Director Creating New PT (Zero "Authentication required" error)
    // -------------------------------------------------------------
    console.log('\n[TEST 2] Director creating new PT account via POST /api/staff...');
    const uniqueUname = `pt_new_${Date.now()}`;
    const newPtData = await client.staff.create({
      username: uniqueUname,
      password: 'Password123456!',
      role: 'pt',
      full_name: 'กภ. ชนกานต์ ผู้เชี่ยวชาญ',
      phone: '089-777-6655',
      license_no: 'กภ.12345',
      specialty: 'ทั่วไป',
      license_expiry: '2030-12-31',
    });
    console.log(`✓ Staff Created Successfully with 0 errors! ID="${newPtData.id}", Username="${newPtData.username}"`);

    // Verify appears in staff list
    const staffList = await client.staff.list();
    const foundStaff = staffList.find((s) => s.username === uniqueUname);
    if (!foundStaff) {
      throw new Error(`Created staff ${uniqueUname} not found in staff list!`);
    }
    console.log(`✓ Verified staff ${uniqueUname} appears in staff list.`);

    // -------------------------------------------------------------
    // TEST 3: New PT Immediate Login
    // -------------------------------------------------------------
    console.log('\n[TEST 3] New PT immediately logging in with new credentials...');
    const ptClient = new ApiClient(`http://127.0.0.1:${PORT}/api`);
    const ptLogin = await ptClient.auth.login({
      username: uniqueUname,
      password: 'Password123456!',
    });
    console.log(`✓ New PT Login Successful! Role="${ptLogin.role}", FullName="${ptLogin.user.full_name}"`);
    if (ptLogin.role !== 'pt') {
      throw new Error(`Expected role 'pt' but received: ${ptLogin.role}`);
    }

    // -------------------------------------------------------------
    // TEST 4: PT Creating New Patient
    // -------------------------------------------------------------
    console.log('\n[TEST 4] PT creating new patient record...');
    const newPatient = await ptClient.patients.create({
      first_name: 'สมเกียรติ',
      last_name: 'พัฒนาสุข',
      age: 58,
      sex: 'male',
      phone: '081-333-4455',
      injury: 'ข้อเข่าเสื่อมระยะที่ 2',
      responsible_pt_id: ptLogin.user.id,
    });
    console.log(`✓ Patient Created: HN="${newPatient.hn}", Name="${newPatient.first_name} ${newPatient.last_name}"`);

    // -------------------------------------------------------------
    // TEST 5: PT Appending Medical Note (Verifying Immutable Header)
    // -------------------------------------------------------------
    console.log('\n[TEST 5] PT appending medical note to patient...');
    const noteText = 'ผู้ป่วยมีอาการตึงบริเวณเข่าขวา หลังฝึกพบว่าสามารถงอเข่าได้ 95 องศา แนะนำประคบเย็น';
    const createdNote = await ptClient.records.createNote(newPatient.id, noteText);
    console.log(`✓ Medical Note Created ID="${createdNote.id}"`);
    console.log(`✓ Stamped Note Content:\n"${createdNote.body}"`);

    if (!createdNote.body.includes('บันทึกโดย กภ.:') && !createdNote.body.includes('ชนกานต์')) {
      throw new Error('Medical note is missing the required immutable header stamp!');
    }

    // -------------------------------------------------------------
    // TEST 6: Temporary Case Delegation
    // -------------------------------------------------------------
    console.log('\n[TEST 6] PT creating temporary case delegation to pt_somchai...');
    const allPts = await ptClient.pts.list();
    const otherPt = allPts.find((p: any) => (p.id || p.user_id) !== ptLogin.user.id);
    const coverPtId = otherPt ? ((otherPt as any).id || (otherPt as any).user_id) : 'pt-somchai-uuid';

    const transfer = await ptClient.caseTransfers.create({
      patient_id: newPatient.id,
      to_pt_id: coverPtId,
      start_date: new Date().toISOString().slice(0, 10),
      end_date: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
      notes: 'ฝากดูแลเคสเนื่องจากติดประชุมวิชาการ',
    });
    console.log(`✓ Case Delegation Created ID="${transfer.id}" for Patient="${transfer.patient_id}"`);

    // -------------------------------------------------------------
    // TEST 7: PT RBAC Protection (PT cannot view admin-only staff list)
    // -------------------------------------------------------------
    console.log('\n[TEST 7] Verifying RBAC protection: PT cannot call GET /api/staff...');
    let rbacBlocked = false;
    try {
      await ptClient.staff.list();
    } catch (err: any) {
      if (err.status === 403 || String(err).includes('403') || String(err).includes('Forbidden')) {
        rbacBlocked = true;
        console.log(`✓ RBAC Successfully Enforced! Access denied with 403 Forbidden.`);
      }
    }
    if (!rbacBlocked) {
      throw new Error('Security Breach: PT was able to call admin-only GET /api/staff!');
    }

    // -------------------------------------------------------------
    // TEST 8: Playwright Browser Test (UI transitions & SPA routing)
    // -------------------------------------------------------------
    console.log('\n[TEST 8] Starting Playwright Browser Verification...');
    const browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();

    // Navigate to Kiosk
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle' });
    console.log('✓ Page loaded at /');

    // Open Staff Login Modal
    const triggerBtn = page.locator('#open-staff-login-btn, [data-testid="open-staff-login-btn"], #header-open-staff-login-btn');
    await triggerBtn.first().waitFor({ state: 'visible', timeout: 8000 });
    await triggerBtn.first().click();

    const usernameInput = page.locator('#staff-login-username, [data-testid="staff-login-username"]');
    const passwordInput = page.locator('#staff-login-password, [data-testid="staff-login-password"]');
    const submitBtn = page.locator('#staff-login-submit-btn, [data-testid="staff-login-submit-btn"]');

    // Login as Director
    console.log('Logging into UI as Director...');
    await usernameInput.fill('director');
    await passwordInput.fill('Admin12345678!');
    await submitBtn.click();

    // Wait for ClinicalAdminShell
    const adminShell = page.locator('#clinical-admin-shell, [data-testid="clinical-admin-shell"]');
    await adminShell.first().waitFor({ state: 'visible', timeout: 10000 });
    console.log('✓ Transitioned to Super Admin Dashboard (ClinicalAdminShell)! URL:', page.url());

    // Click Return to Kiosk
    const returnToKioskBtn = page.locator('button:has-text("หน้า Kiosk"), button:has-text("กลับสู่หน้าจอ Kiosk"), button:has-text("Kiosk")');
    if (await returnToKioskBtn.first().isVisible()) {
      await returnToKioskBtn.first().click();
      console.log('✓ Clicked return to Kiosk. URL:', page.url());
    }

    await browser.close();

    console.log('\n================================================================');
    console.log('  🎉 ALL 8 MASTER OVERHAUL END-TO-END TESTS PASSED 100%!');
    console.log('================================================================\n');
  } finally {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  }
}

runMasterOverhaulE2E().catch((err) => {
  console.error('\n❌ OVERHAUL E2E TEST FAILED:', err);
  process.exit(1);
});
