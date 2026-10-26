import dotenv from 'dotenv';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mctegvnrvmglbibuuczi.supabase.co';
const ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_RIM7hit0_ZY0y5fBCK_Uuw_bEJY7H5I';

console.log('========================================================================');
console.log('DrTech.Care - Live Supabase Cloud Database Verification');
console.log(`URL: ${SUPABASE_URL}`);
console.log('========================================================================\n');

const supabase = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { persistSession: false },
});

async function run() {
  console.log('📊 [1/4] Checking live table counts...');
  const tables = ['profiles', 'pts', 'patients', 'exercises', 'minigames', 'modpacks'];
  const counts: Record<string, number> = {};

  for (const table of tables) {
    const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
    if (error) {
      console.log(`  - ${table}: Error (${error.message})`);
    } else {
      counts[table] = count ?? 0;
      console.log(`  ✓ ${table}: ${count} rows`);
    }
  }

  console.log('\n👥 [2/4] Verifying default staff records in public.profiles...');
  const { data: profiles, error: pErr } = await supabase.from('profiles').select('username, full_name, role, status');
  if (pErr) {
    console.error('  ❌ Failed to fetch profiles:', pErr.message);
  } else {
    console.log('  Active profiles found:');
    profiles?.forEach((p) => {
      console.log(`    • @${p.username} (${p.full_name}) - ${p.role} [${p.status}]`);
    });
  }

  console.log('\n📝 [3/4] Testing patient creation and retrieval...');
  const testPatient = {
    first_name: 'ทดสอบ',
    last_name: 'ไลฟ์คลาวด์',
    age: 38,
    sex: 'male',
    phone: '089-999-0000',
    injury: 'ข้อเข่าเสื่อมระยะที่ 1',
    history: { chronic_diseases: '-', allergies: '-', notes: '-' },
    registration_status: 'active',
    registered_via: 'reception',
    version: 1,
  };

  const { data: insertedPatient, error: insErr } = await supabase
    .from('patients')
    .insert(testPatient)
    .select('*')
    .single();

  if (insErr) {
    console.warn(`  ⚠️ Direct patient insert via anon returned: ${insErr.message} (Code: ${insErr.code})`);
    console.log('  (This is expected if RLS requires authenticated/service_role key)');
  } else {
    console.log(`  ✓ Successfully inserted test patient: HN = ${insertedPatient.hn}, ID = ${insertedPatient.id}`);
    
    // Clean up test patient
    await supabase.from('patients').delete().eq('id', insertedPatient.id);
    console.log('  ✓ Cleaned up test patient record');
  }

  console.log('\n🎯 [4/4] Verifying minigames in catalog...');
  const { data: minigames } = await supabase.from('minigames').select('id, title, category');
  minigames?.forEach((mg) => {
    console.log(`    • ${mg.title} (${mg.category})`);
  });

  console.log('\n========================================================================');
  console.log('Verification completed.');
  console.log('========================================================================');
}

run().catch((e) => {
  console.error('Script error:', e);
  process.exit(1);
});
