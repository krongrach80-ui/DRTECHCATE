import { spawn, execSync } from 'child_process';

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runDemo() {
  console.log('>>> Starting Express API server on port 3001...');
  const serverProc = spawn('npx', ['tsx', 'scripts/start-demo-server.ts'], {
    cwd: process.cwd(),
    shell: true,
    stdio: ['ignore', 'pipe', 'inherit'],
  });

  serverProc.stdout.on('data', (_d) => {
    // server output
  });

  // Wait for server to be ready
  await sleep(3000);

  console.log('\n========================================================================');
  console.log('1. STEP 1: POST /api/auth/login (Login as PT)');
  console.log('========================================================================');
  const curl1 = `curl.exe -i -s -X POST http://localhost:3001/api/auth/login -H "Content-Type: application/json" -H "X-Requested-With: XMLHttpRequest" -d "{\\"username\\":\\"pt_somchai\\",\\"password\\":\\"CorrectPassword123!\\"}"`;
  console.log(`COMMAND: ${curl1}\nOUTPUT:`);
  try {
    const out1 = execSync(curl1, { encoding: 'utf8' });
    console.log(out1);
  } catch (err: unknown) {
    const e = err as { stdout?: string; message?: string };
    console.error(e.stdout || e.message);
  }

  console.log('\n========================================================================');
  console.log('2. STEP 2: GET /me (Verify active session with access_token)');
  console.log('========================================================================');
  const curl2 = `curl.exe -i -s -X GET http://localhost:3001/me -H "Cookie: access_token=mock-token:pt-somchai-uuid:pt:active"`;
  console.log(`COMMAND: ${curl2}\nOUTPUT:`);
  try {
    const out2 = execSync(curl2, { encoding: 'utf8' });
    console.log(out2);
  } catch (err: unknown) {
    const e = err as { stdout?: string; message?: string };
    console.error(e.stdout || e.message);
  }

  console.log('\n========================================================================');
  console.log('3. STEP 3: POST /api/security/force-logout/:id (Admin revokes PT session)');
  console.log('========================================================================');
  const curl3 = `curl.exe -i -s -X POST http://localhost:3001/api/security/force-logout/pt-somchai-uuid -H "Cookie: access_token=mock-token:admin-super-uuid:admin:active" -H "X-Requested-With: XMLHttpRequest"`;
  console.log(`COMMAND: ${curl3}\nOUTPUT:`);
  try {
    const out3 = execSync(curl3, { encoding: 'utf8' });
    console.log(out3);
  } catch (err: unknown) {
    const e = err as { stdout?: string; message?: string };
    console.error(e.stdout || e.message);
  }

  console.log('\n========================================================================');
  console.log('4. STEP 4: GET /me ซ้ำ (Verify session is now revoked: 401 SESSION_TERMINATED)');
  console.log('========================================================================');
  const curl4 = `curl.exe -i -s -X GET http://localhost:3001/me -H "Cookie: access_token=mock-token:pt-somchai-uuid:pt:active"`;
  console.log(`COMMAND: ${curl4}\nOUTPUT:`);
  try {
    const out4 = execSync(curl4, { encoding: 'utf8' });
    console.log(out4);
  } catch (err: unknown) {
    const e = err as { stdout?: string; message?: string };
    console.error(e.stdout || e.message);
  }

  // Terminate server
  serverProc.kill();
  try {
    execSync('powershell -Command "Get-Process -Name node | Where-Object { $_.CommandLine -like \'*start-demo-server*\' } | Stop-Process -Force"', { stdio: 'ignore' });
  } catch {}
  process.exit(0);
}

runDemo();
