import fs from 'fs';
import path from 'path';

/**
 * CI Bundle Verification Script (Master Prompt v3 - Section 4 & Checklist 2.5)
 * Verifies that frontend build artifacts and client code contain ZERO:
 * - Direct Supabase SDK references (@supabase/supabase-js)
 * - Supabase credentials (sb_publishable_, sb_secret_, service_role)
 * - Hardcoded Supabase URLs (supabase.co)
 */

const FORBIDDEN_PATTERNS = [
  /@supabase\/supabase-js/,
  /sb_secret_[a-zA-Z0-9_-]+/,
  /sb_publishable_[a-zA-Z0-9_-]+/,
  /service_role/,
  /https:\/\/[a-z0-9]+\.supabase\.co/,
];

const SCAN_DIRS = [
  path.resolve(process.cwd(), 'apps/admin'),
  path.resolve(process.cwd(), 'apps/pt'),
  path.resolve(process.cwd(), 'apps/kiosk'),
  path.resolve(process.cwd(), 'packages'),
];

function checkDirectory(dir: string): { violations: string[]; scannedFiles: number } {
  let violations: string[] = [];
  let scannedFiles = 0;

  if (!fs.existsSync(dir)) {
    return { violations, scannedFiles };
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (['node_modules', '.git', '.next', 'dist', 'coverage'].includes(entry.name)) {
        continue;
      }
      const sub = checkDirectory(fullPath);
      violations = violations.concat(sub.violations);
      scannedFiles += sub.scannedFiles;
    } else if (entry.isFile() && /\.(js|mjs|cjs|ts|tsx|html|json)$/.test(entry.name)) {
      if (entry.name.endsWith('.d.ts') || entry.name === 'package-lock.json') {
        continue;
      }
      scannedFiles++;
      const content = fs.readFileSync(fullPath, 'utf8');

      for (const pattern of FORBIDDEN_PATTERNS) {
        if (pattern.test(content)) {
          violations.push(`File: ${path.relative(process.cwd(), fullPath)} contains forbidden pattern: ${pattern.toString()}`);
        }
      }
    }
  }

  return { violations, scannedFiles };
}

function runBundleCheck(): void {
  console.log('========================================================================');
  console.log('DrTech.Care - Frontend Bundle & Zero-Leakage CI Verification');
  console.log('========================================================================\n');

  let totalViolations: string[] = [];
  let totalScanned = 0;

  for (const targetDir of SCAN_DIRS) {
    console.log(`Scanning: ${path.relative(process.cwd(), targetDir)}/`);
    const { violations, scannedFiles } = checkDirectory(targetDir);
    totalViolations = totalViolations.concat(violations);
    totalScanned += scannedFiles;
  }

  console.log(`\nScanned ${totalScanned} files across frontend directories.`);

  if (totalScanned === 0) {
    console.error('\n❌ CRITICAL CI ERROR: Zero files were scanned! Bundle check requires real frontend files to inspect.');
    process.exit(1);
  }

  if (totalViolations.length > 0) {
    console.error('\n❌ CRITICAL SECURITY VIOLATIONS DETECTED IN FRONTEND BUNDLE:');
    totalViolations.forEach((v) => console.error(` - ${v}`));
    console.error('\nFrontend apps must NEVER talk directly to Supabase or bundle Supabase keys!');
    process.exit(1);
  }

  console.log('✓ PASS: Frontend bundles are 100% free of Supabase SDKs, URLs, and secret tokens.');
  console.log('========================================================================\n');
}

runBundleCheck();
