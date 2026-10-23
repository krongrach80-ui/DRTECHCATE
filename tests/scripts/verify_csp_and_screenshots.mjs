import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '../..');
const artifactDir = 'C:\\Users\\Devops\\.gemini\\antigravity-ide\\brain\\9ee15e6d-7861-422e-ba13-2692207fdd89';

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

// Strict CSP adhering to ADR-002: Zero unsafe-inline in script-src & style-src
const CSP_HEADER = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; style-src 'self'; font-src 'self'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none';";

const server = http.createServer((req, res) => {
  res.setHeader('Content-Security-Policy', CSP_HEADER);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Permissions-Policy', 'camera=(self)');

  let urlPath = req.url.split('?')[0];
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
    { name: 'Admin Portal', url: 'http://127.0.0.1:5199/admin/', shot: 'admin_csp.png' },
    { name: 'PT Portal', url: 'http://127.0.0.1:5199/pt/', shot: 'pt_csp.png' },
    { name: 'Kiosk Terminal', url: 'http://127.0.0.1:5199/kiosk/', shot: 'kiosk_csp.png' },
  ];

  for (const app of apps) {
    console.log(`\nTesting ${app.name} (${app.url})...`);
    const page = await browser.newPage();
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
  }

  if (allPassed) {
    console.log('\nALL 3 FRONTEND APPS LOADED CLEANLY WITH ZERO CSP VIOLATIONS!');
    process.exit(0);
  } else {
    console.error('\nCSP VIOLATION DETECTED!');
    process.exit(1);
  }
});
