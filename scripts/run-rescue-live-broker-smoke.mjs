#!/usr/bin/env node

/**
 * RESCUE Live Evidence Phase A runner.
 *
 * IMPORTANT:
 * - Run this file OUTSIDE the repository while cwd is the RESCUE repository root.
 * - It does not modify source files or baseline manifests.
 * - It writes only generated evidence artifacts under reports/.
 * - It never writes passwords, JWTs, provisioning tokens, MQTT secrets,
 *   webhook secrets, or EMQX dashboard credentials to evidence artifacts.
 * - It marks PASS only after a live assertion succeeds.
 * - Physical ESP32 checks remain untouched/PENDING.
 */

import {
  createHash,
  randomBytes,
  randomUUID,
} from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  expectPublishDeniedBounded,
  mqttPublishBounded,
  mqttSubscribeBounded,
  observeSubscribeDenialBounded,
} from './lib/rescue-mqtt-operations.mjs';

const argv = process.argv.slice(2);
const arg = (name) =>
  argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);

const projectRoot = path.resolve(arg('project') ?? process.cwd());
const envPath = path.resolve(projectRoot, arg('env') ?? '.env');
const evidenceArg = arg('file');
const evidenceMode = Boolean(evidenceArg);
const evidencePath = evidenceArg ? path.resolve(projectRoot, evidenceArg) : null;
const packageJsonPath = path.join(projectRoot, 'package.json');
const attachScript = path.join(
  projectRoot,
  'scripts',
  'attach-rescue-02b-evidence.mjs',
);
const manifestScript = path.join(
  projectRoot,
  'scripts',
  'manage-baseline-manifest.mjs',
);

function fail(message) {
  const error = new Error(message);
  error.exitCode = 1;
  throw error;
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function parseEnv(file) {
  const values = {};
  if (!existsSync(file)) return values;

  for (const rawLine of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index <= 0) continue;

    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();

    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }

    values[key] = value;
  }

  return values;
}

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== 'object') return value;

  const output = {};
  const blocked =
    /(password|secret|token|authorization|credential|pairingcode|provisioningtoken|accesstoken|refreshtoken)/i;

  for (const [key, child] of Object.entries(value)) {
    if (blocked.test(key)) {
      output[key] = '[REDACTED]';
    } else {
      output[key] = redact(child);
    }
  }

  return output;
}

function shortBody(body) {
  const safe = redact(body);
  const text =
    typeof safe === 'string' ? safe : JSON.stringify(safe ?? {});
  return text.slice(0, 600);
}

function sha256Text(value) {
  return createHash('sha256').update(value).digest('hex');
}

function normalizeHttpBase(env) {
  const explicit = env.RESCUE_API_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, '');

  const probe = env.API_PROBE_URL?.trim();
  if (probe) {
    try {
      const url = new URL(probe);
      return `${url.protocol}//${url.host}`;
    } catch {
      // continue
    }
  }

  const port = env.PORT?.trim() || '3000';
  return `http://127.0.0.1:${port}`;
}

function normalizeBrokerUrl(env) {
  const explicit = env.RESCUE_MQTT_BROKER_URL?.trim();
  if (explicit) return explicit;

  const raw = env.MQTT_BROKER_URL?.trim();
  const hostPort =
    env.RESCUE_MQTT_HOST_PORT?.trim() ||
    env.MQTT_PORT?.trim() ||
    '18884';

  if (raw) {
    try {
      const url = new URL(raw);
      if (
        ['emqx', 'mqtt', 'broker', 'localhost'].includes(
          url.hostname.toLowerCase(),
        )
      ) {
        url.hostname = '127.0.0.1';
      }
      if (!url.port && url.protocol === 'mqtt:') url.port = hostPort;
      return url.toString();
    } catch {
      // continue
    }
  }

  return `mqtt://127.0.0.1:${hostPort}`;
}

function normalizeEmqxApiUrl(env) {
  return (env.EMQX_API_URL?.trim() || 'http://127.0.0.1:18083').replace(
    /\/$/,
    '',
  );
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(predicate, label, timeoutMs = 12_000, intervalMs = 250) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      const result = await predicate();
      if (result) return result;
    } catch (error) {
      lastError = error;
    }

    await sleep(intervalMs);
  }

  if (lastError) {
    fail(`${label} timed out; last error: ${lastError.message ?? lastError}`);
  }
  fail(`${label} timed out.`);
}

function runNodeScript(script, args = [], { quiet = false } = {}) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: projectRoot,
    env: process.env,
    encoding: 'utf8',
    windowsHide: true,
    stdio: quiet ? 'pipe' : 'inherit',
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = quiet
      ? `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim().slice(-1500)
      : '';
    fail(
      `${path.basename(script)} failed with exit code ${result.status}${
        detail ? `: ${detail}` : ''
      }`,
    );
  }

  return result;
}

assert(existsSync(packageJsonPath), `package.json missing under ${projectRoot}`);
assert(existsSync(envPath), `Environment file missing: ${envPath}`);
if (evidenceMode) {
  assert(existsSync(evidencePath), `Evidence file missing: ${evidencePath}`);
  assert(existsSync(attachScript), `Evidence attach helper missing: ${attachScript}`);
}
assert(existsSync(manifestScript), `Manifest helper missing: ${manifestScript}`);

const fileEnv = parseEnv(envPath);
for (const [key, value] of Object.entries(fileEnv)) {
  if (process.env[key] === undefined) process.env[key] = value;
}

console.log('CHECK  Exact sealed-source manifest...');
runNodeScript(manifestScript, ['verify']);

const rootRequire = createRequire(packageJsonPath);
const { PrismaClient } = rootRequire('@prisma/client');
const argon2 = rootRequire('argon2');
const mqtt = rootRequire('mqtt');

const prisma = new PrismaClient();
const activeMqttClients = new Set();

function brokerCheck(id) {
  console.log(`CHECK ${id}...`);
}

const apiBase = normalizeHttpBase({ ...fileEnv, ...process.env });
const brokerUrl = normalizeBrokerUrl({ ...fileEnv, ...process.env });
const emqxApiUrl = normalizeEmqxApiUrl({ ...fileEnv, ...process.env });

const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()
  .slice(0, 8)}`;
const artifactDir = path.join(
  evidenceMode ? path.dirname(evidencePath) : path.join(projectRoot, 'reports'),
  `live-broker-smoke-${runId}`,
);
mkdirSync(artifactDir, { recursive: true });

function loadEvidence() {
  if (!evidenceMode) return null;
  return JSON.parse(readFileSync(evidencePath, 'utf8'));
}

