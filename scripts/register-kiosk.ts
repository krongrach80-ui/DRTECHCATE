/**
 * Kiosk Device Registration Script
 *
 * Usage:
 *   npx tsx scripts/register-kiosk.ts [deviceName]
 *   Example: npx tsx scripts/register-kiosk.ts "Kiosk Station 1 - แผนกกายภาพบำบัด"
 */

import crypto from 'crypto';
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

async function main() {
  const deviceName = process.argv[2] || 'Kiosk Terminal 1 (แผนกกายภาพ)';

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('❌ Error: Missing DATABASE_URL in .env.local');
    process.exit(1);
  }

  const client = new pg.Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    console.log('🔗 Connected to database.');

    // Generate random secure 64-char hex device token
    const rawDeviceToken = `kiosk_${crypto.randomBytes(28).toString('hex')}`;
    const tokenHash = hashToken(rawDeviceToken);

    const res = await client.query(
      `INSERT INTO kiosk_devices (name, token_hash, is_active, last_seen_at)
       VALUES ($1, $2, true, now())
       RETURNING id, name, created_at;`,
      [deviceName, tokenHash]
    );

    const created = res.rows[0];
    console.log('\n======================================================');
    console.log('✅ KIOSK DEVICE REGISTERED SUCCESSFULLY');
    console.log('======================================================');
    console.log(`Device ID:    ${created.id}`);
    console.log(`Device Name:  ${created.name}`);
    console.log(`Registered:   ${created.created_at}`);
    console.log('\n🔑 RAW DEVICE TOKEN (KEEP SECRET - Set in kiosk client / env):');
    console.log(`KIOSK_DEVICE_TOKEN=${rawDeviceToken}`);
    console.log('\n🔒 SHA-256 Token Hash stored in DB:');
    console.log(tokenHash);
    console.log('======================================================\n');
  } catch (err) {
    console.error('❌ Registration failed:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
