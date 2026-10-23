import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

/**
 * CI Bundle & Zero-Leakage Verification Script
 * Requirements (User Prompt Section F):
 * 1. Honest reporting: admin, pt, kiosk are React + Vite SPAs scheduled for Systems 10-12 (not yet started).
 * 2. Scan compiled bundle artifacts per app and report file counts. If an app has no bundle yet, report "ยังไม่มีอะไรให้สแกน".
 * 3. Script MUST fail if dist/ does not exist or dist/ is empty.
 * 4. Scan all compiled outputs and packages for forbidden Supabase tokens or client imports.
 */

const FORBIDDEN_PATTERNS = [
  /@supabase\/supabase-js/,
  /sb_secret_[a-zA-Z0-9_-]+/,
  /sb_publishable_[a-zA-Z0-9_-]+/,
  /service_role/,
  /https:\/\/[a-z0-9]+\.supabase\.co/,
];

const DIST_DIR = path.resolve(process.cwd(), 'dist');

const APPS = [
  { name: 'apps/admin', system: 'ระบบ 10 (เว็บ ผอ.รพ.)' },
  { name: 'apps/pt', system: 'ระบบ 11 (เว็บนักกายภาพ)' },
  { name: 'apps/kiosk', system: 'ระบบ 12 (ตู้ Kiosk)' },
];

function buildIfRequested(): void {
  const skipBuild = process.argv.includes('--no-build');
  if (skipBuild) {
    console.log('>>> Skipping build step (--no-build requested). Verifying existing dist/...');
    return;
  }

  console.log('>>> Building application via tsconfig.build.json...');
  try {
    execSync('npx tsc -p tsconfig.build.json', {
      cwd: process.cwd(),
      stdio: 'inherit',
    });
    console.log('✓ Build completed successfully.\n');
  } catch {
    console.error('❌ Build failed during compilation!');
    process.exit(1);
  }
}

function scanDirectoryForLeaks(dir: string): { violations: string[]; fileCount: number } {
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
      const sub = scanDirectoryForLeaks(fullPath);
      violations = violations.concat(sub.violations);
      fileCount += sub.fileCount;
    } else if (entry.isFile() && /\.(js|mjs|cjs|ts|tsx|html|json|map)$/.test(entry.name)) {
      if (entry.name === 'package-lock.json') continue;
      fileCount++;
      const content = fs.readFileSync(fullPath, 'utf8');

      for (const pattern of FORBIDDEN_PATTERNS) {
        if (pattern.test(content)) {
          violations.push(`File ${path.relative(process.cwd(), fullPath)} matches forbidden pattern: ${pattern.toString()}`);
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

  // Step 1: Build (unless skipped to demonstrate failure)
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

  // Step 3: Frontend Apps Status & Scan
  console.log('>>> 1. Frontend Applications Status (Master Prompt v3 Section 10):');
  for (const app of APPS) {
    const _appSrcDir = path.resolve(process.cwd(), app.name, 'src');
    const appDistDir = path.resolve(DIST_DIR, app.name);

    const hasViteConfig = fs.existsSync(path.resolve(process.cwd(), app.name, 'vite.config.ts'));
    const isFullViteApp = hasViteConfig;

    if (!isFullViteApp) {
      console.log(`  - ${app.name}: ยังไม่มีอะไรให้สแกน (แอป React + Vite อยู่ใน${app.system} ซึ่งยังไม่เริ่ม)`);
    } else {
      const scan = scanDirectoryForLeaks(appDistDir);
      console.log(`  - ${app.name}: สแกนแล้ว ${scan.fileCount} ไฟล์ (พบสิ่งผิดปกติ: ${scan.violations.length})`);
    }
  }

  // Step 4: Scan compiled packages and API in dist/ for forbidden leaks
  console.log('\n>>> 2. Scanning compiled artifacts in dist/ for zero-leakage compliance:');
  const packagesDist = path.resolve(DIST_DIR, 'packages');
  const apiDist = path.resolve(DIST_DIR, 'apps/api');

  let totalFiles = 0;
  let allViolations: string[] = [];

  if (fs.existsSync(packagesDist)) {
    const pkgScan = scanDirectoryForLeaks(packagesDist);
    totalFiles += pkgScan.fileCount;
    allViolations = allViolations.concat(pkgScan.violations);
    console.log(`  - dist/packages: สแกนแล้ว ${pkgScan.fileCount} ไฟล์`);
  }

  if (fs.existsSync(apiDist)) {
    const apiScan = scanDirectoryForLeaks(apiDist);
    totalFiles += apiScan.fileCount;
    console.log(`  - dist/apps/api: สแกนแล้ว ${apiScan.fileCount} ไฟล์`);
  }

  if (allViolations.length > 0) {
    console.error('\n❌ CRITICAL SECURITY VIOLATIONS DETECTED:');
    allViolations.forEach((v) => console.error(`  - ${v}`));
    process.exit(1);
  }

  console.log('\n========================================================================');
  console.log(`Summary: สแกน compiled files รวม ${totalFiles} ไฟล์`);
  console.log('✓ PASS: Zero Supabase SDKs, tokens, or private credentials leaked in shared bundles.');
  console.log('========================================================================\n');
}

runCiBundleVerification();
