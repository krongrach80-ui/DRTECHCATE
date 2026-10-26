import { chromium } from 'playwright';

async function testLiveVercel() {
  console.log('--- Testing Live Production on https://drtechcarev2.vercel.app ---');
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();

    console.log('1. Navigating to https://drtechcarev2.vercel.app ...');
    await page.goto('https://drtechcarev2.vercel.app/', { waitUntil: 'networkidle', timeout: 30000 });
    console.log('✓ Page loaded:', page.url());

    console.log('2. Clicking staff login trigger...');
    const triggerBtn = page.locator('#open-staff-login-btn, [data-testid="open-staff-login-btn"], #header-open-staff-login-btn');
    await triggerBtn.first().waitFor({ state: 'visible', timeout: 10000 });
    await triggerBtn.first().click();

    console.log('3. Filling credentials: director ...');
    const usernameInput = page.locator('#staff-login-username, [data-testid="staff-login-username"]');
    await usernameInput.waitFor({ state: 'visible', timeout: 5000 });
    await usernameInput.fill('director');
    await page.locator('#staff-login-password, [data-testid="staff-login-password"]').fill('Admin12345678!');

    console.log('4. Clicking submit...');
    const submitBtn = page.locator('#staff-login-submit-btn, [data-testid="staff-login-submit-btn"]');
    await submitBtn.click();

    console.log('5. Waiting for ClinicalAdminShell...');
    const adminShell = page.locator('#clinical-admin-shell, [data-testid="clinical-admin-shell"], :has-text("Hospital Clinical Administration Portal")');
    await adminShell.first().waitFor({ state: 'visible', timeout: 15000 });
    console.log('✓ ClinicalAdminShell rendered on https://drtechcarev2.vercel.app !');
    console.log('Current URL:', page.url());

    console.log('6. Reloading page to test session persistence...');
    await page.reload({ waitUntil: 'networkidle' });
    await adminShell.first().waitFor({ state: 'visible', timeout: 10000 });
    console.log('✓ Session persisted on live Vercel after reload!');
    console.log('--- LIVE TEST PASSED 100% ---');
  } finally {
    await browser.close();
  }
}

testLiveVercel().catch((e) => {
  console.error('LIVE TEST ERROR:', e);
  process.exit(1);
});
