#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();
const checker = path.join(root, 'scripts/check-rescue-runtime.mjs');
const fixture = mkdtempSync(path.join(os.tmpdir(), 'iot-rescue-runtime-probe-'));
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


function decodeMqttRemainingLength(buffer, start = 1) {
  let multiplier = 1;
  let value = 0;
  let offset = start;
  let encoded;
  do {
    encoded = buffer[offset++];
    if (encoded === undefined) throw new Error('incomplete MQTT remaining length');
    value += (encoded & 127) * multiplier;
    multiplier *= 128;
    if (multiplier > 128 * 128 * 128 * 128) throw new Error('invalid MQTT remaining length');
  } while ((encoded & 128) !== 0);
  return { value, offset };
}

function readMqttUtf8(buffer, offset) {
  if (buffer.length < offset + 2) throw new Error('incomplete MQTT UTF-8 length');
  const length = buffer.readUInt16BE(offset);
  const start = offset + 2;
  const end = start + length;
  if (buffer.length < end) throw new Error('incomplete MQTT UTF-8 value');
  return { value: buffer.subarray(start, end).toString('utf8'), offset: end };
}

function mqtt311Credentials(buffer) {
  if (buffer[0] !== 0x10) throw new Error('not an MQTT CONNECT packet');
  const remaining = decodeMqttRemainingLength(buffer);
  let offset = remaining.offset;
  const protocol = readMqttUtf8(buffer, offset);
  offset = protocol.offset;
  if (protocol.value !== 'MQTT') throw new Error('unexpected MQTT protocol name');
  if (buffer[offset++] !== 0x04) throw new Error('unexpected MQTT protocol version');
  const flags = buffer[offset++];
  offset += 2; // keepalive
  const clientId = readMqttUtf8(buffer, offset);
  offset = clientId.offset;
  if (flags & 0x04) {
    const willTopic = readMqttUtf8(buffer, offset);
    const willPayload = readMqttUtf8(buffer, willTopic.offset);
    offset = willPayload.offset;
  }
  const username = flags & 0x80 ? readMqttUtf8(buffer, offset) : { value: '', offset };
  offset = username.offset;
  const password = flags & 0x40 ? readMqttUtf8(buffer, offset) : { value: '', offset };
  return { clientId: clientId.value, username: username.value, password: password.value };
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

function writeEnv(ports, options = {}) {
  const mqttBrokerPort = options.mqttBrokerPort ?? ports.mqtt;
  const rescueMqttPort = options.rescueMqttPort ?? ports.mqtt;
  const env = [
    'SCHEDULER_RUNTIME_ENABLED=true',
    'AUTOMATION_RUNTIME_ENABLED=true',
    'SCHEDULER_CLAIM_TIMEOUT_MS=300000',
    `DATABASE_URL=postgresql://iot:fixture-password@127.0.0.1:${ports.postgres}/iot`,
    `REDIS_URL=redis://127.0.0.1:${ports.redis}`,
    `MQTT_BROKER_URL=mqtt://127.0.0.1:${mqttBrokerPort}`,
    `RESCUE_MQTT_HOST_PORT=${rescueMqttPort}`,
    `RESCUE_MQTT_BROKER_URL=mqtt://127.0.0.1:${rescueMqttPort}`,
    'MQTT_USERNAME=fixture-publisher',
    'MQTT_PASSWORD=fixture-password',
    'MQTT_WEBHOOK_SECRET=fixture-webhook-secret-12345',
    'JWT_SECRET=fixture-jwt-secret-123456789',
    'EMQX_DASHBOARD_USERNAME=admin',
    'EMQX_DASHBOARD_PASSWORD=fixture-dashboard-secret',
    `EMQX_API_URL=http://127.0.0.1:${ports.emqx}`,
    `API_PROBE_URL=http://127.0.0.1:${ports.api}/health/ready`,
    // The control port. go2rtc answers `/api` on one port and SDP on another, and pointing the
    // readiness probe at the WebRTC port reports "unreachable" against a perfectly healthy runtime.
    ...(ports.media ? [`GO2RTC_URL=http://127.0.0.1:${ports.media}`] : []),
    'PORT=3000',
    '',
  ].join('\n');
  writeFileSync(path.join(fixture, '.env'), env);
}

// The endpoints the fixture's own `.env` is responsible for. These are stripped from the checker's
// environment so nothing ambient can answer a probe the fixture meant to control.
//
// This is not hygiene, it is the whole test. The CI `test` job runs real `postgres:16` and
// `redis:7-alpine` service containers and exports `DATABASE_URL`/`REDIS_URL` at job level. Inheriting
// those made the *bad* fixture connect to real PostgreSQL and Redis instead of its own broken stubs:
// the SSLRequest got a real `N` and PING got a real `+PONG`, so both rows PASS. The fixture then
// asserted nothing useful about postgres or redis rejection and the gate stayed green while testing
// nothing -- a negative fixture that cannot fail is worse than no fixture, because it looks like
// coverage.
//
// Locally there is no such job-level variable, which is why this passed 10/10 here and failed on every
// CI run. A test whose result depends on the host's environment is not a test.
const FIXTURE_OWNED_ENV = [
  'DATABASE_URL',
  'TEST_DATABASE_URL',
  'REDIS_URL',
  'MQTT_BROKER_URL',
  'MQTT_USERNAME',
  'MQTT_PASSWORD',
  'RESCUE_MQTT_HOST_PORT',
  'RESCUE_MQTT_BROKER_URL',
  'EMQX_API_URL',
  'EMQX_DASHBOARD_USERNAME',
  'EMQX_DASHBOARD_PASSWORD',
  'API_PROBE_URL',
  'GO2RTC_URL',
];

function fixtureOwnedEnv() {
  const child = { ...process.env };
  for (const key of FIXTURE_OWNED_ENV) delete child[key];
  return child;
}

function runChecker(scope = 'full') {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [checker, '--strict', `--probe-scope=${scope}`, '--json', '--env=.env'], {
      cwd: fixture,
      env: fixtureOwnedEnv(),
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.once('error', reject);
    child.once('close', (code) => {
      try {
        resolve({ code, report: JSON.parse(stdout), stderr });
      } catch (error) {
        reject(new Error(`checker returned invalid JSON: ${error.message}; stderr=${stderr}`));
      }
    });
  });
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

async function startGoodServices({ mqttAcceptAll = false } = {}) {
  const postgres = await listen(net.createServer((socket) => socket.once('data', () => socket.write(Buffer.from('N')))));
  const redis = await listen(
    net.createServer((socket) => socket.on('data', (data) => {
      if (data.toString('utf8').includes('PING')) socket.write('+PONG\r\n');
    })),
  );
  const mqtt = await listen(
    net.createServer((socket) =>
      socket.once('data', (data) => {
        try {
          const credentials = mqtt311Credentials(data);
          const accepted =
            mqttAcceptAll ||
            (credentials.username === 'fixture-publisher' &&
              credentials.password === 'fixture-password');
          socket.write(Buffer.from([0x20, 0x02, 0x00, accepted ? 0x00 : 0x05]));
        } catch {
          socket.write(Buffer.from([0x20, 0x02, 0x00, 0x05]));
        }
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
  // The `full` scope probes a media runtime, so the good fixture has to provide one. Added after the
  // readiness row made this fixture fail: it stood in for the whole runtime while carrying one service
  // fewer than it did, and the gap surfaced as a failing gate rather than as an incomplete fixture.
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
        response.end(JSON.stringify({
          status: 'ready',
          checks: { postgres: { status: 'up' }, redis: { status: 'up' }, mqtt: { status: 'up' } },
        }));
        return;
      }
      response.writeHead(404).end();
    }),
  );
  return { postgres, redis, mqtt, emqx, media, api };
}

async function startBadServices() {
  const raw = () => net.createServer((socket) => socket.once('data', () => socket.write('HELLO')));
  const postgres = await listen(raw());
  const redis = await listen(raw());
  const mqtt = await listen(raw());
  const emqx = await listen(
    http.createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ ok: true }));
    }),
  );
  const api = await listen(
    http.createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ status: 'ok' }));
    }),
  );
  return { postgres, redis, mqtt, emqx, api };
}

