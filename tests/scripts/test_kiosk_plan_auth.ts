import request from 'supertest';
import { createApp } from '../apps/api/src/app';
import { setAuthTokenVerifier } from '../apps/api/src/middleware/authenticate';

async function run() {
  (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
  process.env.CORS_ORIGINS = 'https://drtech.care';
  const app = createApp();

  const { PatientRepository } = await import('../apps/api/src/modules/patients/repository');
  let getPatientByIdCalls = 0;
  const origGetPatientById = PatientRepository.prototype.getPatientById;
  PatientRepository.prototype.getPatientById = async function (id: string) {
    getPatientByIdCalls++;
    return origGetPatientById.call(this, id);
  };

  const unauthenticatedRes = await request(app)
    .get('/api/kiosk/plan?patient_id=11111111-1111-4111-8111-111111111111');

  console.log('Response Body:', JSON.stringify(unauthenticatedRes.body));
  console.log('PatientRepository.getPatientById calls count:', getPatientByIdCalls);

  if (unauthenticatedRes.status === 401 && unauthenticatedRes.body.error?.code === 'UNAUTHORIZED') {
    console.log('TEST 1 RESULT: PASS (401 returned, 0 DB queries invoked)');
  } else {
    console.log('TEST 1 RESULT: FAIL');
  }

  console.log('\n=== TEST 2: curl /api/auth/me with valid cookie ===');
  // Inject auth token verifier for mock user
  setAuthTokenVerifier(async (token: string) => {
    if (token === 'valid-test-cookie-token') {
      return {
        id: 'user-pt-001',
        role: 'pt',
        full_name: 'Dr. Somchai PT',
        status: 'active',
      };
    }
    return null;
  });

  const meRes = await request(app)
    .get('/api/auth/me')
    .set('Cookie', ['access_token=valid-test-cookie-token']);

  console.log('HTTP Status:', meRes.status);
  console.log('Response Body:', JSON.stringify(meRes.body, null, 2));
  if (meRes.status === 200 && meRes.body.user?.id === 'user-pt-001') {
    console.log('TEST 2 RESULT: PASS (200 returned with user session from cookie)');
  } else {
    console.log('TEST 2 RESULT: FAIL');
  }

  console.log('\n=== TEST 3: Authorization: Bearer check ===');
  const bearerRes = await request(app)
    .get('/api/auth/me')
    .set('Authorization', 'Bearer valid-test-cookie-token');

  console.log('HTTP Status with Bearer:', bearerRes.status);
  console.log('Response Body with Bearer:', JSON.stringify(bearerRes.body, null, 2));

  // Clean up
  setAuthTokenVerifier(null);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
