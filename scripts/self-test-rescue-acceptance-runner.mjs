#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();
const sandbox = mkdtempSync(path.join(os.tmpdir(), 'iot-rescue-acceptance-self-test-'));
const fixture = path.join(sandbox, 'repo');
const fakeBin = path.join(sandbox, 'bin');
const npmLog = path.join(sandbox, 'fake-npm.jsonl');
const report = path.join(fixture, 'reports', 'acceptance-self-test.json');
const servers = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      servers.push(server);
      resolve(server.address().port);
    });
  });
}

async function closeServers() {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise((resolve) => {
          server.close(() => resolve());
        }),
    ),
  );
}

const GENERATED_SOURCE_SEGMENTS = new Set([
  'node_modules',
  'dist',
  '.next',
  'coverage',
  '.git',
]);
const TOP_LEVEL_GENERATED_SOURCE_SEGMENTS = new Set(['reports', 'artifacts']);

function shouldCopy(source) {
  const relative = path.relative(root, source);
  if (!relative) return true;
  const segments = relative.split(path.sep);
  if (segments.some((segment) => GENERATED_SOURCE_SEGMENTS.has(segment))) return false;
  if (TOP_LEVEL_GENERATED_SOURCE_SEGMENTS.has(segments[0])) return false;
  const basename = segments.at(-1) ?? '';
  if (basename === '.env' || (basename.startsWith('.env.') && basename !== '.env.example')) return false;
  return true;
}

function copySource() {
  cpSync(root, fixture, { recursive: true, filter: shouldCopy });
}

function prepareDependencies() {
  const nodeModules = path.join(fixture, 'node_modules');
  mkdirSync(nodeModules, { recursive: true });
  writeFileSync(path.join(nodeModules, '.package-lock.json'), '{}\n');
  for (const packageName of ['typescript', 'jest', 'prisma', '@nestjs/cli', 'next', 'expo']) {
    const packageDir = path.join(nodeModules, ...packageName.split('/'));
    mkdirSync(packageDir, { recursive: true });
    writeFileSync(path.join(packageDir, 'package.json'), `${JSON.stringify({ name: packageName })}\n`);
  }
}

function prepareFakeNpm() {
  mkdirSync(fakeBin, { recursive: true });
  const runner = path.join(fakeBin, 'fake-npm.mjs');
  writeFileSync(
    runner,
    `#!/usr/bin/env node\nimport { appendFileSync } from 'node:fs';\nconst args=process.argv.slice(2);\nif(args.length===1&&args[0]==='--version'){console.log('10.9.2');process.exit(0);}\nappendFileSync(process.env.FAKE_NPM_LOG, JSON.stringify({args,nodeEnv:process.env.NODE_ENV??null})+'\\n');\n`,
  );
  chmodSync(runner, 0o755);
  const npm = path.join(fakeBin, 'npm');
  writeFileSync(npm, `#!/bin/sh\nexec \"${process.execPath}\" \"${runner}\" \"$@\"\n`);
  chmodSync(npm, 0o755);
  writeFileSync(path.join(fakeBin, 'npm.cmd'), `@echo off\r\n\"${process.execPath}\" \"${runner}\" %*\r\n`);
}

async function startAcceptAllMqtt() {
  return await listen(
    net.createServer((socket) =>
      socket.once('data', () => {
        socket.write(Buffer.from([0x20, 0x02, 0x00, 0x00]));
      }),
    ),
  );
}

