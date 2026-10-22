import fs from 'fs';
import path from 'path';
import readline from 'readline';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Load .env.local or .env
const envLocalPath = path.resolve(process.cwd(), '.env.local');
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
} else {
  dotenv.config({ path: envPath });
}

function promptQuestion(query: string, hideInput: boolean = false): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    if (!hideInput) {
      rl.question(query, (ans) => {
        rl.close();
        resolve(ans.trim());
      });
    } else {
      process.stdout.write(query);
      let input = '';
      process.stdin.setRawMode?.(true);
      process.stdin.resume();
      process.stdin.setEncoding('utf8');

      const onData = (char: string) => {
        const c = char.toString();
        switch (c) {
          case '\n':
          case '\r':
          case '\u0004':
            process.stdin.setRawMode?.(false);
            process.stdin.pause();
            process.stdin.removeListener('data', onData);
            process.stdout.write('\n');
            rl.close();
            resolve(input.trim());
            break;
          case '\u0003': // Ctrl+C
            process.exit(1);
            break;
          case '\u0008': // Backspace
          case '\x7f':
            if (input.length > 0) {
              input = input.slice(0, -1);
              process.stdout.write('\b \b');
            }
            break;
          default:
            input += c;
            process.stdout.write('*');
            break;
        }
      };

      process.stdin.on('data', onData);
    }
  });
}

function getCliArg(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  if (index !== -1 && index + 1 < process.argv.length) {
    return process.argv[index + 1];
  }
  return null;
}

async function createFirstSuperAdmin() {
  console.log('========================================================');
  console.log('   HOSPITAL PHYSICAL THERAPY SYSTEM - INITIAL ADMIN SETUP');
  console.log('========================================================\n');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('ERROR: Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
    console.error('Please configure these in .env.local before running this script.');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1. Verify no admin exists yet
  console.log('Checking database for existing administrators...');
  const { data: existingAdmins, error: checkError } = await supabase
    .from('profiles')
    .select('id, username')
    .eq('role', 'admin');

  if (checkError) {
    console.error('Database connection error:', checkError.message);
    process.exit(1);
  }

  if (existingAdmins && existingAdmins.length > 0) {
    console.error('\nERROR: An active Super Admin already exists in this database.');
    console.error('Per security policy, initial admin creation script can only run when 0 admins exist.');
    console.error(`Found existing admin user: ${existingAdmins[0].username}`);
    process.exit(1);
  }

  // 2. Collect admin credentials from arguments or prompt
  let username = getCliArg('--username');
  let fullName = getCliArg('--name');
  let phone = getCliArg('--phone');
  let password = getCliArg('--password');

  if (!username) {
    username = await promptQuestion('Enter Admin Username (alphanumeric/underscore): ');
  }
  if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
    console.error('ERROR: Username must be 3-30 characters (letters, numbers, underscore only).');
    process.exit(1);
  }

  if (!fullName) {
    fullName = await promptQuestion('Enter Full Name (e.g. นพ. สมชาย ใจดี): ');
  }
  if (!fullName) {
    console.error('ERROR: Full name is required.');
    process.exit(1);
  }

  if (phone === null) {
    phone = await promptQuestion('Enter Phone number (optional): ');
  }

  if (!password) {
    password = await promptQuestion('Enter Password (minimum 12 characters): ', true);
  }

  if (password.length < 12) {
    console.error('\nERROR: Password must be at least 12 characters long according to hospital policy.');
    process.exit(1);
  }

  const emailDomain = process.env.INTERNAL_EMAIL_DOMAIN || 'clinic.internal';
  const internalEmail = `${username.toLowerCase()}@${emailDomain}`;

  console.log(`\nCreating Super Admin account for '${username}' (${internalEmail})...`);

  // 3. Create Auth User via Supabase Admin API
  const { data: authData, error: createAuthError } = await supabase.auth.admin.createUser({
    email: internalEmail,
    password: password,
    email_confirm: true,
    user_metadata: {
      role: 'admin',
      username,
      full_name: fullName,
    },
  });

  if (createAuthError || !authData.user) {
    console.error('Failed to create user in Supabase Auth:', createAuthError?.message);
    process.exit(1);
  }

  const userId = authData.user.id;

  // 4. Create Profile in public.profiles
  const { error: profileError } = await supabase.from('profiles').insert({
    id: userId,
    role: 'admin',
    username,
    full_name: fullName,
    phone: phone || null,
    status: 'active',
  });

  if (profileError) {
    console.error('Failed to create profile row in public.profiles:', profileError.message);
    // Cleanup auth user on failure
    await supabase.auth.admin.deleteUser(userId);
    process.exit(1);
  }

  // 5. Record Audit Log
  await supabase.from('audit_logs').insert({
    actor_type: 'staff',
    actor_id: userId,
    action: 'CREATE_FIRST_SUPER_ADMIN',
    entity: 'profiles',
    entity_id: userId,
    metadata: {
      username,
      email: internalEmail,
      full_name: fullName,
      created_via: 'scripts/create-admin.ts',
    },
  });

  console.log('\n========================================================');
  console.log('✓ SUPER ADMIN CREATED SUCCESSFULLY!');
  console.log(`  User ID  : ${userId}`);
  console.log(`  Username : ${username}`);
  console.log(`  Role     : admin`);
  console.log(`  Email    : ${internalEmail}`);
  console.log('========================================================\n');
}

