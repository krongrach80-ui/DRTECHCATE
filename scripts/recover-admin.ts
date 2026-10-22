import fs from 'fs';
import path from 'path';
import readline from 'readline';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Load environment
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

async function runAdminRecovery() {
  console.log('========================================================================');
  console.log('DrTech.Care Physical Therapy System - Emergency Admin Recovery Tool');
  console.log('========================================================================\n');

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const emailDomain = process.env.INTERNAL_EMAIL_DOMAIN || 'clinic.internal';

  if (!supabaseUrl || !serviceRoleKey || serviceRoleKey.includes('dummy')) {
    console.error('ERROR: Direct server access with valid SUPABASE_SERVICE_ROLE_KEY is required for account recovery.');
    process.exit(1);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const username = await promptQuestion('Enter Admin Username to recover: ');
  if (!username) {
    console.error('Username cannot be empty.');
    process.exit(1);
  }

  const email = `${username.toLowerCase()}@${emailDomain}`;

  // Find user by email
  const { data: usersData, error: listError } = await adminClient.auth.admin.listUsers();
  if (listError) {
    console.error(`Failed to list users: ${listError.message}`);
    process.exit(1);
  }

  const targetUser = usersData.users.find((u) => u.email === email);
  if (!targetUser) {
    console.error(`No user found with email ${email}`);
    process.exit(1);
  }

  const newPassword = await promptQuestion('Enter New Password (min 12 chars): ', true);
  if (!newPassword || newPassword.length < 12) {
    console.error('Password must be at least 12 characters.');
    process.exit(1);
  }

  const confirmPassword = await promptQuestion('Confirm New Password: ', true);
  if (newPassword !== confirmPassword) {
    console.error('Passwords do not match.');
    process.exit(1);
  }

  // Update password in Auth
  const { error: updateError } = await adminClient.auth.admin.updateUserById(targetUser.id, {
    password: newPassword,
  });

  if (updateError) {
    console.error(`Failed to update password: ${updateError.message}`);
    process.exit(1);
  }

  // Ensure status is active in profiles
  await adminClient
    .from('profiles')
    .update({ status: 'active', force_logout_at: new Date().toISOString() })
    .eq('id', targetUser.id);

  // Write immutable audit log
  await adminClient.from('audit_logs').insert({
    actor_id: targetUser.id,
    action: 'ADMIN_ACCOUNT_RECOVERY',
    target_table: 'profiles',
    target_id: targetUser.id,
    details: {
      action: 'password_reset_via_server_recovery_script',
      email,
      timestamp: new Date().toISOString(),
    },
  });

  console.log(`\n✓ SUCCESS: Admin account "${username}" recovered successfully.`);
  console.log('✓ Status reactivated and audit log written to audit_logs table.');
}

if (process.env.NODE_ENV !== 'test') {
  runAdminRecovery().catch((err) => {
    console.error('Fatal recovery error:', err);
    process.exit(1);
  });
}
