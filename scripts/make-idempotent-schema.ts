import fs from 'fs';
import path from 'path';

const migrationsDir = path.resolve(process.cwd(), 'supabase/migrations');
const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();

let combined = '-- ========================================================================\n';
combined += '-- DrTech.Care Physical Therapy System - Full Idempotent Schema\n';
combined += '-- Generated for Supabase SQL Editor execution\n';
combined += '-- ========================================================================\n\n';

for (const file of files) {
  combined += `-- >>> BEGIN ${file} <<<\n`;
  let content = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

  // Insert DROP POLICY IF EXISTS before each CREATE POLICY
  content = content.replace(
    /CREATE POLICY\s+("[^"]+"|\w+)\s+ON\s+([a-zA-Z0-9_\.]+)/g,
    (match, policyName, tableName) => {
      return `DROP POLICY IF EXISTS ${policyName} ON ${tableName};\n${match}`;
    }
  );

  combined += content + '\n\n';
}

const targetPath = path.resolve(process.cwd(), 'supabase/schema_combined.sql');
fs.writeFileSync(targetPath, combined, 'utf8');
console.log('Successfully generated idempotent schema_combined.sql');
