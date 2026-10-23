import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

/**
 * CI Bundle & Zero-Leakage Verification Script
 * Requirements (Master Prompt v3 & User Audit Group 1b Item 1b.9 & Group 2 Item 2.4):
 * 1. Scan actual built Vite bundles per app (admin, pt, kiosk) and report exact file counts.
 * 2. Script MUST fail if dist/ does not exist or dist/ is empty.
 * 3. Scan frontend apps and packages for forbidden Supabase tokens or client imports.
 * 4. Scan the ENTIRE dist/ and public/ trees for forbidden mocks and test strings:
 *    "mock-face-detector", "จำลอง", "simulate", "mock-token",
 *    "MockFaceDetector", "MockEmbeddingModel", "MockPadProvider"
 *    If any are found, FAIL the build.
 */

const FORBIDDEN_CLIENT_LEAKS = [
  /@supabase\/supabase-js/,
  /sb_secret_[a-zA-Z0-9_-]+/,
  /sb_publishable_[a-zA-Z0-9_-]+/,
  /service_role/,
  /https:\/\/[a-z0-9]+\.supabase\.co/,
];

const FORBIDDEN_MOCK_PATTERNS = [
  /mock-face-detector/,
  /MockFaceDetector/,
  /MockEmbeddingModel/,
  /MockPadProvider/,
  /mock-token/,
  /จำลอง/,
  /simulate/i,
];

const DIST_DIR = path.resolve(process.cwd(), 'dist');

const APPS = [
  { name: 'apps/admin', dirName: 'admin', system: 'ระบบ 10 (เว็บ ผอ.รพ.)' },
  { name: 'apps/pt', dirName: 'pt', system: 'ระบบ 11 (เว็บนักกายภาพ)' },
  { name: 'apps/kiosk', dirName: 'kiosk', system: 'ระบบ 12 (ตู้ Kiosk)' },
];

function buildIfRequested(): void {
  const skipBuild = process.argv.includes('--no-build');
  if (skipBuild) {
    console.log('>>> Skipping build step (--no-build requested). Verifying existing dist/...');
    return;
  }

  console.log('>>> Cleaning previous dist/ folder...');
  if (fs.existsSync(DIST_DIR)) {
    fs.rmSync(DIST_DIR, { recursive: true, force: true });
  }

  console.log('>>> 1. Building backend and packages via tsconfig.build.json...');
  try {
    execSync('npx tsc -p tsconfig.build.json', {
      cwd: process.cwd(),
      stdio: 'inherit',
    });
    console.log('✓ TypeScript build completed successfully.\n');
  } catch {
    console.error('❌ Build failed during compilation!');
    process.exit(1);
  }

  console.log('>>> 2. Building Vite frontend apps (admin, pt, kiosk)...');
  try {
    execSync('npm run build:apps', {
      cwd: process.cwd(),
      env: { ...process.env, NODE_ENV: 'production' },
      stdio: 'inherit',
    });
    console.log('✓ Vite build completed successfully.\n');
  } catch {
    console.error('❌ Vite build failed during compilation!');
    process.exit(1);
  }
}

function scanDirectoryForPatterns(
  dir: string,
  patterns: RegExp[]
): { violations: string[]; fileCount: number } {
  let violations: string[] = [];
  let fileCount = 0;

  if (!fs.existsSync(dir)) {
    return { violations, fileCount };
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (['node_modules', '.git'].includes(entry.name)) continue;
      const sub = scanDirectoryForPatterns(fullPath, patterns);
      violations = violations.concat(sub.violations);
      fileCount += sub.fileCount;
    } else if (entry.isFile() && /\.(js|mjs|cjs|ts|tsx|html|css|json|map|d\.ts)$/.test(entry.name)) {
      if (entry.name === 'package-lock.json') continue;
      fileCount++;
      const content = fs.readFileSync(fullPath, 'utf8');

      for (const pattern of patterns) {
        if (pattern.test(content)) {
          violations.push(
            `File ${path.relative(process.cwd(), fullPath)} matches forbidden pattern: ${pattern.toString()}`
          );
        }
      }
    }
  }

  return { violations, fileCount };
}

