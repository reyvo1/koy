#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { apiHealthUrls, LOCAL_RUNTIME_STAGES } from './manage-rescue-local-runtime.mjs';

const root = path.resolve(import.meta.dirname, '..');
const manager = path.join(root, 'scripts/manage-rescue-local-runtime.mjs');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function run(args, options = {}) {
  return spawnSync(process.execPath, [manager, ...args], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    ...options,
  });
}

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

function executable(file, content) {
  writeFileSync(file, content, { mode: 0o755 });
  try { chmodSync(file, 0o755); } catch {}
}

async function waitTcp(port, timeoutMs = 5000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const ok = await new Promise((resolve) => {
      const socket = net.connect({ host: '127.0.0.1', port });
      socket.once('connect', () => { socket.destroy(); resolve(true); });
      socket.once('error', () => resolve(false));
    });
    if (ok) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`fixture API did not listen on ${port}`);
}

async function runCommandFlowFixture() {
  if (process.platform === 'win32') {
    console.log('SKIP  command-flow fixture uses POSIX PATH shims; portable static assertions still cover Windows topology boundaries');
    return;
  }

  const fixture = mkdtempSync(path.join(os.tmpdir(), 'iot-rescue-local-runtime-'));
  const scriptsDir = path.join(fixture, 'scripts');
  const binDir = path.join(fixture, 'bin');
  const logPath = path.join(fixture, 'self-test.log');
  const port = await freePort();
  const mqttHostPort = await freePort();
  mkdirSync(scriptsDir, { recursive: true });
  mkdirSync(binDir, { recursive: true });
  writeFileSync(path.join(fixture, 'docker-compose.rescue.yml'), 'services: {}\n');
  writeFileSync(path.join(fixture, '.env'), [
    'NODE_ENV=development',
    'HOST=127.0.0.1',
    `PORT=${port}`,
    `API_PROBE_URL=http://127.0.0.1:${port}/health/ready`,
    'SCHEDULER_RUNTIME_ENABLED=true',
    'AUTOMATION_RUNTIME_ENABLED=true',
    'SCHEDULER_CLAIM_TIMEOUT_MS=300000',
    'DATABASE_URL=postgresql://iot:fixture@127.0.0.1:5432/iot',
    'REDIS_URL=redis://127.0.0.1:6379',
    'MQTT_BROKER_URL=mqtt://127.0.0.1:1883',
    `RESCUE_MQTT_HOST_PORT=${mqttHostPort}`,
    `RESCUE_MQTT_BROKER_URL=mqtt://127.0.0.1:${mqttHostPort}`,
    'MQTT_USERNAME=fixture-publisher',
    'MQTT_PASSWORD=fixture-password',
    'MQTT_WEBHOOK_SECRET=fixture-webhook-secret-12345',
    'JWT_SECRET=fixture-jwt-secret-12345',
    'EMQX_DASHBOARD_USERNAME=admin',
    'EMQX_DASHBOARD_PASSWORD=fixture-dashboard-secret',
    'IOT_API_FROM_EMQX=http://legacy-host-boundary.invalid:3000',
    '',
  ].join('\n'));

  writeFileSync(path.join(scriptsDir, 'manage-rescue-local-runtime.mjs'), readFileSync(manager));
  writeFileSync(
    path.join(scriptsDir, 'rescue-local-network.mjs'),
    readFileSync(path.join(root, 'scripts/rescue-local-network.mjs')),
  );
  for (const name of ['validate-rescue-baseline.mjs', 'manage-baseline-manifest.mjs', 'manage-module-state.mjs']) {
    writeFileSync(path.join(scriptsDir, name), 'process.exit(0);\n');
  }
  writeFileSync(path.join(scriptsDir, 'check-rescue-runtime.mjs'), `
import { appendFileSync } from 'node:fs';
const scope = process.argv.find((value) => value.startsWith('--probe-scope='))?.split('=')[1] ?? 'none';
if (process.env.SELFTEST_LOG) appendFileSync(process.env.SELFTEST_LOG, 'checker:' + scope + '\\n');
console.log(JSON.stringify({ schemaVersion: 2, ready: true, blockerCount: 0, blockers: [], probeScope: scope, rows: [] }));
`);
  writeFileSync(path.join(scriptsDir, 'configure-emqx-http-auth.mjs'), `
import { appendFileSync } from 'node:fs';
appendFileSync(process.env.SELFTEST_LOG, 'emqx-auth:' + process.env.IOT_API_FROM_EMQX + '\\n');
if (process.env.SELFTEST_FAIL_EMQX === '1') { console.error('synthetic emqx failure'); process.exit(1); }
`);
  writeFileSync(path.join(scriptsDir, 'configure-emqx-webhooks.mjs'), `
import { appendFileSync } from 'node:fs';
appendFileSync(process.env.SELFTEST_LOG, 'emqx-webhooks:' + process.env.IOT_API_FROM_EMQX + '\\n');
if (process.env.SELFTEST_FAIL_WEBHOOKS === '1') { console.error('synthetic webhook failure'); process.exit(1); }
`);

  executable(path.join(binDir, 'docker'), `#!/usr/bin/env node
const fs=require('node:fs');
const args=process.argv.slice(2);
if (process.env.SELFTEST_LOG) fs.appendFileSync(process.env.SELFTEST_LOG, 'docker:' + args.join(' ') + '\\n');
process.exit(0);
`);

  const serverFile = path.join(fixture, 'fixture-api.cjs');
  writeFileSync(serverFile, `
const http = require('node:http');
const server = http.createServer((req, res) => {
  res.setHeader('content-type', 'application/json');
  if (req.url === '/health/live') { res.statusCode = 200; res.end(JSON.stringify({status:'ok'})); return; }
  if (req.url === '/health/ready') { res.statusCode = 200; res.end(JSON.stringify({status:'ready'})); return; }
  res.statusCode = 404; res.end('{}');
});
server.listen(${port}, '127.0.0.1');
process.on('SIGTERM', () => server.close(() => process.exit(0)));
`);
  const apiFixture = spawn(process.execPath, [serverFile], { stdio: 'ignore' });
  await waitTcp(port);

  const fixtureManager = path.join(scriptsDir, 'manage-rescue-local-runtime.mjs');
  const baseEnv = {
    ...process.env,
    PATH: `${binDir}:${process.env.PATH}`,
    SELFTEST_LOG: logPath,
    PORT: String(port),
    API_PROBE_URL: `http://127.0.0.1:${port}/health/ready`,
  };

  try {
    let result = spawnSync(process.execPath, [fixtureManager, 'up', '--env=.env', '--timeout-ms=12000'], {
      cwd: fixture,
      env: baseEnv,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 20000,
    });
    assert(result.status === 0, `synthetic local up must pass: ${result.stderr || result.stdout}`);
    const statePath = path.join(fixture, 'reports/local-runtime/state.json');
    assert(existsSync(statePath), 'successful local up must persist tracked runtime state');
    const state = JSON.parse(readFileSync(statePath, 'utf8'));
    assert(state.schemaVersion === 3, 'successful local up must persist source-bound runtime state schema v3');
    assert(state.status === 'CORE_RUNTIME_READY_LIVE_BROKER_EVIDENCE_PENDING', 'successful local up must preserve live-broker-evidence boundary');
    assert(state.sourceFingerprint && 'packageLockSha256' in state.sourceFingerprint && 'baselineManifestSha256' in state.sourceFingerprint && 'repositoryTreeSha256' in state.sourceFingerprint, 'successful local up must persist the sealed source fingerprint');
    assert(state.apiMode === 'compose' && state.apiService === 'api', 'local API must be tracked as a compose service, not a host process');

    const log = readFileSync(logPath, 'utf8');
    const order = [
      'docker:compose -f docker-compose.rescue.yml up -d postgres redis emqx',
      'checker:infra',
      'docker:compose -f docker-compose.rescue.yml build api',
      'docker:compose -f docker-compose.rescue.yml up -d api',
      'emqx-auth:http://api:3000',
      'emqx-webhooks:http://api:3000',
      'checker:full',
    ];
    let cursor = -1;
    for (const item of order) {
      const next = log.indexOf(item);
      assert(next > cursor, `command-flow order missing/out-of-order: ${item}\n${log}`);
      cursor = next;
    }
    assert(!log.includes('legacy-host-boundary.invalid'), 'local orchestrator must override stale host-boundary callback URLs');

    // Simulate a host crash/interruption that leaves a transient state record.
    writeFileSync(statePath, `${JSON.stringify({
      ...state,
      status: 'INFRA_STARTING',
      readyAt: undefined,
    }, null, 2)}\n`);
    writeFileSync(logPath, '');
    result = spawnSync(process.execPath, [fixtureManager, 'recover', '--env=.env', '--timeout-ms=12000'], {
      cwd: fixture,
      env: baseEnv,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 20000,
    });
    assert(result.status === 0, `synthetic interrupted-state recovery must pass: ${result.stderr || result.stdout}`);
    const recoveredState = JSON.parse(readFileSync(statePath, 'utf8'));
    assert(recoveredState.status === 'CORE_RUNTIME_READY_LIVE_BROKER_EVIDENCE_PENDING', 'recovery must end only at the protocol-ready state');
    const recoveryLog = readFileSync(logPath, 'utf8');
    assert(recoveryLog.includes('docker:compose -f docker-compose.rescue.yml down'), 'recovery must tear down a possibly partial stack first');
    assert(recoveryLog.includes('docker:compose -f docker-compose.rescue.yml up -d postgres redis emqx'), 'recovery must bring infrastructure up again');
    assert(!recoveryLog.includes('down --volumes'), 'recovery must preserve named volumes');

    const unsafeRecover = spawnSync(process.execPath, [fixtureManager, 'recover', '--env=.env', '--volumes'], {
      cwd: fixture,
      env: baseEnv,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 10000,
    });
    assert(unsafeRecover.status !== 0, 'recovery must reject --volumes');
    assert(`${unsafeRecover.stdout}${unsafeRecover.stderr}`.includes('never removes named volumes'), 'recovery --volumes rejection must be explicit');

    result = spawnSync(process.execPath, [fixtureManager, 'down', '--env=.env'], {
      cwd: fixture,
      env: baseEnv,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 15000,
    });
    assert(result.status === 0, `synthetic local down must pass: ${result.stderr || result.stdout}`);
    assert(!existsSync(statePath), 'successful down must remove tracked state');
    const downLog = readFileSync(logPath, 'utf8');
    assert(downLog.includes('docker:compose -f docker-compose.rescue.yml down'), 'down must stop complete compose runtime');
    assert(!downLog.includes('down --volumes'), 'down must preserve named volumes by default');

    writeFileSync(logPath, '');
    const webhookFailEnv = { ...baseEnv, SELFTEST_FAIL_WEBHOOKS: '1' };
    result = spawnSync(process.execPath, [fixtureManager, 'up', '--env=.env', '--timeout-ms=12000'], {
      cwd: fixture,
      env: webhookFailEnv,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 20000,
    });
    assert(result.status !== 0, 'synthetic webhook configuration failure must fail bring-up');
    const rollbackLog = readFileSync(logPath, 'utf8');
    assert(rollbackLog.includes('emqx-auth:http://api:3000') && rollbackLog.includes('emqx-webhooks:http://api:3000'), 'webhook failure fixture must remain on internal API service URL');
    assert(rollbackLog.includes('docker:compose -f docker-compose.rescue.yml down'), 'webhook configuration failure must rollback complete compose stack');
    assert(!existsSync(statePath), 'webhook failure rollback must not leave a ready state file');
  } finally {
    apiFixture.kill('SIGTERM');
    rmSync(fixture, { recursive: true, force: true });
  }
}