async function startServices() {
  const postgres = await listen(net.createServer((socket) => socket.once('data', () => socket.write(Buffer.from('N')))));
  const redis = await listen(
    net.createServer((socket) => socket.on('data', (data) => {
      if (data.toString('utf8').includes('PING')) socket.write('+PONG\r\n');
    })),
  );
  const mqtt = await listen(
    net.createServer((socket) =>
      socket.once('data', (data) => {
        const accepted = data.includes(Buffer.from('fixture-password', 'utf8'));
        socket.write(Buffer.from([0x20, 0x02, 0x00, accepted ? 0x00 : 0x05]));
      }),
    ),
  );
  const emqx = await listen(
    http.createServer((request, response) => {
      if (request.method === 'POST' && request.url === '/api/v5/login') {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ token: 'fixture-token' }));
        return;
      }
      response.writeHead(404).end();
    }),
  );
  // A media runtime stub, because the full runtime scope now includes one. Added rather than letting
  // the probe skip: a fixture that omits a service the product now requires cannot catch a regression
  // in that service's readiness row, and the omission first surfaced as a hard failure here.
  const media = await listen(
    http.createServer((request, response) => {
      if (request.url === '/api') {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ version: 'fixture-go2rtc' }));
        return;
      }
      response.writeHead(404).end();
    }),
  );
  const api = await listen(
    http.createServer((request, response) => {
      if (request.url === '/health/ready') {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ status: 'ready', checks: { postgres: { status: 'up' }, redis: { status: 'up' }, mqtt: { status: 'up' } } }));
        return;
      }
      response.writeHead(404).end();
    }),
  );
  return { postgres, redis, mqtt, emqx, media, api };
}

function writeEnv(ports, mqttBrokerPort = ports.mqtt) {
  const env = [
    'NODE_ENV=development',
    'SCHEDULER_RUNTIME_ENABLED=true',
    'AUTOMATION_RUNTIME_ENABLED=true',
    'SCHEDULER_CLAIM_TIMEOUT_MS=300000',
    'DATABASE_INTEGRATION_TESTS_ALLOWED=true',
    'MQTT_INTEGRATION_TESTS_ALLOWED=true',
    `DATABASE_URL=postgresql://iot:fixture-password@127.0.0.1:${ports.postgres}/iot`,
    `TEST_DATABASE_URL=postgresql://iot:fixture-password@127.0.0.1:${ports.postgres}/iot`,
    `REDIS_URL=redis://127.0.0.1:${ports.redis}`,
    `MQTT_BROKER_URL=mqtt://127.0.0.1:${mqttBrokerPort}`,
    'MQTT_USERNAME=fixture-publisher',
    'MQTT_PASSWORD=fixture-password',
    'MQTT_WEBHOOK_SECRET=fixture-webhook-secret-12345',
    'JWT_SECRET=fixture-jwt-secret-123456789',
    'METRICS_ACCESS_TOKEN=fixture-metrics-secret-123456789',
    'EMQX_DASHBOARD_USERNAME=admin',
    'EMQX_DASHBOARD_PASSWORD=fixture-dashboard-secret',
    `EMQX_API_URL=http://127.0.0.1:${ports.emqx}`,
    `API_PROBE_URL=http://127.0.0.1:${ports.api}/health/ready`,
    // The control port, not the WebRTC port. go2rtc serves `/api` on one and SDP on the other, and
    // pointing the readiness probe at the WebRTC port reports "unreachable" against a healthy runtime.
    `GO2RTC_URL=http://127.0.0.1:${ports.media}`,
    '',
  ].join('\n');
  writeFileSync(path.join(fixture, '.env'), env);
}

function runManifestGenerate() {
  const result = spawnSync(process.execPath, ['scripts/manage-baseline-manifest.mjs', 'generate'], {
    cwd: fixture,
    encoding: 'utf8',
    windowsHide: true,
  });
  assert(!result.error && result.status === 0, `fixture manifest generation failed: ${result.stderr || result.stdout || result.error?.message}`);
}