function saveEvidence(evidence) {
  if (!evidenceMode) return;
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
}

function setEvidenceMetadata(emqxVersion) {
  if (!evidenceMode) return;
  const evidence = loadEvidence();
  evidence.runtimeFlow.environment = [
    'RESCUE Compose live evidence',
    `api=${apiBase}`,
    `broker=${new URL(brokerUrl).protocol}//${new URL(brokerUrl).host}`,
    `database=${new URL(process.env.DATABASE_URL).hostname}`,
  ].join('; ');
  evidence.liveBroker.emqxVersion = emqxVersion;
  evidence.operatorNotes = [
    evidence.operatorNotes?.trim(),
    `Live broker run ${runId}; secrets intentionally excluded from artifacts.`,
  ]
    .filter(Boolean)
    .join(' ');
  saveEvidence(evidence);
}

function isCheckPass(section, check) {
  if (!evidenceMode) return false;
  const evidence = loadEvidence();
  return (
    evidence?.[section]?.checks?.find((item) => item.id === check)?.status ===
    'PASS'
  );
}

function writeArtifact(name, details) {
  const file = path.join(artifactDir, `${name}.json`);
  const document = {
    schemaVersion: 1,
    gate: 'RESCUE-02B',
    phase: 'live-phase-a',
    runId,
    observedAt: new Date().toISOString(),
    source: evidenceMode ? 'RESCUE live evidence runner' : 'RESCUE GitHub live broker smoke',
    details: redact(details),
  };
  writeFileSync(file, `${JSON.stringify(document, null, 2)}\n`);
  return file;
}

function attach(section, check, artifact, note) {
  if (!evidenceMode) {
    console.log(`PASS  ${section}.${check}`);
    return;
  }
  if (isCheckPass(section, check)) {
    console.log(`SKIP  ${section}.${check} already PASS`);
    return;
  }

  const result = spawnSync(
    process.execPath,
    [
      attachScript,
      `--file=${evidencePath}`,
      `--section=${section}`,
      `--check=${check}`,
      `--artifact=${artifact}`,
      `--note=${note}`,
    ],
    {
      cwd: projectRoot,
      env: process.env,
      encoding: 'utf8',
      windowsHide: true,
    },
  );

  if (result.error) throw result.error;
  if (result.status !== 0) {
    fail(
      `Evidence attach failed for ${section}.${check}: ${(
        result.stderr ||
        result.stdout ||
        ''
      )
        .trim()
        .slice(-800)}`,
    );
  }

  console.log(`PASS  ${section}.${check}`);
}