assert(LOCAL_RUNTIME_STAGES.length === 7, 'local runtime plan must retain seven ordered executable stages');
assert(LOCAL_RUNTIME_STAGES[0].includes('validate source/runtime prerequisites'), 'preflight must remain the first stage');
assert(LOCAL_RUNTIME_STAGES.at(-1).includes('full PostgreSQL/Redis/MQTT/EMQX/API readiness'), 'full protocol readiness must remain the final automated stage');

const managerSource = readFileSync(manager, 'utf8');
assert(managerSource.includes("IOT_API_FROM_EMQX: 'http://api:3000'"), 'local compose orchestration must force broker callbacks onto the internal API service');
assert(managerSource.includes("composeArgs(compose, ['build', 'api'])"), 'local API image must be built explicitly');
assert(managerSource.includes("composeArgs(compose, ['up', '-d', 'api'])"), 'local API must start as a compose service');
assert(!managerSource.includes("runChecked('backend production build'"), 'local compose path must not depend on a Windows host backend build');
assert(!managerSource.includes("runChecked('Prisma committed migration deployment'"), 'local compose path must not run host Prisma migrations');

const wildcard = apiHealthUrls({ HOST: '0.0.0.0', PORT: '3456' });
assert(wildcard.live === 'http://127.0.0.1:3456/health/live', 'wildcard API bind must probe through host loopback liveness');
assert(wildcard.ready === 'http://127.0.0.1:3456/health/ready', 'wildcard API bind must probe through host loopback readiness');

