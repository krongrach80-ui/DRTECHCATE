import { spawn, execSync } from 'child_process';

async function runScenario(scenarioName, envOverrides, testCallback) {
  console.log(`\n======================================================`);
  console.log(`SCENARIO: ${scenarioName}`);
  console.log(`======================================================`);

  const env = {
    ...process.env,
    PORT: '4000',
    RUN_SERVER: 'true',
    FACE_T_ACCEPT: '0.60',
    FACE_T_REJECT: '0.45',
    FACE_T_MARGIN: '0.10',
    FACE_T_ENROLL_CONSISTENCY: '0.75',
    FACE_T_DUPLICATE: '0.85',
    FACE_CHALLENGE_EXPIRE_SECONDS: '60',
    ...envOverrides,
  };

  const proc = spawn('npx', ['tsx', 'apps/api/src/server.ts'], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
  });

  proc.stdout.on('data', (d) => process.stdout.write(d.toString()));
  proc.stderr.on('data', (d) => process.stderr.write(d.toString()));

  // Wait 3.5s for server to start
  await new Promise((resolve) => setTimeout(resolve, 3500));

  try {
    await testCallback();
  } finally {
    if (process.platform === 'win32') {
      try {
        execSync(`taskkill /pid ${proc.pid} /T /F`, { stdio: 'ignore' });
      } catch {}
    } else {
      proc.kill('SIGTERM');
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

async function main() {
  // 1. SCENARIO 1 (Item 1.5 & 1.6): Production CORS / CSRF / CSP
  await runScenario(
    'Item 1.5 & 1.6 - Production CORS/CSRF with Origin: http://localhost:3000 & CSP Inspection',
    {
      NODE_ENV: 'production',
      SUPABASE_URL: 'https://mctegvnrvmglbibuuczi.supabase.co',
      SUPABASE_ANON_KEY: 'sb_publishable_RIM7hit0_ZY0y5fBCK_Uuw_bEJY7H5I',
      CORS_ORIGINS: 'https://admin.drtech.care,https://kiosk.drtech.care',
    },
    async () => {
      console.log(`\n--- [1.5.1] POST /api/kiosk/pair with Origin: http://localhost:3000 ---`);
      const postPair = execSync(
        'curl.exe -i -s -X POST http://localhost:4000/api/kiosk/pair -H "Origin: http://localhost:3000" -H "Content-Type: application/json" -d "{}"',
        { encoding: 'utf8' }
      );
      console.log(postPair);

      console.log(`--- [1.5.2] Check Access-Control-Allow-Origin header in response ---`);
      if (postPair.toLowerCase().includes('access-control-allow-origin')) {
        console.log('FAIL: Access-Control-Allow-Origin header found!');
      } else {
        console.log('PASS: Access-Control-Allow-Origin is NOT present (Origin rejected by CORS).');
      }

      console.log(`\n--- [1.6] CSP Inspection: GET /api/health ---`);
      const getHealth = execSync('curl.exe -i -s http://localhost:4000/api/health', { encoding: 'utf8' });
      console.log(getHealth);
    }
  );

  // 2. SCENARIO 2 (Item 1.9): Supabase Downtime / Outage (URL wrong / unreachable port 59999)
  await runScenario(
    'Item 1.9 - Supabase Down (Unreachable Port 59999) Fail-Closed 503 on /api/auth/me & /api/kiosk/plan',
    {
      NODE_ENV: 'production',
      SUPABASE_URL: 'http://127.0.0.1:59999',
      SUPABASE_ANON_KEY: 'sb_publishable_dummy_key',
      CORS_ORIGINS: 'https://admin.drtech.care',
    },
    async () => {
      console.log(`\n--- [1.9.1] GET /api/auth/me with Bearer Token while Supabase is down ---`);
      const authMe = execSync(
        'curl.exe -i -s http://localhost:4000/api/auth/me -H "Authorization: Bearer dummy-token-simulating-user"',
        { encoding: 'utf8' }
      );
      console.log(authMe);

      console.log(`--- [1.9.2] GET /api/kiosk/plan while Supabase is down ---`);
      const kioskPlan = execSync(
        'curl.exe -i -s "http://localhost:4000/api/kiosk/plan?patient_id=11111111-1111-1111-1111-111111111111"',
        { encoding: 'utf8' }
      );
      console.log(kioskPlan);
    }
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
