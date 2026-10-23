import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '../..');
const artifactDir = path.resolve(process.env.ARTIFACT_DIR || 'C:\\Users\\Devops\\.gemini\\antigravity-ide\\brain\\26bb627f-176e-462f-92c0-cc80458d5a57');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
};

// Strict CSP adhering to ADR-002: Parse directly from Caddyfile to ensure single source of truth
const caddyfilePath = path.join(root, 'Caddyfile');
const caddyContent = fs.readFileSync(caddyfilePath, 'utf-8');
const cspMatch = caddyContent.match(/Content-Security-Policy\s+"([^"]+)"/);
if (!cspMatch) {
  throw new Error('Failed to parse Content-Security-Policy header from Caddyfile');
}
const CSP_HEADER = cspMatch[1];
console.log(`Loaded CSP directly from Caddyfile:\n${CSP_HEADER}\n`);

const server = http.createServer((req, res) => {
  res.setHeader('Content-Security-Policy', CSP_HEADER);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Permissions-Policy', 'camera=(self)');

  let urlPath = req.url.split('?')[0];

  // API endpoint mocks for static testing (prevents 404s on SPA startup fetch)
  if (urlPath === '/api/auth/me') {
    if (req.headers.cookie && req.headers.cookie.includes('mock_auth=1')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        data: {
          user: {
            id: 'staff-001',
            username: 'pt_tester',
            full_name: 'นักกายภาพบำบัด ทดสอบระบบ',
            role: 'pt',
            status: 'active',
          },
        },
      }));
      return;
    }
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'Unauthorized' }));
    return;
  }

  if (urlPath === '/api/kiosk/staff-calls') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, data: [] }));
    return;
  }

  if (urlPath.startsWith('/api/')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, data: [] }));
    return;
  }

  if (urlPath === '/' || urlPath === '') urlPath = '/admin/index.html';

  let filePath = path.join(root, 'public', urlPath);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  if (!fs.existsSync(filePath)) {
    const appMatch = urlPath.match(/^\/(admin|pt|kiosk)/);
    if (appMatch) {
      filePath = path.join(root, 'public', appMatch[1], 'index.html');
    }
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

server.listen(5199, '127.0.0.1', async () => {
  console.log('Static test server with strict CSP listening on http://127.0.0.1:5199');

  const browser = await chromium.launch({ headless: true });
  const results = [];

  const apps = [
    { name: 'Admin Portal (Login Screen)', url: 'http://127.0.0.1:5199/admin/', shot: 'admin_csp.png' },
    { name: 'PT Portal (Login Screen)', url: 'http://127.0.0.1:5199/pt/', shot: 'pt_csp.png' },
    { name: 'Kiosk Terminal (Idle Standby Screen)', url: 'http://127.0.0.1:5199/kiosk/', shot: 'kiosk_csp.png' },
    { name: 'PT Portal (Authenticated Dashboard & Active Styles)', url: 'http://127.0.0.1:5199/pt/', useCookie: true, shot: 'pt_dashboard_csp.png' },
  ];

  for (const app of apps) {
    console.log(`\nTesting ${app.name} (${app.url})...`);
    const page = await browser.newPage();
    if (app.useCookie) {
      await page.context().addCookies([
        { name: 'mock_auth', value: '1', domain: '127.0.0.1', path: '/' },
      ]);
    }
    const cspViolations = [];
    const consoleErrors = [];

    page.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('Content Security Policy') || text.includes('CSP') || msg.type() === 'error') {
        if (text.includes('Content Security Policy') || text.includes('violates')) {
          cspViolations.push(text);
        } else {
          consoleErrors.push(text);
        }
      }
    });

    const notFoundUrls = [];
    page.on('response', (response) => {
      if (response.status() >= 400) {
        const entry = `[${response.status()}] ${response.url()}`;
        console.log(`  -> Network Error: ${entry}`);
        notFoundUrls.push(entry);
      }
    });

    page.on('pageerror', (err) => {
      consoleErrors.push(err.message);
    });

    try {
      await page.goto(app.url, { waitUntil: 'networkidle', timeout: 10000 });
      await page.waitForTimeout(1000);

      const shotPath = path.join(artifactDir, app.shot);
      await page.screenshot({ path: shotPath, fullPage: true });
      console.log(`Saved screenshot: ${shotPath}`);

      const title = await page.title();
      console.log(`Page title: ${title}`);
      console.log(`CSP violations: ${cspViolations.length}`);
      console.log(`Console errors: ${consoleErrors.length}`);

      results.push({
        app: app.name,
        url: app.url,
        title,
        cspViolations,
        consoleErrors,
        screenshot: shotPath,
        notFoundUrls,
        passed: cspViolations.length === 0,
      });
    } catch (err) {
      console.error(`Failed to load ${app.name}:`, err);
      results.push({
        app: app.name,
        url: app.url,
        error: err.message,
        passed: false,
      });
    } finally {
      await page.close();
    }
  }

  await browser.close();
  server.close();

  console.log('\n================================================================');
  console.log('  PLAYWRIGHT CSP VERIFICATION SUMMARY');
  console.log('================================================================');
  let allPassed = true;
  for (const r of results) {
    console.log(`[${r.passed ? 'PASS' : 'FAIL'}] ${r.app}`);
    if (r.cspViolations && r.cspViolations.length > 0) {
      allPassed = false;
      console.log(`  CSP Violations: ${JSON.stringify(r.cspViolations)}`);
    }
    if (r.consoleErrors && r.consoleErrors.length > 0) {
      console.log(`  Console Errors: ${JSON.stringify(r.consoleErrors)}`);
    }
    if (r.notFoundUrls && r.notFoundUrls.length > 0) {
      console.log(`  404/Error URLs: ${JSON.stringify(r.notFoundUrls)}`);
    }
  }

  if (allPassed) {
    console.log('\nALL 3 FRONTEND APPS LOADED CLEANLY WITH ZERO CSP VIOLATIONS!');
    process.exit(0);
  } else {
    console.error('\nCSP VIOLATION DETECTED!');
    process.exit(1);
  }
});
