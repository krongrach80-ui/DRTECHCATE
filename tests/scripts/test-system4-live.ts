import { createApp } from '../apps/api/src/app';
import { audit } from '../apps/api/src/modules/audit';
import http from 'http';

async function main() {
  (process.env as Record<string, string>).NODE_ENV = 'test';
  process.env.SUPABASE_URL = 'https://mctegvnrvmglbibuuczi.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'sb_publishable_RIM7hit0_ZY0y5fBCK_Uuw_bEJY7H5I';
  process.env.FACE_T_ACCEPT = '0.60';
  process.env.FACE_T_REJECT = '0.45';
  process.env.FACE_T_MARGIN = '0.10';
  process.env.FACE_T_ENROLL_CONSISTENCY = '0.75';
  process.env.FACE_T_DUPLICATE = '0.85';
  process.env.FACE_CHALLENGE_EXPIRE_SECONDS = '60';
  process.env.HOSPITAL_IPS = '127.0.0.1,::1,localhost,10.0.0.1';

  const app = createApp();
  const server = http.createServer(app);

  await new Promise<void>((resolve) => server.listen(3001, () => resolve()));
  const baseUrl = 'http://127.0.0.1:3001';

  console.log('--- SYSTEM 4 LIVE API VERIFICATION ---');

  // Step 1: PT attempts to call GET /api/audit -> must receive 403 Forbidden
  const ptAuditRes = await fetch(`${baseUrl}/api/audit`, {
    headers: {
      Cookie: 'access_token=mock-token:pt-user-01:pt:active',
    },
  });
  console.log('1. PT calling GET /api/audit: status =', ptAuditRes.status, await ptAuditRes.json());

  // Step 2: Admin calls audit.write and queries GET /api/audit
  await audit.write({
    actor_type: 'staff',
    actor_id: 'a0000000-0000-0000-0000-000000000001',
    action: 'system_initialized',
    entity: 'system',
    metadata: {
      password: 'ShouldBeRedacted!',
      probe: Array(512).fill(0.5),
      detail: 'System 4 verification audit entry',
    },
  });

  const adminAuditRes = await fetch(`${baseUrl}/api/audit?limit=2`, {
    headers: {
      Cookie: 'access_token=mock-token:admin-user-01:admin:active',
    },
  });
  console.log('2. Admin calling GET /api/audit: status =', adminAuditRes.status, await adminAuditRes.json());

  // Step 3: Admin attempts to ban a hospital IP (127.0.0.1) -> 400 CANNOT_BAN_HOSPITAL_IP
  const banHospitalRes = await fetch(`${baseUrl}/api/security/bans`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: 'access_token=mock-token:admin-user-01:admin:active',
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: JSON.stringify({
      type: 'ip',
      value: '127.0.0.1',
      reason: 'Attempting to ban hospital localhost',
    }),
  });
  console.log('3. Admin attempting to ban hospital IP: status =', banHospitalRes.status, await banHospitalRes.json());

  // Step 4: Admin bans an external attacker IP
  const banAttackerRes = await fetch(`${baseUrl}/api/security/bans`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: 'access_token=mock-token:admin-user-01:admin:active',
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: JSON.stringify({
      type: 'ip',
      value: '203.0.113.50',
      reason: 'Brute-force attacker',
    }),
  });
  const banAttackerJson = await banAttackerRes.json();
  console.log('4. Admin banning external IP: status =', banAttackerRes.status, banAttackerJson);

  // Step 5: Ban enforcement check via banCheck middleware
  const attackerReq = await fetch(`${baseUrl}/api/health`, {
    headers: {
      'X-Forwarded-For': '203.0.113.50',
    },
  });
  console.log('5. Request from banned IP 203.0.113.50: status =', attackerReq.status, await attackerReq.json());

  // Step 6: Revoke the ban
  const revokeRes = await fetch(`${baseUrl}/api/security/bans/${banAttackerJson.data.id}`, {
    method: 'DELETE',
    headers: {
      Cookie: 'access_token=mock-token:admin-user-01:admin:active',
      'X-Requested-With': 'XMLHttpRequest',
    },
  });
  console.log('6. Admin revoking ban: status =', revokeRes.status, await revokeRes.json());

  // Step 7: Request from previously banned IP now passes
  const unbannedReq = await fetch(`${baseUrl}/api/health`, {
    headers: {
      'X-Forwarded-For': '203.0.113.50',
    },
  });
  console.log('7. Request after ban revoked: status =', unbannedReq.status, await unbannedReq.json());

  // Step 8: Force logout flow
  const victimToken = 'mock-token:victim-user-99:pt:active';
  const preLogoutCheck = await fetch(`${baseUrl}/api/me`, {
    headers: { Cookie: `access_token=${victimToken}` },
  });
  console.log('8.1 Target user before force-logout: status =', preLogoutCheck.status, await preLogoutCheck.json());

  const forceLogoutRes = await fetch(`${baseUrl}/api/security/force-logout/victim-user-99`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: 'access_token=mock-token:admin-user-01:admin:active',
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: JSON.stringify({ reason: 'Admin revoked session' }),
  });
  console.log('8.2 Admin executing force-logout: status =', forceLogoutRes.status, await forceLogoutRes.json());

  const postLogoutCheck = await fetch(`${baseUrl}/api/me`, {
    headers: { Cookie: `access_token=${victimToken}` },
  });
  console.log('8.3 Target user after force-logout: status =', postLogoutCheck.status, await postLogoutCheck.json());

  server.close();
}

main().catch(console.error);