const probeNames = [
  'PostgreSQL protocol',
  'Redis protocol',
  'MQTT CONNECT/auth',
  'MQTT wrong-secret rejection',
  'EMQX Dashboard login',
  'API /health/ready',
];

try {
  prepareDependencies();

  writeEnv(await startGoodServices());
  const goodInfra = await runChecker('infra');
  assert(goodInfra.code === 0, `good infra fixture checker exited ${goodInfra.code}: ${goodInfra.stderr}`);
  assert(goodInfra.report.ready === true, 'good infra fixture must be ready');
  assert(goodInfra.report.probeScope === 'infra', 'infra report must declare probeScope=infra');
  for (const name of ['PostgreSQL protocol', 'Redis protocol', 'EMQX Dashboard login']) {
    assert(goodInfra.report.rows.find((row) => row.name === name)?.state === 'PASS', `${name} did not PASS infra fixture`);
  }
  assert(!goodInfra.report.rows.some((row) => row.name === 'MQTT CONNECT/auth'), 'infra scope must not probe MQTT auth');
  assert(!goodInfra.report.rows.some((row) => row.name === 'MQTT wrong-secret rejection'), 'infra scope must not probe MQTT negative auth');
  assert(!goodInfra.report.rows.some((row) => row.name === 'API /health/ready'), 'infra scope must not probe API readiness');
  console.log('PASS  staged infra probe validates only PostgreSQL Redis and EMQX Dashboard');

  const good = await runChecker('full');
  assert(good.code === 0, `good fixture checker exited ${good.code}: ${good.stderr}`);
  assert(good.report.ready === true, 'good fixture must be ready');
  assert(good.report.probeScope === 'full', 'full report must declare probeScope=full');
  for (const name of probeNames) {
    assert(good.report.rows.find((row) => row.name === name)?.state === 'PASS', `${name} did not PASS good fixture`);
  }

  // Asserted here rather than through `probeNames` because that list is reused for the bad fixture,
  // which has no media stub. Adding the row there would make the assertion depend on whether
  // something happens to be listening on the media port -- true on a developer machine with go2rtc
  // running, false on a clean runner. A test that passes or fails based on the host is worse than no
  // test.
  //
  // The version detail matters: a 200 from something that is not a media runtime must not pass, or
  // the row proves only that an HTTP server answered.
  const goodMedia = good.report.rows.find((row) => row.name === 'media runtime /api');
  assert(
    goodMedia?.state === 'PASS',
    `media runtime /api did not PASS good fixture: ${goodMedia?.state ?? 'row absent'}`,
  );
  assert(
    /^go2rtc .+ at https?:\/\//.test(goodMedia?.detail ?? ''),
    `media runtime row did not report a version: ${goodMedia?.detail ?? 'no detail'}`,
  );
  console.log('PASS  protocol-aware runtime checker accepts valid service fixtures (full scope)');

  await closeServers();
  const isolatedServices = await startGoodServices();
  const foreignMqttPort = await startAcceptAllMqtt();
  writeEnv(isolatedServices, {
    mqttBrokerPort: foreignMqttPort,
    rescueMqttPort: isolatedServices.mqtt,
  });
  const isolated = await runChecker('full');
  assert(isolated.code === 0, `dedicated rescue MQTT endpoint must isolate a foreign fail-open broker: ${isolated.stderr}`);
  assert(isolated.report.rows.find((row) => row.name === 'MQTT CONNECT/auth')?.state === 'PASS', 'dedicated rescue MQTT endpoint must accept valid rescue credentials');
  assert(isolated.report.rows.find((row) => row.name === 'MQTT wrong-secret rejection')?.state === 'PASS', 'dedicated rescue MQTT endpoint must reject wrong credentials even when legacy MQTT_BROKER_URL points at a fail-open foreign broker');
  console.log('PASS  dedicated rescue MQTT endpoint isolates a foreign fail-open broker on the legacy host endpoint');

  await closeServers();
  writeEnv(await startGoodServices({ mqttAcceptAll: true }));
  const insecureAuth = await runChecker('full');
  assert(insecureAuth.code !== 0, 'fail-open MQTT fixture must fail full runtime readiness');
  assert(
    insecureAuth.report.rows.find((row) => row.name === 'MQTT CONNECT/auth')?.state === 'PASS',
    'fail-open MQTT fixture must still prove that valid credentials connect',
  );
  assert(
    insecureAuth.report.rows.find((row) => row.name === 'MQTT wrong-secret rejection')?.state === 'FAIL',
    'fail-open MQTT fixture must be rejected specifically by the negative-auth probe',
  );
  console.log('PASS  runtime checker rejects a broker that accepts valid and wrong MQTT credentials alike');

  await closeServers();
  writeEnv(await startBadServices());
  const bad = await runChecker('full');
  assert(bad.code !== 0, 'bad fixture checker must fail');
  for (const name of probeNames) {
    const observed = bad.report.rows.find((row) => row.name === name);
    // The whole observed row set goes into the message. It previously printed only the missing name,
    // and a CI failure then read as "PostgreSQL protocol did not reject bad fixture" with nothing
    // indicating whether the row was PASS, absent, or renamed -- three different bugs, none of them
    // guessable from the name, and the kind that gets "fixed" by loosening the assertion.
    assert(
      observed?.state === 'FAIL',
      `${name} did not reject bad fixture; observed rows: ${JSON.stringify(
        bad.report.rows.map((row) => [row.name, row.state]),
      )}`,
    );
  }
  console.log('PASS  protocol-aware runtime checker rejects raw/invalid service fixtures');
} finally {
  await closeServers();
  rmSync(fixture, { recursive: true, force: true });
}
