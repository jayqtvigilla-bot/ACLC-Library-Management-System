const { spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'aclc-library-tests-'));
const databaseFile = path.join(temporaryDirectory, 'test.sqlite');
const releasesDirectory = path.join(temporaryDirectory, 'releases');
const testEnvironment = {
  ...process.env,
  NODE_ENV: 'test',
  DB_FILE: databaseFile,
  RELEASES_DIR: releasesDirectory,
  JWT_SECRET: 'test-only-secret-do-not-use-outside-tests',
  ADMIN_EMAIL: 'admin@aclc.local',
  ADMIN_PASSWORD: 'ACLCAdmin123!',
  FIREBASE_ACCOUNT_SYNC_REQUIRED: 'false',
  GATE_DEVICE_TOKEN: 'test-only-gate-device-token',
  FIREBASE_PROJECT_ID: '',
  FIREBASE_WEB_API_KEY: '',
  FIREBASE_SERVICE_ACCOUNT_JSON: '',
  GOOGLE_APPLICATION_CREDENTIALS: '',
  GMAIL_USER: '',
  GMAIL_APP_PASSWORD: '',
  CORS_ORIGINS: 'http://localhost:5173',
};

function allocatePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function waitForExit(child) {
  return new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal })));
}

async function waitUntilHealthy(child, healthUrl, logs) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Test API exited before becoming healthy.\n${logs.join('')}`);
    }
    try {
      const response = await fetch(healthUrl, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return;
    } catch (_) {
      // The server can take a short time to open its port and initialize SQLite.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Test API did not become healthy within 15 seconds.\n${logs.join('')}`);
}

async function runTests(baseUrl) {
  const testFiles = [
    'test/api.test.js',
    'test/circulation.test.js',
    'test/firebase-account-reconcile.test.js',
    'test/lira-ai.test.js',
  ];
  const child = spawn(process.execPath, ['--test', '--test-concurrency=1', ...testFiles], {
    cwd: projectRoot,
    env: { ...testEnvironment, TEST_API: baseUrl },
    stdio: 'inherit',
  });
  const result = await waitForExit(child);
  if (result.code !== 0) {
    throw new Error(`Node test runner failed${result.signal ? ` (${result.signal})` : ''}.`);
  }
}

async function main() {
  let api;
  const logs = [];
  try {
    const port = await allocatePort();
    testEnvironment.PORT = String(port);
    api = spawn(process.execPath, [path.join(projectRoot, 'server.js')], {
      cwd: projectRoot,
      env: testEnvironment,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    api.stdout.on('data', (chunk) => logs.push(chunk.toString()));
    api.stderr.on('data', (chunk) => logs.push(chunk.toString()));

    const baseUrl = `http://127.0.0.1:${port}/api`;
    await waitUntilHealthy(api, `${baseUrl}/health`, logs);
    console.log(`Running API tests against an isolated temporary SQLite database (${databaseFile}).`);
    await runTests(baseUrl);
    console.log('All tests passed. The temporary test database will now be removed.');
  } finally {
    if (api && api.exitCode === null) {
      api.kill();
      await waitForExit(api);
    }
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