async function jsonOrText(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function apiRequest(
  method,
  pathname,
  {
    token,
    tenantId,
    body,
    headers = {},
    expected = [200, 201],
  } = {},
) {
  const requestHeaders = {
    accept: 'application/json',
    ...headers,
  };

  if (body !== undefined) requestHeaders['content-type'] = 'application/json';
  if (token) requestHeaders.authorization = `Bearer ${token}`;
  if (tenantId) requestHeaders['x-tenant-id'] = tenantId;

  const response = await fetch(`${apiBase}${pathname}`, {
    method,
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(12_000),
  });
  const responseBody = await jsonOrText(response);

  if (!expected.includes(response.status)) {
    fail(
      `${method} ${pathname} expected HTTP ${expected.join(
        '/',
      )}, got ${response.status}: ${shortBody(responseBody)}`,
    );
  }

  return { status: response.status, body: responseBody };
}

async function login(email, password, tenantId) {
  const { status, body } = await apiRequest('POST', '/auth/login', {
    body: { email, password, tenantId },
    expected: [200, 201],
  });

  assert(
    typeof body?.accessToken === 'string' && body.accessToken.length > 20,
    'Login response missing accessToken',
  );

  return {
    status,
    accessToken: body.accessToken,
    role: body.role,
    refreshTokenPresent:
      typeof body?.refreshToken === 'string' && body.refreshToken.length > 20,
  };
}

function randomSecret(prefix = 'S') {
  return `${prefix}-${randomBytes(24).toString('base64url')}`;
}

async function ensurePlatformFixture() {
  const tenantId = '22222222-2222-4222-8222-222222222222';
  const email = `rr26-${runId.slice(-8)}@evidence.iot.test`;
  const password = randomSecret('Platform');

  await prisma.tenant.upsert({
    where: { id: tenantId },
    update: {},
    create: { id: tenantId, name: 'Platform Operations' },
  });

  const user = await prisma.user.create({
    data: {
      email,
      name: `RESCUE Evidence ${runId.slice(-8)}`,
      tenantId,
      isVerified: true,
      credential: {
        create: { passwordHash: await argon2.hash(password) },
      },
      memberships: {
        create: {
          tenantId,
          role: 'PLATFORM_ADMIN',
          status: 'ACTIVE',
        },
      },
    },
    select: { id: true },
  });

  return { tenantId, email, password, userId: user.id };
}

async function getEmqxVersion() {
  const username = process.env.EMQX_DASHBOARD_USERNAME?.trim();
  const password = process.env.EMQX_DASHBOARD_PASSWORD;

  assert(username, 'EMQX_DASHBOARD_USERNAME missing');
  assert(password, 'EMQX_DASHBOARD_PASSWORD missing');

  const loginResponse = await fetch(`${emqxApiUrl}/api/v5/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({ username, password }),
    signal: AbortSignal.timeout(10_000),
  });

  const loginBody = await jsonOrText(loginResponse);
  assert(loginResponse.status === 200, 'EMQX dashboard login failed');
  const token = loginBody?.token;
  assert(typeof token === 'string' && token.length > 10, 'EMQX token missing');

  for (const endpoint of ['/api/v5/nodes', '/api/v5/status']) {
    const response = await fetch(`${emqxApiUrl}${endpoint}`, {
      headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) continue;
    const body = await jsonOrText(response);
    const rows = Array.isArray(body)
      ? body
      : Array.isArray(body?.data)
        ? body.data
        : Array.isArray(body?.nodes)
          ? body.nodes
          : [];

    const candidate =
      body?.version ||
      body?.node_version ||
      rows[0]?.version ||
      rows[0]?.node_version ||
      rows[0]?.edition;

    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }

  for (const runtime of ['docker', 'podman']) {
    const result = spawnSync(
      runtime,
      ['exec', 'iot-rescue-emqx', 'emqx', 'ctl', 'status'],
      {
        cwd: projectRoot,
        encoding: 'utf8',
        windowsHide: true,
      },
    );
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
    const match = output.match(/EMQX\s+([0-9]+(?:\.[0-9]+){1,3})/i);
    if (result.status === 0 && match) return match[1];
  }

  fail('Could not determine the live EMQX version.');
}

function mqttOptions(username, password, label) {
  return {
    username,
    password,
    clientId: `rr26-${label}-${randomUUID()}`,
    clean: true,
    reconnectPeriod: 0,
    connectTimeout: 8_000,
    keepalive: 20,
    protocolVersion: 5,
  };
}

async function connectMqtt(username, password, label) {
  return await new Promise((resolve, reject) => {
    const client = mqtt.connect(brokerUrl, mqttOptions(username, password, label));
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        client.end(true);
        reject(new Error(`${label} MQTT connect timed out`));
      }
    }, 10_000);

    client.once('connect', (packet) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      activeMqttClients.add(client);
      resolve({ client, packet });
    });

    client.once('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      client.end(true);
      reject(error);
    });

    client.once('close', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(`${label} MQTT connection closed before CONNACK`));
    });
  });
}

async function expectMqttDenied(username, password, label) {
  try {
    const { client } = await connectMqtt(username, password, label);
    await endMqtt(client);
    return false;
  } catch {
    return true;
  }
}

async function endMqtt(client) {
  if (!client) return;
  activeMqttClients.delete(client);

  await new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(finish, 800);

    try {
      client.end(true, {}, finish);
    } catch {
      finish();
    }
  });
}

async function closeActiveMqttClients() {
  const clients = [...activeMqttClients];
  await Promise.allSettled(clients.map((client) => endMqtt(client)));
}

async function mqttSubscribe(client, topic, qos = 1, timeoutMs = 8_000) {
  return await mqttSubscribeBounded(client, topic, qos, timeoutMs);
}

async function expectSubscribeDeniedFresh(
  username,
  password,
  label,
  topic,
  qos = 1,
  timeoutMs = 8_000,
) {
  const { client } = await connectMqtt(username, password, label);
  try {
    const result = await observeSubscribeDenialBounded(
      client,
      topic,
      qos,
      timeoutMs,
    );
    assert(
      result.denied,
      `${label} subscription was unexpectedly accepted for ${topic}`,
    );
    return result;
  } finally {
    await endMqtt(client);
  }
}

async function expectPublishDeniedFresh(
  username,
  password,
  label,
  topic,
  payload,
  qos = 1,
  timeoutMs = 8_000,
) {
  const { client } = await connectMqtt(username, password, label);
  try {
    const result = await expectPublishDeniedBounded(
      client,
      topic,
      payload,
      qos,
      timeoutMs,
    );
    assert(
      result.denied,
      `${label} publish was unexpectedly accepted for ${topic}`,
    );
    return result;
  } finally {
    await endMqtt(client);
  }
}

async function mqttPublish(
  client,
  topic,
  payload,
  qos = 1,
  timeoutMs = 8_000,
) {
  return await mqttPublishBounded(
    client,
    topic,
    payload,
    qos,
    timeoutMs,
  );
}

function createMessageQueue(client) {
  const queue = [];
  const waiters = [];

  client.on('message', (topic, buffer) => {
    let parsed;
    try {
      parsed = JSON.parse(buffer.toString('utf8'));
    } catch {
      parsed = buffer.toString('utf8');
    }

    const message = { topic, payload: parsed, receivedAt: new Date().toISOString() };
    queue.push(message);

    for (const waiter of [...waiters]) {
      if (waiter.predicate(message)) {
        waiters.splice(waiters.indexOf(waiter), 1);
        clearTimeout(waiter.timer);
        waiter.resolve(message);
      }
    }
  });

  return {
    async waitFor(predicate, timeoutMs = 10_000) {
      const existing = queue.find(predicate);
      if (existing) return existing;

      return await new Promise((resolve, reject) => {
        const waiter = {
          predicate,
          resolve,
          reject,
          timer: setTimeout(() => {
            const index = waiters.indexOf(waiter);
            if (index >= 0) waiters.splice(index, 1);
            reject(new Error('MQTT message wait timed out'));
          }, timeoutMs),
        };
        waiters.push(waiter);
      });
    },
  };
}

async function main() {
  console.log(`INFO  API     ${apiBase}`);
  console.log(`INFO  MQTT    ${new URL(brokerUrl).protocol}//${new URL(brokerUrl).host}`);
  console.log(`INFO  Mode    ${evidenceMode ? `evidence -> ${evidencePath}` : 'CI smoke (no evidence mutation)'}`);
  console.log('SAFETY  Secrets will not be written to report artifacts.');

  await prisma.$connect();

  const emqxVersion = await getEmqxVersion();
  setEvidenceMetadata(emqxVersion);
  console.log(`INFO  Live EMQX version: ${emqxVersion}`);

  const platform = await ensurePlatformFixture();
  const platformLogin = await login(
    platform.email,
    platform.password,
    platform.tenantId,
  );
  assert(platformLogin.role === 'PLATFORM_ADMIN', 'Platform login role mismatch');

  const loginArtifact = writeArtifact('runtime-login', {
    httpStatus: platformLogin.status,
    role: platformLogin.role,
    accessTokenPresent: true,
    refreshTokenPresent: platformLogin.refreshTokenPresent,
    platformTenantId: platform.tenantId,
  });
  attach(
    'runtimeFlow',
    'login',
    loginArtifact,
    'Live API login returned a PLATFORM_ADMIN session; token values are redacted.',
  );

  const tenantAResponse = await apiRequest('POST', '/admin/tenants', {
    token: platformLogin.accessToken,
    tenantId: platform.tenantId,
    body: { name: `RESCUE Evidence A ${runId.slice(-8)}` },
  });
  const tenantBResponse = await apiRequest('POST', '/admin/tenants', {
    token: platformLogin.accessToken,
    tenantId: platform.tenantId,
    body: { name: `RESCUE Evidence B ${runId.slice(-8)}` },
  });

  const tenantA = tenantAResponse.body;
  const tenantB = tenantBResponse.body;
  assert(tenantA?.id && tenantB?.id, 'Tenant creation did not return ids');

  const tenantAdminEmail = `tenant-admin-${runId.slice(-8)}@evidence.iot.test`;
  const tenantAdminPassword = randomSecret('TenantAdmin');

  const tenantAdmin = (
    await apiRequest('POST', '/admin/platform-users', {
      token: platformLogin.accessToken,
      tenantId: platform.tenantId,
      body: {
        tenantId: tenantA.id,
        email: tenantAdminEmail,
        name: 'RESCUE Evidence Tenant Admin',
        password: tenantAdminPassword,
        role: 'ADMIN',
      },
    })
  ).body;

  const adminLogin = await login(
    tenantAdminEmail,
    tenantAdminPassword,
    tenantA.id,
  );
  assert(adminLogin.role === 'ADMIN', 'Tenant admin login role mismatch');

  const correctTenant = await apiRequest('GET', '/admin/tenant-devices', {
    token: adminLogin.accessToken,
    tenantId: tenantA.id,
    expected: [200],
  });
  const wrongTenant = await apiRequest('GET', '/admin/tenant-devices', {
    token: adminLogin.accessToken,
    tenantId: tenantB.id,
    expected: [403],
  });

  const tenantIsolationArtifact = writeArtifact('tenant-context-isolation', {
    authorizedTenant: {
      tenantId: tenantA.id,
      httpStatus: correctTenant.status,
    },
    unauthorizedTenant: {
      tenantId: tenantB.id,
      httpStatus: wrongTenant.status,
    },
  });
  attach(
    'runtimeFlow',
    'tenant-context-isolation',
    tenantIsolationArtifact,
    'Tenant ADMIN read succeeded in its active tenant and was denied in a tenant without membership.',
  );

  const provisionA = (
    await apiRequest('POST', '/admin/platform-devices', {
      token: platformLogin.accessToken,
      tenantId: platform.tenantId,
      body: {
        tenantId: tenantA.id,
        name: `RESCUE Evidence Device A ${runId.slice(-8)}`,
        type: 'ACTUATOR',
      },
    })
  ).body;

  assert(provisionA?.device?.id, 'Provisioning did not return device id');
  assert(
    provisionA?.device?.status === 'PROVISIONING',
    'Provisioned device was not PROVISIONING',
  );
  assert(
    typeof provisionA?.provisioningToken === 'string' &&
      provisionA.provisioningToken.length > 10,
    'Provisioning token missing',
  );

  const deviceAId = provisionA.device.id;
  const registerArtifact = writeArtifact('register-device', {
    deviceId: deviceAId,
    tenantId: tenantA.id,
    type: provisionA.device.type,
    status: provisionA.device.status,
    oneTimeProvisioningTokenReturned: true,
    pairingCodeReturned: Boolean(provisionA.pairingCode),
  });
  attach(
    'runtimeFlow',
    'register-device',
    registerArtifact,
    'Platform live provisioning created a PROVISIONING device and returned one-time pairing material; secret values are excluded.',
  );

  const deviceSecretOld = randomSecret('DeviceA');
  const pairA = (
    await apiRequest('POST', `/devices/${encodeURIComponent(deviceAId)}/pair`, {
      body: {
        token: provisionA.provisioningToken,
        password: deviceSecretOld,
      },
    })
  ).body;

  assert(pairA?.deviceId === deviceAId, 'Pair response device mismatch');
  assert(pairA?.tenantId === tenantA.id, 'Pair response tenant mismatch');

  const pairedRow = await prisma.device.findUnique({
    where: { id: deviceAId },
    select: {
      status: true,
      provisioningTokenHash: true,
      credential: { select: { id: true } },
    },
  });
  assert(pairedRow?.status === 'PAIRED', 'Device did not persist PAIRED');
  assert(
    pairedRow.provisioningTokenHash === null,
    'One-time provisioning token was not consumed',
  );
  assert(Boolean(pairedRow.credential), 'Paired credential missing');

  const pairArtifact = writeArtifact('pair-device', {
    deviceId: deviceAId,
    tenantId: tenantA.id,
    persistedStatus: pairedRow.status,
    oneTimeTokenConsumed: pairedRow.provisioningTokenHash === null,
    credentialPersisted: Boolean(pairedRow.credential),
    mqttConfigurationReturned:
      Boolean(pairA?.mqttUri) && Boolean(pairA?.mqttUsername),
  });
  attach(
    'runtimeFlow',
    'pair-device',
    pairArtifact,
    'Live one-time pairing consumed the token, persisted hashed credentials, and returned broker configuration without exposing secrets.',
  );

  const capability = (
    await apiRequest(
      'POST',
      `/devices/${encodeURIComponent(deviceAId)}/capabilities`,
      {
        token: adminLogin.accessToken,
        tenantId: tenantA.id,
        body: {
          key: 'power',
          semanticType: 'switch',
          dataType: 'boolean',
          isReadable: true,
          isWritable: true,
          isReportable: true,
          schemaVersion: '1.0.0',
        },
      },
    )
  ).body;
  assert(capability?.id, 'Capability create response missing id');

  const capabilityArtifact = writeArtifact('register-capability', {
    deviceId: deviceAId,
    capabilityId: capability.id,
    key: capability.key,
    dataType: capability.dataType,
    isWritable: capability.isWritable,
    isReportable: capability.isReportable,
  });
  attach(
    'runtimeFlow',
    'register-capability',
    capabilityArtifact,
    'Tenant ADMIN registered a live writable/reportable boolean capability on the paired device.',
  );

  const heartbeatOld = await apiRequest(
    'PATCH',
    `/devices/${encodeURIComponent(deviceAId)}/heartbeat`,
    {
      headers: {
        'x-device-id': deviceAId,
        'x-device-secret': deviceSecretOld,
      },
      expected: [200],
    },
  );

  const activeRow = await prisma.device.findUnique({
    where: { id: deviceAId },
    select: { status: true, lastHeartbeatAt: true },
  });
  assert(activeRow?.status === 'ACTIVE', 'Heartbeat did not mark device ACTIVE');
  assert(activeRow.lastHeartbeatAt, 'Heartbeat timestamp missing');

  const heartbeatArtifact = writeArtifact('heartbeat-active', {
    deviceId: deviceAId,
    httpStatus: heartbeatOld.status,
    persistedStatus: activeRow.status,
    heartbeatTimestampPresent: Boolean(activeRow.lastHeartbeatAt),
  });
  attach(
    'runtimeFlow',
    'heartbeat-active',
    heartbeatArtifact,
    'Authenticated device heartbeat succeeded and persisted ACTIVE status with a heartbeat timestamp.',
  );

  const deviceSecret = randomSecret('DeviceA-Rotated');
  await apiRequest('PATCH', `/devices/${encodeURIComponent(deviceAId)}/rotate`, {
    headers: {
      'x-device-id': deviceAId,
      'x-device-secret': deviceSecretOld,
    },
    body: {
      oldSecret: deviceSecretOld,
      newSecret: deviceSecret,
    },
    expected: [200],
  });

  const oldSecretAttempt = await apiRequest(
    'PATCH',
    `/devices/${encodeURIComponent(deviceAId)}/heartbeat`,
    {
      headers: {
        'x-device-id': deviceAId,
        'x-device-secret': deviceSecretOld,
      },
      expected: [401],
    },
  );
  const newSecretAttempt = await apiRequest(
    'PATCH',
    `/devices/${encodeURIComponent(deviceAId)}/heartbeat`,
    {
      headers: {
        'x-device-id': deviceAId,
        'x-device-secret': deviceSecret,
      },
      expected: [200],
    },
  );

  const rotationArtifact = writeArtifact('credential-rotation-safety', {
    deviceId: deviceAId,
    oldCredentialHttpStatus: oldSecretAttempt.status,
    newCredentialHttpStatus: newSecretAttempt.status,
    oldCredentialRejected: oldSecretAttempt.status === 401,
    newCredentialAccepted: newSecretAttempt.status === 200,
  });
  attach(
    'runtimeFlow',
    'repair-rotation-safety',
    rotationArtifact,
    'Live credential rotation invalidated the old device secret and accepted only the newly rotated secret.',
  );

  const { client: deviceAClient } = await connectMqtt(
    deviceAId,
    deviceSecret,
    'device-a',
  );
  const deviceQueue = createMessageQueue(deviceAClient);

  const validAuthArtifact = writeArtifact('broker-device-valid-secret', {
    deviceId: deviceAId,
    connected: true,
    brokerHost: new URL(brokerUrl).host,
    protocolVersion: 5,
  });
  attach(
    'liveBroker',
    'device-valid-secret-allowed',
    validAuthArtifact,
    'Live EMQX accepted MQTT 5 CONNECT for the paired device using its current credential.',
  );

  const wrongSecretDenied = await expectMqttDenied(
    deviceAId,
    randomSecret('Wrong'),
    'device-wrong-secret',
  );
  assert(wrongSecretDenied, 'EMQX unexpectedly accepted a wrong device secret');

  const wrongAuthArtifact = writeArtifact('broker-device-wrong-secret', {
    deviceId: deviceAId,
    denied: true,
    brokerHost: new URL(brokerUrl).host,
  });
  attach(
    'liveBroker',
    'device-wrong-secret-denied',
    wrongAuthArtifact,
    'Live EMQX denied MQTT CONNECT for the same device when an incorrect secret was supplied.',
  );

  const commandTopicA = `tenants/${tenantA.id}/devices/${deviceAId}/commands`;
  const telemetryTopicA = `tenants/${tenantA.id}/devices/${deviceAId}/telemetry`;
  const ackTopicA = `tenants/${tenantA.id}/devices/${deviceAId}/commands/ack`;

  const commandGrant = await mqttSubscribe(deviceAClient, commandTopicA, 1);
  assert(
    commandGrant.some((item) => item.qos === 0 || item.qos === 1 || item.qos === 2),
    'Device command subscription was not granted',
  );

  const subscribeArtifact = writeArtifact('broker-device-command-subscribe', {
    deviceId: deviceAId,
    topic: commandTopicA,
    granted: true,
    grantedQos: commandGrant.map((item) => item.qos),
  });
  attach(
    'liveBroker',
    'device-command-subscribe-allowed',
    subscribeArtifact,
    'Live EMQX ACL granted the paired device subscription to only its canonical command topic.',
  );

  const publisherUsername = process.env.MQTT_USERNAME?.trim();
  const publisherPassword = process.env.MQTT_PASSWORD;
  assert(publisherUsername, 'MQTT_USERNAME missing for publisher evidence');
  assert(publisherPassword, 'MQTT_PASSWORD missing for publisher evidence');

  const { client: publisherClient } = await connectMqtt(
    publisherUsername,
    publisherPassword,
    'publisher',
  );

  const syntheticCommandId = `broker-smoke-${randomUUID()}`;
  await mqttPublish(
    publisherClient,
    commandTopicA,
    {
      commandId: syntheticCommandId,
      payload: { power: true },
    },
    1,
  );
  const syntheticReceived = await deviceQueue.waitFor(
    (message) =>
      message.topic === commandTopicA &&
      message.payload?.commandId === syntheticCommandId,
  );
  assert(
    syntheticReceived.payload?.payload?.power === true,
    'Device did not receive publisher command payload',
  );

  const publisherAllowedArtifact = writeArtifact(
    'broker-publisher-command-allowed',
    {
      topic: commandTopicA,
      commandId: syntheticCommandId,
      publisherConnected: true,
      deviceReceived: true,
      receivedPayload: syntheticReceived.payload?.payload,
    },
  );
  attach(
    'liveBroker',
    'publisher-command-publish-allowed',
    publisherAllowedArtifact,
    'Live API publisher credential published to the canonical command topic and the device subscription received the payload.',
  );

  brokerCheck('liveBroker.publisher-non-command-denied');
  const publisherSubscribeDenial = await expectSubscribeDeniedFresh(
    publisherUsername,
    publisherPassword,
    'publisher-negative-subscribe',
    telemetryTopicA,
  );

  const forbiddenPublisherEvent = `publisher-forbidden-${randomUUID()}`;
  const publisherPublishDenial = await expectPublishDeniedFresh(
    publisherUsername,
    publisherPassword,
    'publisher-negative-publish',
    telemetryTopicA,
    { eventId: forbiddenPublisherEvent, payload: { power: false } },
    1,
  );
  await sleep(1200);
  const forbiddenPublisherTelemetryCount = await prisma.telemetry.count({
    where: { deviceId: deviceAId, eventId: forbiddenPublisherEvent },
  });
  assert(
    forbiddenPublisherTelemetryCount === 0,
    'Publisher non-command publish reached the telemetry persistence path',
  );

  const publisherDeniedArtifact = writeArtifact(
    'broker-publisher-non-command-denied',
    {
      subscribeDenied: publisherSubscribeDenial.denied,
      subscribeDenialSignal: publisherSubscribeDenial.signal,
      subscribeDenialReasonCode: publisherSubscribeDenial.reasonCode,
      nonCommandPublishDenied: publisherPublishDenial.denied,
      publishDenialSignal: publisherPublishDenial.signal,
      publishDenialReasonCode: publisherPublishDenial.reasonCode,
      forbiddenTelemetryPersistedRows: forbiddenPublisherTelemetryCount,
    },
  );
  attach(
    'liveBroker',
    'publisher-non-command-operations-denied',
    publisherDeniedArtifact,
    'Fresh one-shot publisher connections received explicit broker denial signals for non-command subscribe/publish operations, and the forbidden telemetry event was not persisted.',
  );

  const eventId = `telemetry-${randomUUID()}`;
  const telemetryEnvelope = { eventId, payload: { power: true } };
  await mqttPublish(deviceAClient, telemetryTopicA, telemetryEnvelope, 1);

  const telemetryRow = await waitFor(
    () =>
      prisma.telemetry.findUnique({
        where: {
          deviceId_eventId: {
            deviceId: deviceAId,
            eventId,
          },
        },
      }),
    'telemetry webhook persistence',
  );

  const telemetryAllowedArtifact = writeArtifact(
    'broker-device-telemetry-allowed',
    {
      deviceId: deviceAId,
      tenantId: tenantA.id,
      eventId,
      persistedTelemetryId: telemetryRow.id,
      persistedPayload: telemetryRow.payload,
    },
  );
  attach(
    'liveBroker',
    'device-telemetry-publish-allowed',
    telemetryAllowedArtifact,
    'Paired device published telemetry through live EMQX and the configured webhook persisted the event.',
  );

  await mqttPublish(deviceAClient, telemetryTopicA, telemetryEnvelope, 1);
  await sleep(1000);

  const duplicateCount = await prisma.telemetry.count({
    where: { deviceId: deviceAId, eventId },
  });
  assert(
    duplicateCount === 1,
    `Expected exactly one telemetry row after duplicate eventId, found ${duplicateCount}`,
  );

  const latestTelemetry = await apiRequest(
    'GET',
    `/devices/${encodeURIComponent(deviceAId)}/telemetry/latest`,
    {
      token: adminLogin.accessToken,
      tenantId: tenantA.id,
      expected: [200],
    },
  );
  assert(
    latestTelemetry.body?.eventId === eventId,
    'Canonical latest telemetry endpoint did not return the live event',
  );

  const telemetryIdempotencyArtifact = writeArtifact(
    'telemetry-idempotency',
    {
      deviceId: deviceAId,
      eventId,
      duplicatePublishes: 2,
      persistedRows: duplicateCount,
      canonicalLatestEventId: latestTelemetry.body?.eventId,
      canonicalLatestPayload: latestTelemetry.body?.payload,
    },
  );
  attach(
    'runtimeFlow',
    'telemetry-idempotency',
    telemetryIdempotencyArtifact,
    'Two live broker publishes with the same eventId produced one persisted telemetry row and the canonical API returned that event.',
  );
  attach(
    'liveBroker',
    'telemetry-webhook-idempotent',
    telemetryIdempotencyArtifact,
    'Live EMQX telemetry webhook replayed the same eventId idempotently with exactly one persisted row.',
  );

  const layoutId = randomUUID();
  const widgetId = randomUUID();
  const dashboard = (
    await apiRequest('POST', '/dashboards', {
      token: adminLogin.accessToken,
      tenantId: tenantA.id,
      body: {
        name: `RESCUE Live Dashboard ${runId.slice(-8)}`,
        description: 'RESCUE-02B live telemetry evidence',
        schemaVersion: '1.0.0',
        audience: 'PERSONAL',
        layouts: [
          {
            id: layoutId,
            breakpoint: 'DESKTOP',
            columns: 12,
            rowHeight: 48,
            gap: 8,
          },
        ],
        widgets: [
          {
            id: widgetId,
            kind: 'GAUGE',
            title: 'Power live evidence',
            schemaVersion: '1.0.0',
          },
        ],
        layoutItems: [
          {
            id: randomUUID(),
            layoutId,
            widgetId,
            x: 0,
            y: 0,
            width: 4,
            height: 3,
          },
        ],
        bindings: [
          {
            id: randomUUID(),
            widgetId,
            alias: 'value',
            intent: 'READ',
            mode: 'LATEST',
            deviceId: deviceAId,
            capabilityId: capability.id,
          },
        ],
      },
    })
  ).body;

  assert(dashboard?.id, 'Dashboard create response missing id');

  const widgetData = (
    await apiRequest(
      'GET',
      `/dashboards/${encodeURIComponent(
        dashboard.id,
      )}/widgets/${encodeURIComponent(widgetId)}/data`,
      {
        token: adminLogin.accessToken,
        tenantId: tenantA.id,
        expected: [200],
      },
    )
  ).body;

  assert(widgetData?.state === 'READY', 'Live dashboard widget was not READY');
  assert(
    widgetData?.bindings?.some(
      (binding) =>
        binding?.state === 'READY' &&
        binding?.data?.value === true,
    ),
    'Live dashboard widget did not expose latest telemetry value',
  );

  const dashboardArtifact = writeArtifact('realtime-dashboard', {
    dashboardId: dashboard.id,
    widgetId,
    state: widgetData.state,
    bindings: widgetData.bindings,
  });
  attach(
    'runtimeFlow',
    'realtime-dashboard',
    dashboardArtifact,
    'Canonical dashboard widget data resolved READY from telemetry that arrived through the live broker/webhook path.',
  );

  const commandIdempotencyKey = `rr26-live-${randomUUID()}`;
  const commandResponse = (
    await apiRequest(
      'POST',
      `/devices/${encodeURIComponent(deviceAId)}/commands`,
      {
        token: adminLogin.accessToken,
        tenantId: tenantA.id,
        body: {
          payload: { power: false },
          idempotencyKey: commandIdempotencyKey,
        },
      },
    )
  ).body;

  assert(
    typeof commandResponse?.correlationId === 'string',
    'Command response missing correlationId',
  );

  const commandMessage = await deviceQueue.waitFor(
    (message) =>
      message.topic === commandTopicA &&
      message.payload?.commandId === commandResponse.correlationId,
  );
  assert(
    commandMessage.payload?.payload?.power === false,
    'Live command payload did not reach device subscription',
  );

  const commandArtifact = writeArtifact('command-publish-path', {
    deviceId: deviceAId,
    commandRecordId: commandResponse.id,
    correlationId: commandResponse.correlationId,
    returnedStatus: commandResponse.status,
    deviceReceived: true,
    brokerTopic: commandTopicA,
    payload: commandMessage.payload?.payload,
  });
  attach(
    'runtimeFlow',
    'command-publish-path',
    commandArtifact,
    'Canonical command API persisted the command, API publisher sent it through live EMQX, and the device subscription received the matching correlationId.',
  );

  brokerCheck('liveBroker.cross-device-tenant-topic-denied');
  const provisionB = (
    await apiRequest('POST', '/admin/platform-devices', {
      token: platformLogin.accessToken,
      tenantId: platform.tenantId,
      body: {
        tenantId: tenantB.id,
        name: `RESCUE Evidence Device B ${runId.slice(-8)}`,
        type: 'ACTUATOR',
      },
    })
  ).body;
  const deviceBId = provisionB?.device?.id;
  assert(deviceBId, 'Second device provisioning failed');
  const deviceBSecret = randomSecret('DeviceB');
  await apiRequest('POST', `/devices/${encodeURIComponent(deviceBId)}/pair`, {
    body: {
      token: provisionB.provisioningToken,
      password: deviceBSecret,
    },
  });

  const crossCommandTopic = `tenants/${tenantB.id}/devices/${deviceBId}/commands`;
  const crossTelemetryTopic = `tenants/${tenantB.id}/devices/${deviceBId}/telemetry`;

  const crossSubscribeDenial = await expectSubscribeDeniedFresh(
    deviceAId,
    deviceSecret,
    'cross-device-subscribe',
    crossCommandTopic,
  );

  const crossEventId = `cross-${randomUUID()}`;
  const crossPublishDenial = await expectPublishDeniedFresh(
    deviceAId,
    deviceSecret,
    'cross-device-publish',
    crossTelemetryTopic,
    { eventId: crossEventId, payload: { power: true } },
    1,
  );
  await sleep(1200);
  const crossPersisted = await prisma.telemetry.count({
    where: { deviceId: deviceBId, eventId: crossEventId },
  });
  assert(
    crossPersisted === 0,
    'Cross-device telemetry publish reached the target persistence path',
  );

  const crossArtifact = writeArtifact('broker-cross-device-tenant-denied', {
    sourceDeviceId: deviceAId,
    targetDeviceId: deviceBId,
    sourceTenantId: tenantA.id,
    targetTenantId: tenantB.id,
    commandSubscribeDenied: crossSubscribeDenial.denied,
    commandSubscribeDenialSignal: crossSubscribeDenial.signal,
    commandSubscribeDenialReasonCode: crossSubscribeDenial.reasonCode,
    telemetryPublishDenied: crossPublishDenial.denied,
    telemetryPublishDenialSignal: crossPublishDenial.signal,
    telemetryPublishDenialReasonCode: crossPublishDenial.reasonCode,
    targetTelemetryPersistedRows: crossPersisted,
  });
  attach(
    'liveBroker',
    'cross-device-tenant-topic-denied',
    crossArtifact,
    'Live EMQX denied a device from another tenant/device command subscription and did not persist its cross-device telemetry attempt.',
  );

  brokerCheck('liveBroker.ack-device-binding-and-replay');
  const commandBeforeWrongAck = await prisma.deviceCommand.findUnique({
    where: { id: commandResponse.id },
    select: { status: true, acknowledgedAt: true },
  });

  const wrongAckDenial = await expectPublishDeniedFresh(
    deviceBId,
    deviceBSecret,
    'wrong-device-ack-publish',
    ackTopicA,
    {
      commandId: commandResponse.correlationId,
      status: 'ACK',
    },
    1,
  );
  await sleep(900);

  const commandAfterWrongAck = await prisma.deviceCommand.findUnique({
    where: { id: commandResponse.id },
    select: { status: true, acknowledgedAt: true },
  });
  assert(
    commandAfterWrongAck.status === commandBeforeWrongAck.status &&
      commandAfterWrongAck.acknowledgedAt?.getTime?.() ===
        commandBeforeWrongAck.acknowledgedAt?.getTime?.(),
    'Wrong-device ACK changed the command state',
  );

  await mqttPublish(
    deviceAClient,
    ackTopicA,
    {
      commandId: commandResponse.correlationId,
      status: 'ACK',
    },
    1,
  );

  const acknowledged = await waitFor(
    () =>
      prisma.deviceCommand.findUnique({
        where: { id: commandResponse.id },
        select: {
          status: true,
          acknowledgedAt: true,
          correlationId: true,
          deviceId: true,
        },
      }).then((row) =>
        row?.status === 'ACKNOWLEDGED' && row.acknowledgedAt ? row : null,
      ),
    'ACK persistence',
  );

  await mqttPublish(
    deviceAClient,
    ackTopicA,
    {
      commandId: commandResponse.correlationId,
      status: 'ACK',
    },
    1,
  );
  await sleep(800);

  const acknowledgedReplay = await prisma.deviceCommand.findUnique({
    where: { id: commandResponse.id },
    select: {
      status: true,
      acknowledgedAt: true,
      correlationId: true,
      deviceId: true,
    },
  });
  assert(
    acknowledgedReplay.status === 'ACKNOWLEDGED',
    'ACK replay regressed terminal command status',
  );
  assert(
    acknowledgedReplay.acknowledgedAt?.getTime() ===
      acknowledged.acknowledgedAt?.getTime(),
    'ACK replay changed the original acknowledgedAt timestamp',
  );

  const ackArtifact = writeArtifact('ack-correlation-replay', {
    commandId: commandResponse.id,
    correlationId: commandResponse.correlationId,
    deviceId: deviceAId,
    wrongDeviceAckDenied: wrongAckDenial.denied,
    wrongDeviceAckDenialSignal: wrongAckDenial.signal,
    wrongDeviceAckDenialReasonCode: wrongAckDenial.reasonCode,
    wrongDeviceAckDidNotChangeState: true,
    matchingDeviceAckStatus: acknowledged.status,
    identicalReplayStatus: acknowledgedReplay.status,
    acknowledgedTimestampStable: true,
  });
  attach(
    'liveBroker',
    'device-ack-publish-allowed',
    ackArtifact,
    'Live device ACK publish reached the EMQX webhook and settled the persisted command.',
  );
  attach(
    'liveBroker',
    'ack-bound-to-matching-device-command',
    ackArtifact,
    'Wrong-device ACK did not change command state; the matching device ACK settled the exact correlationId.',
  );
  attach(
    'runtimeFlow',
    'ack-correlation-and-replay',
    ackArtifact,
    'Matching live ACK resolved the command and an identical QoS-1 ACK replay preserved the same terminal state/timestamp.',
  );

  const history = (
    await apiRequest(
      'GET',
      `/devices/${encodeURIComponent(deviceAId)}/commands?limit=50&offset=0`,
      {
        token: adminLogin.accessToken,
        tenantId: tenantA.id,
        expected: [200],
      },
    )
  ).body;

  const historyRows = Array.isArray(history)
    ? history
    : Array.isArray(history?.items)
      ? history.items
      : [];
  const historyMatch = historyRows.find(
    (row) => row.correlationId === commandResponse.correlationId,
  );
  assert(historyMatch, 'Canonical command history did not contain live command');
  assert(
    historyMatch.status === 'ACKNOWLEDGED',
    'Command history did not reflect ACKNOWLEDGED',
  );

  const historyArtifact = writeArtifact('command-history', {
    deviceId: deviceAId,
    correlationId: commandResponse.correlationId,
    foundInCanonicalHistory: true,
    status: historyMatch.status,
    payload: historyMatch.payload,
  });
  attach(
    'runtimeFlow',
    'command-history',
    historyArtifact,
    'Canonical tenant/device command history returned the live command with its ACKNOWLEDGED status and capability payload.',
  );

  brokerCheck('liveBroker.wrong-webhook-secret-denied');
  const wrongWebhook = await apiRequest('POST', '/mqtt/webhook/telemetry', {
    headers: {
      'x-webhook-secret': `wrong-${randomBytes(16).toString('hex')}`,
    },
    body: {
      topic: telemetryTopicA,
      eventId: `wrong-secret-${randomUUID()}`,
      payload: { power: true },
    },
    expected: [401, 403],
  });

  const wrongWebhookArtifact = writeArtifact('wrong-webhook-secret', {
    endpoint: '/mqtt/webhook/telemetry',
    httpStatus: wrongWebhook.status,
    denied: true,
  });
  attach(
    'liveBroker',
    'wrong-webhook-secret-denied',
    wrongWebhookArtifact,
    'Telemetry webhook rejected a request carrying an intentionally incorrect webhook secret.',
  );

  brokerCheck('liveBroker.revoked-device-denied');
  const provisionRevoked = (
    await apiRequest('POST', '/admin/platform-devices', {
      token: platformLogin.accessToken,
      tenantId: platform.tenantId,
      body: {
        tenantId: tenantA.id,
        name: `RESCUE Revoked Device ${runId.slice(-8)}`,
        type: 'SENSOR',
      },
    })
  ).body;
  const revokedDeviceId = provisionRevoked?.device?.id;
  assert(revokedDeviceId, 'Revocation test device provisioning failed');
  const revokedSecret = randomSecret('Revoked');
  await apiRequest(
    'POST',
    `/devices/${encodeURIComponent(revokedDeviceId)}/pair`,
    {
      body: {
        token: provisionRevoked.provisioningToken,
        password: revokedSecret,
      },
    },
  );

  const preRevokeConnect = await connectMqtt(
    revokedDeviceId,
    revokedSecret,
    'pre-revoke',
  );
  await endMqtt(preRevokeConnect.client);

  await apiRequest(
    'PATCH',
    `/devices/${encodeURIComponent(revokedDeviceId)}/revoke`,
    {
      token: adminLogin.accessToken,
      tenantId: tenantA.id,
      expected: [200],
    },
  );

  const revokedDenied = await expectMqttDenied(
    revokedDeviceId,
    revokedSecret,
    'revoked-device',
  );
  assert(revokedDenied, 'Revoked device was still allowed to connect');

  const revokedArtifact = writeArtifact('broker-revoked-device-denied', {
    deviceId: revokedDeviceId,
    connectedBeforeRevoke: true,
    deniedAfterRevoke: true,
  });
  attach(
    'liveBroker',
    'revoked-device-denied',
    revokedArtifact,
    'A live paired device connected before revocation and EMQX denied the same credential after API revocation.',
  );

  // Explicit publisher non-command check already proved publisher ACL; direct
  // device ACL checks above prove telemetry/ACK/command subscribe/cross-device.

  await endMqtt(deviceAClient);
  await endMqtt(publisherClient);

  if (evidenceMode) {
    const currentEvidence = loadEvidence();
    const remainingRuntime = currentEvidence.runtimeFlow.checks
      .filter((item) => item.status !== 'PASS')
      .map((item) => item.id);
    const remainingBroker = currentEvidence.liveBroker.checks
      .filter((item) => item.status !== 'PASS')
      .map((item) => item.id);
    const remainingHardware = currentEvidence.physicalEsp32.checks
      .filter((item) => item.status !== 'PASS')
      .map((item) => item.id);

    const summaryArtifact = writeArtifact('live-broker-summary', {
      emqxVersion,
      runtimeFlowPassed:
        currentEvidence.runtimeFlow.checks.length - remainingRuntime.length,
      runtimeFlowTotal: currentEvidence.runtimeFlow.checks.length,
      liveBrokerPassed:
        currentEvidence.liveBroker.checks.length - remainingBroker.length,
      liveBrokerTotal: currentEvidence.liveBroker.checks.length,
      physicalEsp32Passed:
        currentEvidence.physicalEsp32.checks.length - remainingHardware.length,
      physicalEsp32Total: currentEvidence.physicalEsp32.checks.length,
      remainingRuntime,
      remainingBroker,
      remainingHardware,
    });

    console.log('');
    console.log('LIVE BROKER EVIDENCE PHASE COMPLETE');
    console.log(`ARTIFACTS  ${artifactDir}`);
    console.log(`SUMMARY    ${summaryArtifact}`);
    console.log(
      `RUNTIME    ${
        currentEvidence.runtimeFlow.checks.length - remainingRuntime.length
      }/${currentEvidence.runtimeFlow.checks.length} PASS`,
    );
    console.log(
      `BROKER     ${
        currentEvidence.liveBroker.checks.length - remainingBroker.length
      }/${currentEvidence.liveBroker.checks.length} PASS`,
    );
    console.log(`REMAIN runtimeFlow: ${remainingRuntime.join(', ') || 'none'}`);
    console.log(`REMAIN liveBroker: ${remainingBroker.join(', ') || 'none'}`);
    console.log(
      `HARDWARE remains separate: ${remainingHardware.join(', ') || 'none'}`,
    );
  } else {
    const summaryArtifact = writeArtifact('live-broker-summary', {
      emqxVersion,
      status: 'PASS',
      mode: 'ci-smoke',
      broker: `${new URL(brokerUrl).protocol}//${new URL(brokerUrl).host}`,
      note: 'Real EMQX auth, ACL, telemetry webhook/idempotency, command and ACK checks completed without evidence-file mutation.',
    });
    console.log('');
    console.log('LIVE BROKER CI SMOKE COMPLETE');
    console.log(`ARTIFACTS  ${artifactDir}`);
    console.log(`SUMMARY    ${summaryArtifact}`);
  }
}

main()
  .catch((error) => {
    console.error(`FAIL  ${error?.message ?? error}`);
    console.error(
      evidenceMode
        ? 'INFO  Any rows already attached before the failure remain valid evidence; rerun after fixing the concrete blocker.'
        : 'INFO  CI smoke failed on the first concrete live assertion; inspect reports and container logs.',
    );
    process.exitCode = error?.exitCode ?? 1;
  })
  .finally(async () => {
    await closeActiveMqttClients();
    try {
      await prisma.$disconnect();
    } catch {
      // best effort
    }
  });