const explicit = apiHealthUrls({ API_PROBE_URL: 'http://localhost:7777/health/ready' });
assert(explicit.live === 'http://localhost:7777/health/live', 'explicit readiness origin must derive the matching liveness URL');
assert(explicit.ready === 'http://localhost:7777/health/ready', 'explicit readiness URL must remain authoritative');

const plan = run(['plan']);
assert(plan.status === 0, `plan command must pass: ${plan.stderr}`);
assert(plan.stdout.includes('live broker delivery/ACL/idempotency evidence'), 'plan must preserve the live broker evidence boundary');
assert(plan.stdout.includes('does not prove runtime acceptance'), 'plan must not imply acceptance PASS');

const exampleRefusal = run(['up', '--env=ops/env/rescue-local.env.example', '--timeout-ms=5000']);
assert(exampleRefusal.status !== 0, 'up must reject the placeholder example env');
assert(`${exampleRefusal.stdout}${exampleRefusal.stderr}`.includes('Refusing to use the placeholder'), 'placeholder env rejection reason must be explicit');

const invalidTimeout = run(['up', '--timeout-ms=100']);
assert(invalidTimeout.status !== 0, 'unsafe tiny timeout must be rejected');
assert(`${invalidTimeout.stdout}${invalidTimeout.stderr}`.includes('--timeout-ms must be between'), 'timeout rejection must explain the supported bounds');

await runCommandFlowFixture();

console.log('PASS  local runtime uses one Compose network for API/PostgreSQL/Redis/EMQX and broker callbacks');
console.log('PASS  local runtime plan preserves fail-closed stage ordering and live broker evidence boundary');
console.log('PASS  local runtime health URLs map wildcard binds to host loopback probes');
console.log('PASS  local runtime refuses placeholder env and unsafe timeout before mutation');
console.log('PASS  local runtime synthetic command flow enforces internal API routing, crash recovery, teardown, volume preservation, and rollback');
