import fs from 'fs';
import path from 'path';
import { Client } from 'pg';
import dotenv from 'dotenv';

// Load .env.local if present, fallback to .env
const envLocalPath = path.resolve(process.cwd(), '.env.local');
const envPath = path.resolve(process.cwd(), '.env');

if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
} else {
  dotenv.config({ path: envPath });
}

async function runMigrations() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    console.error('ERROR: DATABASE_URL is not set in .env.local or environment.');
    console.error('Please configure DATABASE_URL to your PostgreSQL/Supabase instance.');
    process.exit(1);
  }

  const client = new Client({
    connectionString,
    ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: false },
  });

  try {
    console.log('Connecting to database...');
    await client.connect();
    console.log('Connected successfully.');

    const migrationsDir = path.resolve(process.cwd(), 'supabase', 'migrations');
    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

    console.log(`Found ${files.length} migration files in supabase/migrations/:\n`);

    for (const file of files) {
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');

      console.log(`Applying migration: ${file}...`);
      await client.query(sql);
      console.log(`✓ Migration ${file} applied successfully.\n`);
    }

    console.log('All migrations applied cleanly!');
  } catch (error) {
    console.error('Migration failed with error:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigrations();
