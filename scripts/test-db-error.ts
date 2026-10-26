import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://mctegvnrvmglbibuuczi.supabase.co';
const ANON_KEY = 'sb_publishable_RIM7hit0_ZY0y5fBCK_Uuw_bEJY7H5I';

const supabase = createClient(SUPABASE_URL, ANON_KEY);

async function check() {
  console.log('Testing query on audit_logs with eq("ip", "127.0.0.1")...');
  const r1 = await supabase.from('audit_logs').select('id', { count: 'exact', head: true }).eq('ip', '127.0.0.1');
  console.log('r1 error:', r1.error);

  console.log('\nTesting query on audit_logs select("*")...');
  const r2 = await supabase.from('audit_logs').select('*').limit(1);
  console.log('r2:', { data: r2.data, error: r2.error });

  console.log('\nTesting query on staff_devices...');
  const r3 = await supabase.from('staff_devices').select('*').limit(1);
  console.log('r3 error:', r3.error);

  console.log('\nTesting auth.signInWithPassword...');
  const r4 = await supabase.auth.signInWithPassword({
    email: 'director@drtech.care',
    password: 'Admin12345678!',
  });
  console.log('r4 error:', r4.error ? r4.error.message : 'SUCCESS', r4.data?.user?.email);
}

check();
