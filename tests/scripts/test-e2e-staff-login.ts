import { chromium } from 'playwright';
import http from 'http';
import { createApp } from '../../apps/api/src/app';
import { activateLocalPersistenceEngine } from '../../apps/api/src/lib/localStorage/localPersistenceEngine';

async function runE2ETest() {
  console.log('========================================================');
  console.log('   STARTING PLAYWRIGHT E2E TEST: STAFF LOGIN FLOW');
  console.log('========================================================\n');

  // 1. Activate Local Persistence Engine & Start Local Server
  const PORT = 3123;
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

  let browser;
  try {
    // 2. Launch Playwright Chromium
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
    const page = await context.newPage();

    // Listen to console errors
    page.on('console', (msg) => {
      console.log(`[Browser Console ${msg.type()}]: ${msg.text()}`);
    });
    page.on('pageerror', (err) => {
      console.log(`[Browser PageError]:`, err.message);
    });

    // 3. Open Root URL
    console.log(`Navigating to http://127.0.0.1:${PORT}/ ...`);
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle' });
    console.log('Page loaded! URL:', page.url());
    console.log('Page Title:', await page.title());
    const bodyText = await page.innerText('body').catch(() => '');
    console.log('Body text preview:', bodyText.slice(0, 300));

    // 4. Locate and click "เข้าสู่ระบบบุคลากร / รพ." button
    console.log('Looking for Staff Login Trigger button...');
    const triggerBtn = page.locator('#open-staff-login-btn, [data-testid="open-staff-login-btn"], #header-open-staff-login-btn');
    await triggerBtn.first().waitFor({ state: 'visible', timeout: 8000 });
    console.log('✓ Found Staff Login Trigger button. Clicking...');
    await triggerBtn.first().click();

    // 5. Verify Modal Opens
    const usernameInput = page.locator('#staff-login-username, [data-testid="staff-login-username"]');
    await usernameInput.waitFor({ state: 'visible', timeout: 5000 });
    console.log('✓ Staff Login Modal opened successfully.');

    // 6. Verify Input Padding (no overlap with icon)
    const paddingLeft = await usernameInput.evaluate((el) => {
      return window.getComputedStyle(el).paddingLeft;
    });
    console.log(`✓ Username input padding-left is: ${paddingLeft}`);
    const paddingLeftPx = parseFloat(paddingLeft);
    if (paddingLeftPx < 40) {
      throw new Error(`Padding left (${paddingLeft}) is too small (< 40px), icons may overlap text!`);
    }

    // 7. Verify Return Button text (no double arrows)
    const returnBtn = page.locator('button:has-text("กลับหน้าหลัก (คนไข้)")');
    const returnBtnText = (await returnBtn.innerText()).trim();
    console.log(`✓ Return button text: "${returnBtnText}"`);
    if (returnBtnText.includes('← ←') || returnBtnText.includes('<- <-')) {
      throw new Error(`Return button contains duplicate arrows: "${returnBtnText}"`);
    }

    // 8. Type credentials
    const passwordInput = page.locator('#staff-login-password, [data-testid="staff-login-password"]');
    const submitBtn = page.locator('#staff-login-submit-btn, [data-testid="staff-login-submit-btn"]');

    console.log('Typing credentials: director / Admin12345678! ...');
    await usernameInput.fill('director');
    await passwordInput.fill('Admin12345678!');

    // 9. Click Submit Button
    console.log('Clicking "เข้าสู่ระบบบุคลากร" submit button...');
    await submitBtn.click();

    // 10. Wait for Transition to ClinicalAdminShell
    console.log('Waiting for screen transition into ClinicalAdminShell...');
    const adminShell = page.locator('#clinical-admin-shell, [data-testid="clinical-admin-shell"], :has-text("Hospital Clinical Administration Portal")');
    await adminShell.first().waitFor({ state: 'visible', timeout: 10000 });
    console.log('✓ Super Admin Dashboard (ClinicalAdminShell) rendered successfully!');

    // Verify current URL has switched to /admin
    const currentUrl = page.url();
    console.log(`✓ Current browser URL: ${currentUrl}`);
    if (!currentUrl.includes('/admin')) {
      throw new Error(`Expected URL to include /admin but got: ${currentUrl}`);
    }

    // 11. Test Session Persistence across page reload
    console.log('Testing session persistence across page reload at /admin...');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    await adminShell.first().waitFor({ state: 'visible', timeout: 8000 });
    console.log('✓ Session persisted! ClinicalAdminShell is still rendered after reload.');

    console.log('\n========================================================');
    console.log('✓ ALL PLAYWRIGHT E2E CHECKS PASSED 100%!');
    console.log('========================================================\n');
  } finally {
    if (browser) {
      await browser.close();
    }
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
  }
}

runE2ETest().catch((err) => {
  console.error('\n❌ E2E TEST FAILED:', err);
  process.exit(1);
});
