import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

import { AuthService } from '../apps/api/src/modules/auth/service';
import { AuthRepository } from '../apps/api/src/modules/auth/repository';

async function debugLogin() {
  console.log('Testing AuthService.login against configured Supabase...');
  console.log('SUPABASE_URL:', process.env.SUPABASE_URL);
  console.log('NODE_ENV:', process.env.NODE_ENV);

  const authService = new AuthService(new AuthRepository());
  try {
    const result = await authService.login('director', 'Admin12345678!', '127.0.0.1');
    console.log('Login successful! Result:', result);
  } catch (err: any) {
    console.error('Login caught error:', err);
    console.error('Message:', err.message);
    console.error('Status:', err.statusCode);
    console.error('Code:', err.code);
    console.error('Stack:', err.stack);
  }
}

debugLogin();
