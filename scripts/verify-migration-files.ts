import fs from 'fs';
import path from 'path';

// Expected 27 tables from Section 4 of Master Prompt v3
const EXPECTED_TABLES = [
  'profiles',
  'pts',
  'patients',
  'patient_pt_assignments',
  'case_transfers',
  'exercises',
  'minigames',
  'minigame_questions',
  'modpacks',
  'modpack_items',
  'courses',
  'course_items',
  'mission_runs',
  'mission_steps',
  'medical_notes',
  'treatment_results',
  'consents',
  'face_enrollments',
  'face_templates',
  'face_challenges',
  'enrollment_tickets',
  'checkins',
  'kiosk_devices',
  'staff_devices',
  'staff_calls',
  'bans',
  'audit_logs',
];

interface TestCheck {
  name: string;
  passed: boolean;
  details?: string;
}

const checks: TestCheck[] = [];

function runCheck(name: string, fn: () => boolean, failureMsg?: string) {
  try {
    const passed = fn();
    checks.push({ name, passed, details: passed ? undefined : failureMsg });
    console.log(passed ? `  ✓ PASS: ${name}` : `  ✗ FAIL: ${name} (${failureMsg})`);
  } catch (err) {
    checks.push({ name, passed: false, details: String(err) });
    console.error(`  ✗ ERROR: ${name} (${err})`);
  }
}

async function verifyMigrations() {
  console.log('========================================================================');
  console.log('DrTech.Care Master Prompt v3 - Static Migration File Content Verification');
  console.log('NOTE: This is a static file check, NOT a live database test.');
  console.log('Live validation must be performed against a running PostgreSQL instance.');
  console.log('========================================================================\n');

  const migrationsDir = path.resolve(process.cwd(), 'supabase', 'migrations');
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

  runCheck('Found baseline migration file', () => files.length >= 1, `Found ${files.length}`);

  let combinedSql = '';
  for (const f of files) {
    const content = fs.readFileSync(path.join(migrationsDir, f), 'utf8');
    combinedSql += '\n' + content;
  }

  // 1. Table existence checks (27 tables)
  console.log('\n--- 1. Checking 27 Tables Definition ---');
  for (const table of EXPECTED_TABLES) {
    const regex = new RegExp(`CREATE TABLE (IF NOT EXISTS )?(public\\.)?${table}\\b`, 'i');
    runCheck(`Table "${table}" is defined`, () => regex.test(combinedSql), 'Missing CREATE TABLE');
  }

  // 2. RLS enabled on all 27 tables
  console.log('\n--- 2. Checking RLS Enabled on All 27 Tables ---');
  for (const table of EXPECTED_TABLES) {
    const regex = new RegExp(`ALTER TABLE (public\\.)?${table} ENABLE ROW LEVEL SECURITY`, 'i');
    runCheck(`RLS enabled on "${table}"`, () => regex.test(combinedSql), 'Missing ENABLE ROW LEVEL SECURITY');
  }

  // 3. Security & Invariant checks
  console.log('\n--- 3. Checking Invariants & Constraints ---');

  runCheck('Extensions created (vector, uuid-ossp, pg_trgm)', () => {
    return combinedSql.includes('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"') &&
           combinedSql.includes('CREATE EXTENSION IF NOT EXISTS vector') &&
           combinedSql.includes('CREATE EXTENSION IF NOT EXISTS pg_trgm');
  });

  runCheck('HN Database Sequence created and used', () => {
    return combinedSql.includes('CREATE SEQUENCE IF NOT EXISTS patient_hn_seq') &&
           combinedSql.includes("patient_hn_seq");
  });

  runCheck('Vector 512-dim used for face_templates', () => {
    return combinedSql.includes('vector(512)');
  });

  runCheck('HNSW Cosine Index defined on face_templates', () => {
    return combinedSql.includes('hnsw') && combinedSql.includes('vector_cosine_ops');
  });

  runCheck('GIN Trigram Search Indexes defined for patients', () => {
    return combinedSql.includes('gin_trgm_ops');
  });

  runCheck('Append-only Trigger on medical_notes', () => {
    return combinedSql.includes('trg_prevent_medical_notes_modification') &&
           combinedSql.includes('Medical notes are append-only');
  });

  runCheck('Append-only Trigger on treatment_results', () => {
    return combinedSql.includes('trg_prevent_treatment_results_modification') &&
           combinedSql.includes('Treatment results are append-only');
  });

  runCheck('Insert-only Trigger on audit_logs', () => {
    return combinedSql.includes('trg_prevent_audit_logs_modification') &&
           combinedSql.includes('Audit logs are insert-only');
  });

  runCheck('REVOKE ALL from anon role', () => {
    return combinedSql.includes('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon') &&
           combinedSql.includes('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon') &&
           combinedSql.includes('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon');
  });

  runCheck('3 Private Storage Buckets configured', () => {
    return combinedSql.includes("'avatars'") &&
           combinedSql.includes("'biometric-data'") &&
           combinedSql.includes("'exercise-media'");
  });

  runCheck('match_face_candidates RPC defined and restricted to service_role', () => {
    return combinedSql.includes('FUNCTION match_face_candidates') &&
           combinedSql.includes('GRANT EXECUTE ON FUNCTION match_face_candidates') &&
           combinedSql.includes('TO service_role');
  });

  const total = checks.length;
  const passed = checks.filter(c => c.passed).length;
  const failed = total - passed;

  console.log('\n========================================================================');
  console.log(`Results: ${passed}/${total} checks passed (${failed} failed)`);
  console.log('========================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

verifyMigrations();
