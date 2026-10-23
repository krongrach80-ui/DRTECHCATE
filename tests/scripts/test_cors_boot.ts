import { parseEnv } from '../apps/api/src/config/env';
import request from 'supertest';
import { createApp } from '../apps/api/src/app';

async function main() {
  console.log('=== TEST 1: Positive Control - Origin in allowlist receives ACAO ===');
  (process.env as Record<string, string | undefined>).NODE_ENV = 'development';
  process.env.CORS_ORIGINS = 'http://localhost:3000,https://drtech.care';
  const app = createApp();

  const res = await request(app)
    .get('/health')
    .set('Origin', 'https://drtech.care');

  console.log('HTTP Status:', res.status);
  console.log('Access-Control-Allow-Origin:', res.headers['access-control-allow-origin']);
  console.log('Access-Control-Allow-Credentials:', res.headers['access-control-allow-credentials']);
  if (res.headers['access-control-allow-origin'] === 'https://drtech.care') {
    console.log('POSITIVE_CONTROL_RESULT: PASS (ACAO matches allowlisted Origin)');
  } else {
    console.log('POSITIVE_CONTROL_RESULT: FAIL');
  }

  console.log('\n=== TEST 2: Negative Test - Production with localhost in CORS_ORIGINS halts server boot ===');
  try {
    parseEnv({
      NODE_ENV: 'production',
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_ANON_KEY: 'anon-key-dummy',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key-dummy',
      CORS_ORIGINS: 'http://localhost:3000,https://drtech.care',
      FACE_T_ACCEPT: '0.70',
      FACE_T_REJECT: '0.50',
      FACE_T_MARGIN: '0.08',
      FACE_T_ENROLL_CONSISTENCY: '0.75',
      FACE_T_DUPLICATE: '0.85',
      FACE_CHALLENGE_EXPIRE_SECONDS: '60',
    });
    console.log('NEGATIVE_TEST_RESULT: FAIL (Server booted despite insecure localhost origin in production)');
  } catch (err: unknown) {
    console.log('Server boot rejected with error:');
    if (err instanceof Error) {
      console.log(err.message);
    }
    console.log('NEGATIVE_TEST_RESULT: PASS (Fatal boot exception thrown)');
  }

  console.log('\n=== TEST 3: Negative Test - Production with insecure http:// in CORS_ORIGINS halts server boot ===');
  try {
    parseEnv({
      NODE_ENV: 'production',
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_ANON_KEY: 'anon-key-dummy',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key-dummy',
      CORS_ORIGINS: 'http://insecure-domain.com,https://drtech.care',
      FACE_T_ACCEPT: '0.70',
      FACE_T_REJECT: '0.50',
      FACE_T_MARGIN: '0.08',
      FACE_T_ENROLL_CONSISTENCY: '0.75',
      FACE_T_DUPLICATE: '0.85',
      FACE_CHALLENGE_EXPIRE_SECONDS: '60',
    });
    console.log('NEGATIVE_TEST_RESULT: FAIL (Server booted despite http:// in production)');
  } catch (err: unknown) {
    console.log('Server boot rejected with error:');
    if (err instanceof Error) {
      console.log(err.message);
    }
    console.log('NEGATIVE_TEST_RESULT: PASS (Fatal boot exception thrown)');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
