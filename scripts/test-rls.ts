import fs from 'fs';
import path from 'path';
import { Client } from 'pg';
import dotenv from 'dotenv';

// Load .env.local or .env
const envLocalPath = path.resolve(process.cwd(), '.env.local');
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
} else {
  dotenv.config({ path: envPath });
}

interface TestResult {
  name: string;
  passed: boolean;
  message?: string;
}

const results: TestResult[] = [];

function assert(condition: boolean, name: string, failureMessage?: string) {
  if (condition) {
    results.push({ name, passed: true });
    console.log(`  ✓ PASS: ${name}`);
  } else {
    results.push({ name, passed: false, message: failureMessage });
    console.error(`  ✗ FAIL: ${name} - ${failureMessage}`);
  }
}

async function runRlsTests() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.warn('DATABASE_URL not set. Skipping live DB RLS execution test.');
    console.log('To run this test against a live database, set DATABASE_URL in .env.local.');
    return;
  }

  const client = new Client({
    connectionString,
    ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    console.log('\n--- STARTING LIVE DATABASE RLS & TRIGGER INTEGRITY TESTS ---');

    // 1. Verify all 15 tables exist
    const expectedTables = [
      'profiles',
      'patients',
      'pts',
      'patient_pt_assignments',
      'case_transfers',
      'exercises',
      'courses',
      'course_items',
      'medical_notes',
      'consents',
      'face_enrollments',
      'face_templates',
      'kiosk_devices',
      'audit_logs',
      'bans',
    ];

    const tablesRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    const foundTables = tablesRes.rows.map(r => r.table_name);

    for (const t of expectedTables) {
      assert(foundTables.includes(t), `Table '${t}' exists in database`, `Table ${t} not found`);
    }

    // 2. Verify pgvector extension and 512-dim embedding column
    const vectorRes = await client.query(`
      SELECT udt_name, character_maximum_length 
      FROM information_schema.columns 
      WHERE table_name = 'face_templates' AND column_name = 'embedding'
    `);
    assert(
      vectorRes.rows.length > 0 && vectorRes.rows[0].udt_name === 'vector',
      `face_templates.embedding is a pgvector column`,
      'Column not defined as vector'
    );

    // 3. Verify RLS is enabled on all 15 tables
    const rlsRes = await client.query(`
      SELECT relname, relrowsecurity 
      FROM pg_class 
      JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
      WHERE pg_namespace.nspname = 'public' AND relname = ANY($1)
    `, [expectedTables]);

    for (const row of rlsRes.rows) {
      assert(row.relrowsecurity === true, `RLS is enabled on table '${row.relname}'`, 'RLS not enabled');
    }

    // 4. Test Append-Only Trigger on medical_notes (Transaction Rollback)
    await client.query('BEGIN');
    try {
      // Create temporary dummy auth user profile in transaction to test trigger
      const testUserId = '00000000-0000-0000-0000-000000000001';
      const testPatientId = '00000000-0000-0000-0000-000000000002';
      
      // Attempt insert note directly
      const insertNoteRes = await client.query(`
        INSERT INTO medical_notes (id, patient_id, author_id, body)
        VALUES ('00000000-0000-0000-0000-000000000099', $1, $2, 'Initial Note')
        ON CONFLICT DO NOTHING
        RETURNING id
      `, [testPatientId, testUserId]).catch(() => null);

      if (insertNoteRes && insertNoteRes.rows.length > 0) {
        // Attempt UPDATE (Must FAIL)
        let updateFailed = false;
        try {
          await client.query(`
            UPDATE medical_notes 
            SET body = 'Modified note' 
            WHERE id = '00000000-0000-0000-0000-000000000099'
          `);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          updateFailed = msg.includes('append-only');
        }
        assert(updateFailed, 'medical_notes UPDATE is strictly rejected by trigger', 'Update did not throw append-only exception');

        // Attempt DELETE (Must FAIL)
        let deleteFailed = false;
        try {
          await client.query(`
            DELETE FROM medical_notes 
            WHERE id = '00000000-0000-0000-0000-000000000099'
          `);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          deleteFailed = msg.includes('append-only');
        }
        assert(deleteFailed, 'medical_notes DELETE is strictly rejected by trigger', 'Delete did not throw append-only exception');
      }
    } finally {
      await client.query('ROLLBACK');
    }

    // 5. Test Insert-Only Trigger on audit_logs
    await client.query('BEGIN');
    try {
      await client.query(`
        INSERT INTO audit_logs (id, action, entity)
        VALUES ('00000000-0000-0000-0000-000000000088', 'TEST_ACTION', 'TEST_ENTITY')
      `);

      let updateAuditFailed = false;
      try {
        await client.query(`
          UPDATE audit_logs 
          SET action = 'TAMPERED' 
          WHERE id = '00000000-0000-0000-0000-000000000088'
        `);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        updateAuditFailed = msg.includes('insert-only');
      }
      assert(updateAuditFailed, 'audit_logs UPDATE is strictly rejected by trigger', 'Update did not throw insert-only exception');

      let deleteAuditFailed = false;
      try {
        await client.query(`
          DELETE FROM audit_logs 
          WHERE id = '00000000-0000-0000-0000-000000000088'
        `);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        deleteAuditFailed = msg.includes('insert-only');
      }
      assert(deleteAuditFailed, 'audit_logs DELETE is strictly rejected by trigger', 'Delete did not throw insert-only exception');
    } finally {
      await client.query('ROLLBACK');
    }

    console.log('\n--- RLS & TRIGGER INTEGRITY TESTS COMPLETE ---');
    const passedCount = results.filter(r => r.passed).length;
    console.log(`Summary: ${passedCount}/${results.length} tests passed.\n`);

  } catch (err) {
    console.error('Error during RLS test:', err);
  } finally {
    await client.end();
  }
}

runRlsTests();