export async function validateAdminParams(
  username: string,
  fullName: string,
  password: string
): Promise<string | null> {
  if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
    return 'Username must be 3-30 characters (letters, numbers, underscore only).';
  }
  if (!fullName || fullName.trim().length === 0) {
    return 'Full name is required.';
  }
  if (!password || password.length < 12) {
    return 'Password must be at least 12 characters long according to hospital policy.';
  }
  return null;
}

export interface AdminSupabaseClient {
  from: (table: string) => {
    select: (fields: string) => {
      eq: (column: string, val: string) => Promise<{ data: Array<{ id: string; username: string }> | null; error: Error | null }>;
    };
  };
  auth: {
    admin: {
      createUser: (opts: { email: string; password: string; email_confirm: boolean; user_metadata: Record<string, unknown> }) => Promise<{ data: { user: { id: string } | null } | null; error: Error | null }>;
    };
  };
}

export async function createSuperAdminCore(
  supabase: AdminSupabaseClient,
  params: { username: string; fullName: string; password: string; phone?: string }
): Promise<{ success: boolean; error?: string; userId?: string }> {
  const validationError = await validateAdminParams(params.username, params.fullName, params.password);
  if (validationError) {
    return { success: false, error: validationError };
  }

  // 1. Verify no admin exists yet
  const { data: existingAdmins, error: checkError } = await supabase
    .from('profiles')
    .select('id, username')
    .eq('role', 'admin');

  if (checkError) {
    return { success: false, error: `Database error: ${checkError.message}` };
  }

  if (existingAdmins && existingAdmins.length > 0) {
    return { success: false, error: 'An active Super Admin already exists in this database.' };
  }

  const emailDomain = process.env.INTERNAL_EMAIL_DOMAIN || 'clinic.internal';
  const internalEmail = `${params.username.toLowerCase()}@${emailDomain}`;

  const { data: authData, error: createAuthError } = await supabase.auth.admin.createUser({
    email: internalEmail,
    password: params.password,
    email_confirm: true,
    user_metadata: { role: 'admin', username: params.username, full_name: params.fullName },
  });

  if (createAuthError || !authData?.user) {
    return { success: false, error: createAuthError?.message || 'Failed to create auth user' };
  }

  return { success: true, userId: authData.user.id };
}

if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
  createFirstSuperAdmin().catch((err) => {
    console.error('Unexpected error:', err);
    process.exit(1);
  });
}