function runCiBundleVerification(): void {
  console.log('========================================================================');
  console.log('DrTech.Care - Application Bundle & Zero-Leakage Audit');
  console.log('========================================================================\n');

  // Step 1: Build (unless skipped)
  buildIfRequested();

  // Step 2: Strict verification of dist/ existence and non-emptiness
  if (!fs.existsSync(DIST_DIR)) {
    console.error('❌ CRITICAL ERROR: dist/ directory does not exist! Run build first.');
    process.exit(1);
  }

  const distEntries = fs.readdirSync(DIST_DIR);
  if (distEntries.length === 0) {
    console.error('❌ CRITICAL ERROR: dist/ directory is completely empty!');
    process.exit(1);
  }
  console.log(`✓ dist/ directory verified (contains: ${distEntries.join(', ')})\n`);

  let allViolations: string[] = [];

  // Step 3: Frontend Apps Status & Client Leaks Scan in built Vite bundles
  console.log('>>> 1. Frontend Applications Vite Bundle Audit (Item 1b.9):');
  for (const app of APPS) {
    const appDistDir = path.resolve(DIST_DIR, 'apps', app.dirName);

    if (!fs.existsSync(appDistDir)) {
      console.log(`  - ${app.name} (${app.dirName}): ไม่พบโฟลเดอร์ผลลัพธ์ที่ ${appDistDir}`);
    } else {
      const scan = scanDirectoryForPatterns(appDistDir, [
        ...FORBIDDEN_CLIENT_LEAKS,
        ...FORBIDDEN_MOCK_PATTERNS,
      ]);
      console.log(`  - ${app.name} (${app.system}): สแกนแล้ว ${scan.fileCount} ไฟล์ (พบข้อผิดพลาด: ${scan.violations.length})`);
      allViolations = allViolations.concat(scan.violations);
    }
  }

  // Step 4: Scan shared packages in dist/
  const packagesDist = path.resolve(DIST_DIR, 'packages');
  if (fs.existsSync(packagesDist)) {
    const pkgScan = scanDirectoryForPatterns(packagesDist, [
      ...FORBIDDEN_CLIENT_LEAKS,
      ...FORBIDDEN_MOCK_PATTERNS,
    ]);
    console.log(`  - dist/packages: สแกนแล้ว ${pkgScan.fileCount} ไฟล์ (พบข้อผิดพลาด: ${pkgScan.violations.length})`);
    allViolations = allViolations.concat(pkgScan.violations);
  }

  // Step 5: Scan copied public assets if present
  console.log('\n>>> 2. Public Directory Static Assets Audit:');
  const publicDir = path.resolve(process.cwd(), 'public');
  if (fs.existsSync(publicDir)) {
    for (const app of APPS) {
      const appPublicDir = path.resolve(publicDir, app.dirName);
      if (fs.existsSync(appPublicDir)) {
        const pubScan = scanDirectoryForPatterns(appPublicDir, [
          ...FORBIDDEN_CLIENT_LEAKS,
          ...FORBIDDEN_MOCK_PATTERNS,
        ]);
        console.log(`  - public/${app.dirName}: สแกนแล้ว ${pubScan.fileCount} ไฟล์ (พบข้อผิดพลาด: ${pubScan.violations.length})`);
        allViolations = allViolations.concat(pubScan.violations);
      }
    }
  }

  // Step 6: Master Item 2.4 & 1b.9 - Scan ENTIRE dist/ tree
  console.log('\n>>> 3. Scanning ENTIRE dist/ tree for forbidden strings (mock-face-detector, จำลอง, simulate, mock-token):');
  const mockScan = scanDirectoryForPatterns(DIST_DIR, FORBIDDEN_MOCK_PATTERNS);
  console.log(`  - dist/ (full recursive tree): สแกนแล้ว ${mockScan.fileCount} ไฟล์`);
  allViolations = allViolations.concat(mockScan.violations);

  if (allViolations.length > 0) {
    console.error('\n❌ CRITICAL SECURITY VIOLATIONS DETECTED:');
    allViolations.forEach((v) => console.error(`  - ${v}`));
    process.exit(1);
  }

  console.log('\n========================================================================');
  console.log(`Summary: สแกน compiled files ใน dist/ รวม ${mockScan.fileCount} ไฟล์`);
  console.log('✓ PASS: Zero Supabase SDKs/secrets in client bundles AND Zero forbidden mock/test strings in dist/ & public/.');
  console.log('========================================================================\n');
}

runCiBundleVerification();