function sha256File(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function writeLocalRuntimeState(mqttPort) {
  const runtimeDir = path.join(fixture, 'reports', 'local-runtime');
  mkdirSync(runtimeDir, { recursive: true });
  writeFileSync(
    path.join(runtimeDir, 'state.json'),
    `${JSON.stringify({
      schemaVersion: 3,
      status: 'CORE_RUNTIME_READY_LIVE_BROKER_EVIDENCE_PENDING',
      sourceFingerprint: {
        packageLockSha256: sha256File(path.join(fixture, 'package-lock.json')),
        baselineManifestSha256: sha256File(path.join(fixture, 'BASELINE-MANIFEST.sha256')),
        repositoryTreeSha256: sha256File(path.join(fixture, 'repository-tree.txt')),
      },
      apiMode: 'compose',
      apiService: 'api',
      mqttHostPort: mqttPort,
      mqttHostUrl: `mqtt://127.0.0.1:${mqttPort}`,
      envPath: path.join(fixture, '.env'),
      composeCommand: 'synthetic',
      startedAt: new Date().toISOString(),
      readyAt: new Date().toISOString(),
    }, null, 2)}\n`,
  );
}

function runAcceptance() {
  return new Promise((resolve, reject) => {
    const pathValue = `${fakeBin}${path.delimiter}${process.env.PATH ?? ''}`;
    const child = spawn(
      process.execPath,
      ['scripts/run-rescue-acceptance.mjs', '--env=.env', '--full', '--report=reports/acceptance-self-test.json'],
      {
        cwd: fixture,
        env: { ...process.env, PATH: pathValue, FAKE_NPM_LOG: npmLog },
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.once('error', reject);
    child.once('close', (code) => resolve({ code, stdout, stderr }));
  });
}

function readNpmCalls() {
  if (!existsSync(npmLog)) return [];
  return readFileSync(npmLog, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

try {
  assert(
    !shouldCopy(path.join(root, 'apps', 'admin-web', '.next', 'node_modules', '@prisma', 'client')),
    'acceptance self-test source copy must exclude nested .next dependency links',
  );
  assert(
    !shouldCopy(path.join(root, 'apps', 'user-web', 'dist', 'generated.js')),
    'acceptance self-test source copy must exclude nested generated directories',
  );
  copySource();
  prepareDependencies();
  prepareFakeNpm();
  const services = await startServices();
  const foreignMqttPort = await startAcceptAllMqtt();
  writeEnv(services, foreignMqttPort);
  runManifestGenerate();
  writeLocalRuntimeState(services.mqtt);

  const result = await runAcceptance();
  assert(result.code === 0, `acceptance runner self-test exited ${result.code}: ${result.stderr || result.stdout}`);
  const acceptance = JSON.parse(readFileSync(report, 'utf8'));
  assert(acceptance.status === 'AUTOMATED_TEST_SUITE_PASS', `unexpected acceptance status ${acceptance.status}`);
  assert(acceptance.runtimePreflight?.ready === true, 'runtime preflight fixture must be READY');
  assert(
    acceptance.runtimePreflight?.rows?.find((row) => row.name === 'MQTT wrong-secret rejection')?.state === 'PASS',
    'acceptance local runtime preflight must use the source-bound rescue MQTT endpoint instead of a fail-open legacy host broker',
  );

  const calls = readNpmCalls();
  const find = (prefix) => calls.find((call) => prefix.every((value, index) => call.args[index] === value));
  assert(find(['run', 'build'])?.nodeEnv === 'production', 'backend production build must force NODE_ENV=production');
  assert(find(['run', 'web:validate'])?.nodeEnv === 'production', 'web/mobile production validation must force NODE_ENV=production');
  assert(find(['test', '--', '--runInBand'])?.nodeEnv === 'test', 'unit/contract tests must run with NODE_ENV=test');
  assert(find(['run', 'test:integration:db'])?.nodeEnv === 'test', 'database integration must run with NODE_ENV=test');
  assert(find(['run', 'test:integration:mqtt'])?.nodeEnv === 'test', 'MQTT integration must run with NODE_ENV=test');

  console.log('PASS  acceptance self-test source copy excludes nested generated trees such as web .next symlink forests');
  console.log('PASS  acceptance orchestrator reaches full suite with protocol-valid synthetic fixtures');
  console.log('PASS  acceptance local preflight follows the source-bound rescue MQTT endpoint instead of a foreign legacy broker');
  console.log('PASS  full-suite build subprocesses are forced to NODE_ENV=production while test/integration subprocesses are forced to NODE_ENV=test');
  console.log('INFO  synthetic fixture uses fake npm and is checker regression evidence only; it is never RESCUE-02B runtime evidence');
} finally {
  await closeServers();
  rmSync(sandbox, { recursive: true, force: true });
}
