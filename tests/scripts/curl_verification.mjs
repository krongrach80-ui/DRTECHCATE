import { spawn, execSync } from 'child_process';

async function testEnvironment(envName) {
  console.log(`\n======================================================`);
  console.log(`TESTING SERVER WITH NODE_ENV=${envName}`);
  console.log(`======================================================`);

  const env = {
    ...process.env,
    NODE_ENV: envName,
    PORT: '4000',
    RUN_SERVER: 'true',
    SUPABASE_URL: 'https://mctegvnrvmglbibuuczi.supabase.co',
    SUPABASE_ANON_KEY: 'sb_publishable_RIM7hit0_ZY0y5fBCK_Uuw_bEJY7H5I',
    FACE_T_ACCEPT: '0.60',
    FACE_T_REJECT: '0.45',
    FACE_T_MARGIN: '0.10',
    FACE_T_ENROLL_CONSISTENCY: '0.75',
    FACE_T_DUPLICATE: '0.85',
    FACE_CHALLENGE_EXPIRE_SECONDS: '60',
    CORS_ORIGINS: 'http://localhost:3000,http://localhost:5173',
  };

  const proc = spawn('npx', ['tsx', 'apps/api/src/server.ts'], {
    env,
    stdio: ['ignore', 'pipe', 'inherit'],
    shell: true,
  });

  // Wait for server to start
  await new Promise((resolve) => {
    proc.stdout.on('data', (d) => {
      const msg = d.toString();
      process.stdout.write(msg);
      if (msg.includes('started on port')) {
        resolve();
      }
    });
    setTimeout(resolve, 3500);
  });

  try {
    console.log(`\n--- [1] Health check: curl.exe -i http://localhost:4000/api/health ---`);
    const healthOutput = execSync('curl.exe -i -s http://localhost:4000/api/health', { encoding: 'utf8' });
    console.log(healthOutput);

    console.log(`--- [2] POST /api/test-error (with Origin): curl.exe -i -s -X POST http://localhost:4000/api/test-error -H "Origin: http://localhost:3000" ---`);
    const postErrorOutput = execSync('curl.exe -i -s -X POST http://localhost:4000/api/test-error -H "Origin: http://localhost:3000"', { encoding: 'utf8' });
    console.log(postErrorOutput);

    console.log(`--- [3] GET /api/test-error: curl.exe -i -s http://localhost:4000/api/test-error ---`);
    const getErrorOutput = execSync('curl.exe -i -s http://localhost:4000/api/test-error', { encoding: 'utf8' });
    console.log(getErrorOutput);

    console.log(`--- [4] POST /api/test-echo (with Origin): curl.exe -i -s -X POST http://localhost:4000/api/test-echo -H "Origin: http://localhost:3000" ---`);
    const postEchoOutput = execSync('curl.exe -i -s -X POST http://localhost:4000/api/test-echo -H "Origin: http://localhost:3000"', { encoding: 'utf8' });
    console.log(postEchoOutput);
  } finally {
    // Kill child process
    if (process.platform === 'win32') {
      try {
        execSync(`taskkill /pid ${proc.pid} /T /F`, { stdio: 'ignore' });
      } catch {}
    } else {
      proc.kill('SIGTERM');
    }
  }
}

async function main() {
  await testEnvironment('production');
  await new Promise((r) => setTimeout(r, 1000));
  await testEnvironment('test');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
