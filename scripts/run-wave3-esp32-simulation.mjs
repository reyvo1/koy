#!/usr/bin/env node
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:https';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { CommandDedupeCache, OtaSlotModel, downloadAndVerifyHttps } from './lib/wave3-sim-core.mjs';
import { mqttPublishBounded, mqttSubscribeBounded } from './lib/rescue-mqtt-operations.mjs';

const argv = process.argv.slice(2);
const arg = (name) => argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const projectRoot = path.resolve(arg('project') ?? process.cwd());
const envPath = path.resolve(projectRoot, arg('env') ?? '.env');
const firmwarePath = path.resolve(projectRoot, arg('firmware') ?? process.env.WAVE3_FIRMWARE_ARTIFACT ?? 'artifacts/wave3-esp32/iot_sdk_wave3_test_app.bin');

function fail(message) { throw new Error(message); }
function assert(condition, message) { if (!condition) fail(message); }
function parseEnv(file) {
  const output = {};
  if (!existsSync(file)) return output;
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index <= 0) continue;
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    output[line.slice(0, index).trim()] = value;
  }
  return output;
}
function randomSecret(prefix) { return `${prefix}-${randomBytes(24).toString('base64url')}`; }
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function waitFor(fn, label, timeoutMs = 12_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try { const value = await fn(); if (value) return value; } catch (error) { lastError = error; }
    await sleep(200);
  }
  fail(`${label} timed out${lastError ? `: ${lastError.message}` : ''}`);
}
function normalizeApiBase(env) {
  if (env.RESCUE_API_BASE_URL?.trim()) return env.RESCUE_API_BASE_URL.trim().replace(/\/$/, '');
  if (env.API_PROBE_URL?.trim()) { const parsed = new URL(env.API_PROBE_URL); return `${parsed.protocol}//${parsed.host}`; }
  return `http://127.0.0.1:${env.PORT?.trim() || '3000'}`;
}
function normalizeBrokerUrl(env) {
  if (env.RESCUE_MQTT_BROKER_URL?.trim()) return env.RESCUE_MQTT_BROKER_URL.trim();
  const port = env.RESCUE_MQTT_HOST_PORT?.trim() || '18884';
  return `mqtt://127.0.0.1:${port}`;
}
async function readBody(response) { const text = await response.text(); if (!text) return null; try { return JSON.parse(text); } catch { return text; } }
async function apiRequest(apiBase, method, pathname, { token, tenantId, body, headers = {}, expected = [200, 201] } = {}) {
  const requestHeaders = { accept: 'application/json', ...headers };
  if (body !== undefined) requestHeaders['content-type'] = 'application/json';
  if (token) requestHeaders.authorization = `Bearer ${token}`;
  if (tenantId) requestHeaders['x-tenant-id'] = tenantId;
  const response = await fetch(`${apiBase}${pathname}`, {
    method,
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(12_000),
  });
  const responseBody = await readBody(response);
  if (!expected.includes(response.status)) fail(`${method} ${pathname} expected ${expected.join('/')}, got ${response.status}: ${JSON.stringify(responseBody).slice(0, 500)}`);
  return { status: response.status, body: responseBody };
}

const fileEnv = parseEnv(envPath);
for (const [key, value] of Object.entries(fileEnv)) if (process.env[key] === undefined) process.env[key] = value;
assert(existsSync(envPath), `environment file missing: ${envPath}`);
assert(existsSync(firmwarePath), `Wave 3 firmware artifact missing: ${firmwarePath}`);
const manifestResult = spawnSync(process.execPath, ['scripts/manage-baseline-manifest.mjs', 'verify'], { cwd: projectRoot, stdio: 'inherit', env: process.env });
assert(manifestResult.status === 0, 'sealed source verification failed before Wave 3 simulation');

const require = createRequire(path.join(projectRoot, 'package.json'));
const { PrismaClient } = require('@prisma/client');
const argon2 = require('argon2');
const mqtt = require('mqtt');
const prisma = new PrismaClient();
const activeClients = new Set();
const apiBase = normalizeApiBase({ ...fileEnv, ...process.env });
const brokerUrl = normalizeBrokerUrl({ ...fileEnv, ...process.env });
const runId = `wave3-${Date.now()}-${randomUUID().slice(0, 8)}`;
const reportDir = path.join(projectRoot, 'reports', 'wave3');
mkdirSync(reportDir, { recursive: true });

async function connectMqtt(username, password, label) {
  return await new Promise((resolve, reject) => {
    const client = mqtt.connect(brokerUrl, {
      username, password, clientId: `${label}-${randomUUID()}`, protocolVersion: 5,
      clean: true, reconnectPeriod: 0, connectTimeout: 8_000, keepalive: 20,
    });
    const timer = setTimeout(() => { client.end(true); reject(new Error(`${label} MQTT connect timeout`)); }, 10_000);
    client.once('connect', () => { clearTimeout(timer); activeClients.add(client); resolve(client); });
    client.once('error', (error) => { clearTimeout(timer); client.end(true); reject(error); });
  });
}
async function endMqtt(client) {
  if (!client) return;
  activeClients.delete(client);
  await new Promise((resolve) => {
    let settled = false;
    const finish = () => { if (settled) return; settled = true; clearTimeout(timer); resolve(); };
    const timer = setTimeout(finish, 750);
    try { client.end(true, {}, finish); } catch { finish(); }
  });
}

class SimulatedEsp32 {
  constructor({ tenantId, deviceId, secret }) {
    this.tenantId = tenantId;
    this.deviceId = deviceId;
    this.secret = secret;
    this.commandTopic = `tenants/${tenantId}/devices/${deviceId}/commands`;
    this.ackTopic = `tenants/${tenantId}/devices/${deviceId}/commands/ack`;
    this.telemetryTopic = `tenants/${tenantId}/devices/${deviceId}/telemetry`;
    this.cache = new CommandDedupeCache(8);
    this.executions = 0;
    this.replays = 0;
    this.processed = new Map();
    this.client = null;
    this.lastError = null;
  }

  async connect(label = 'wave3-device') {
    this.client = await connectMqtt(this.deviceId, this.secret, label);
    this.client.on('message', (topic, payload) => {
      void this.onMessage(topic, payload).catch((error) => { this.lastError = error; });
    });
    await mqttSubscribeBounded(this.client, this.commandTopic, 1, 8_000);
  }

  async disconnect() { await endMqtt(this.client); this.client = null; }

  async onMessage(topic, payloadBuffer) {
    if (topic !== this.commandTopic) return;
    let envelope;
    try { envelope = JSON.parse(payloadBuffer.toString('utf8')); } catch { return; }
    const commandId = envelope?.commandId;
    if (!commandId) return;
    const seen = this.cache.observe(commandId);
    if (seen.duplicate) {
      this.replays += 1;
      await mqttPublishBounded(this.client, this.ackTopic, { commandId, status: seen.success ? 'ACK' : 'FAILED', reason: seen.reason }, 1, 8_000);
      this.processed.set(`${commandId}:replay`, true);
      return;
    }
    this.executions += 1;
    const result = this.cache.record(commandId, true, 'simulated-actuator-applied');
    await mqttPublishBounded(this.client, this.ackTopic, { commandId, status: result.success ? 'ACK' : 'FAILED', reason: result.reason }, 1, 8_000);
    this.processed.set(commandId, true);
  }

  async publishTelemetry(power, eventId = `wave3-telemetry-${randomUUID()}`) {
    await mqttPublishBounded(this.client, this.telemetryTopic, { eventId, payload: { power } }, 1, 8_000);
    return eventId;
  }
}

async function main() {
  console.log(`INFO  Wave 3 API ${apiBase}`);
  console.log(`INFO  Wave 3 MQTT ${brokerUrl}`);
  await prisma.$connect();

  const platformTenantId = randomUUID();
  const platformEmail = `${runId}@platform.sim.iot.test`;
  const platformPassword = randomSecret('Platform');
  await prisma.tenant.create({ data: { id: platformTenantId, name: `Wave3 Platform ${runId}` } });
  await prisma.user.create({
    data: {
      email: platformEmail, name: 'Wave 3 Sim Platform Admin', tenantId: platformTenantId, isVerified: true,
      credential: { create: { passwordHash: await argon2.hash(platformPassword) } },
      memberships: { create: { tenantId: platformTenantId, role: 'PLATFORM_ADMIN', status: 'ACTIVE' } },
    },
  });

  const platformLogin = (await apiRequest(apiBase, 'POST', '/auth/login', { body: { email: platformEmail, password: platformPassword, tenantId: platformTenantId } })).body;
  assert(platformLogin?.role === 'PLATFORM_ADMIN' && platformLogin?.accessToken, 'platform admin login failed');

  const tenant = (await apiRequest(apiBase, 'POST', '/admin/tenants', { token: platformLogin.accessToken, tenantId: platformTenantId, body: { name: `Wave3 Tenant ${runId}` } })).body;
  assert(tenant?.id, 'tenant creation failed');
  const adminEmail = `${runId}@tenant.sim.iot.test`;
  const adminPassword = randomSecret('TenantAdmin');
  await apiRequest(apiBase, 'POST', '/admin/platform-users', {
    token: platformLogin.accessToken, tenantId: platformTenantId,
    body: { tenantId: tenant.id, email: adminEmail, name: 'Wave 3 Tenant Admin', password: adminPassword, role: 'ADMIN' },
  });
  const adminLogin = (await apiRequest(apiBase, 'POST', '/auth/login', { body: { email: adminEmail, password: adminPassword, tenantId: tenant.id } })).body;
  assert(adminLogin?.role === 'ADMIN' && adminLogin?.accessToken, 'tenant admin login failed');

  const provision = (await apiRequest(apiBase, 'POST', '/admin/platform-devices', {
    token: platformLogin.accessToken, tenantId: platformTenantId,
    body: { tenantId: tenant.id, name: `Wave3 ESP32 ${runId}`, type: 'ACTUATOR' },
  })).body;
  const deviceId = provision?.device?.id;
  assert(deviceId && provision?.provisioningToken, 'device provisioning failed');
  const deviceSecret = randomSecret('Esp32Sim');
  const pair = (await apiRequest(apiBase, 'POST', `/devices/${encodeURIComponent(deviceId)}/pair`, {
    body: { token: provision.provisioningToken, password: deviceSecret },
  })).body;
  assert(pair?.deviceId === deviceId && pair?.tenantId === tenant.id, 'device pairing failed');

  await apiRequest(apiBase, 'POST', `/devices/${encodeURIComponent(deviceId)}/capabilities`, {
    token: adminLogin.accessToken, tenantId: tenant.id,
    body: { key: 'power', semanticType: 'switch', dataType: 'boolean', isReadable: true, isWritable: true, isReportable: true, schemaVersion: '1.0.0' },
  });
  await apiRequest(apiBase, 'PATCH', `/devices/${encodeURIComponent(deviceId)}/heartbeat`, {
    headers: { 'x-device-id': deviceId, 'x-device-secret': deviceSecret }, expected: [200],
  });

  let device = new SimulatedEsp32({ tenantId: tenant.id, deviceId, secret: deviceSecret });
  await device.connect();
  const firstEvent = await device.publishTelemetry(true);
  await waitFor(() => prisma.telemetry.findUnique({ where: { deviceId_eventId: { deviceId, eventId: firstEvent } } }), 'initial simulated telemetry persistence');

  await device.disconnect();
  await sleep(300);
  await device.connect('wave3-device-reconnect');
  await apiRequest(apiBase, 'PATCH', `/devices/${encodeURIComponent(deviceId)}/heartbeat`, {
    headers: { 'x-device-id': deviceId, 'x-device-secret': deviceSecret }, expected: [200],
  });
  const reconnectEvent = await device.publishTelemetry(false);
  await waitFor(() => prisma.telemetry.findUnique({ where: { deviceId_eventId: { deviceId, eventId: reconnectEvent } } }), 'post-reconnect telemetry persistence');

  // QoS 1 is at-least-once. A physical device reconnect can replay the same telemetry packet, so
  // UAT must prove that the server-side eventId contract turns the replay into one persisted row.
  const duplicateEvent = `wave3-duplicate-${randomUUID()}`;
  await device.publishTelemetry(true, duplicateEvent);
  await waitFor(() => prisma.telemetry.findUnique({ where: { deviceId_eventId: { deviceId, eventId: duplicateEvent } } }), 'first QoS1 telemetry persistence');
  await device.publishTelemetry(false, duplicateEvent);
  await sleep(500);
  const duplicateCount = await prisma.telemetry.count({ where: { deviceId, eventId: duplicateEvent } });
  assert(duplicateCount === 1, `duplicate telemetry replay persisted ${duplicateCount} rows instead of one`);

  // A Wi-Fi reconnect keeps process memory; a power cycle does not. Recreate the simulator object
  // with only the provisioned identity/secret and prove the device can rejoin, heartbeat and report
  // telemetry after a cold boot just as a real ESP32 would after power loss.
  await device.disconnect();
  device = new SimulatedEsp32({ tenantId: tenant.id, deviceId, secret: deviceSecret });
  await device.connect('wave3-device-cold-boot');
  await apiRequest(apiBase, 'PATCH', `/devices/${encodeURIComponent(deviceId)}/heartbeat`, {
    headers: { 'x-device-id': deviceId, 'x-device-secret': deviceSecret }, expected: [200],
  });
  const coldBootEvent = await device.publishTelemetry(true);
  await waitFor(() => prisma.telemetry.findUnique({ where: { deviceId_eventId: { deviceId, eventId: coldBootEvent } } }), 'cold-boot telemetry persistence');

  const command = (await apiRequest(apiBase, 'POST', `/devices/${encodeURIComponent(deviceId)}/commands`, {
    token: adminLogin.accessToken, tenantId: tenant.id,
    body: { payload: { power: true }, idempotencyKey: `wave3-command-${randomUUID()}` },
  })).body;
  assert(command?.correlationId, 'command API did not return correlationId');
  await waitFor(() => { if (device.lastError) throw device.lastError; return device.processed.get(command.correlationId); }, 'simulated command execution');
  const acked = await waitFor(async () => {
    const row = await prisma.deviceCommand.findUnique({ where: { id: command.id } });
    return row?.status === 'ACKNOWLEDGED' ? row : null;
  }, 'simulated command ACK persistence');

  const publisherUser = process.env.MQTT_USERNAME?.trim();
  const publisherPassword = process.env.MQTT_PASSWORD;
  assert(publisherUser && publisherPassword, 'MQTT publisher credentials missing');
  const publisher = await connectMqtt(publisherUser, publisherPassword, 'wave3-publisher');
  await mqttPublishBounded(publisher, device.commandTopic, { commandId: command.correlationId, payload: { power: true } }, 1, 8_000);
  await waitFor(() => { if (device.lastError) throw device.lastError; return device.processed.get(`${command.correlationId}:replay`); }, 'duplicate command ACK replay');
  assert(device.executions === 1 && device.replays >= 1, 'duplicate command caused actuator re-execution');
  const ackedAfterReplay = await prisma.deviceCommand.findUnique({ where: { id: command.id } });
  assert(ackedAfterReplay?.status === acked.status, 'duplicate ACK regressed command status');
  await endMqtt(publisher);

  const firmware = readFileSync(firmwarePath);
  assert(firmware.length > 0 && firmware[0] === 0xe9, 'Wave 3 firmware artifact is not an ESP app image (missing 0xE9 image magic)');
  const firmwareSha256 = createHash('sha256').update(firmware).digest('hex');
  const cert = readFileSync(path.join(projectRoot, 'test/fixtures/wave2-localhost-tls.cert.pem'));
  const key = readFileSync(path.join(projectRoot, 'test/fixtures/wave2-localhost-tls.key.pem'));
  const otaServer = createServer({ cert, key }, (req, res) => {
    if (req.url === '/firmware.bin') {
      res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': firmware.length });
      res.end(firmware); return;
    }
    if (req.url === '/interrupted.bin') {
      res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': firmware.length });
      res.write(firmware.subarray(0, Math.max(1, Math.floor(firmware.length / 3))));
      res.destroy(); return;
    }
    res.writeHead(404).end();
  });
  await new Promise((resolve, reject) => { otaServer.once('error', reject); otaServer.listen(0, '127.0.0.1', resolve); });

  const slotModel = new OtaSlotModel('A');
  try {
    const address = otaServer.address();
    const base = `https://127.0.0.1:${address.port}`;
    const good = await downloadAndVerifyHttps(`${base}/firmware.bin`, firmwareSha256, { ca: cert, timeoutMs: 15_000 });
    assert(good.bytes === firmware.length && good.sha256 === firmwareSha256, 'firmware artifact verification mismatch');
    slotModel.stageVerified('B');
    slotModel.rebootIntoStaged();
    slotModel.rebootWithoutConfirmation();
    assert(slotModel.active === 'A', 'simulated failed first boot did not roll back');
    slotModel.stageVerified('B');
    slotModel.rebootIntoStaged();
    slotModel.confirmLiveReconnect();
    assert(slotModel.active === 'B' && !slotModel.pendingVerify, 'simulated live reconnect did not confirm OTA slot');

    let badDigestRejected = false;
    try { await downloadAndVerifyHttps(`${base}/firmware.bin`, '0'.repeat(64), { ca: cert }); } catch (error) { badDigestRejected = error.message === 'OTA_SHA256_MISMATCH'; }
    assert(badDigestRejected, 'wrong OTA digest was not rejected');

    let interruptedRejected = false;
    try { await downloadAndVerifyHttps(`${base}/interrupted.bin`, firmwareSha256, { ca: cert }); } catch (error) { interruptedRejected = /OTA_(STREAM|NETWORK)/.test(error.message); }
    assert(interruptedRejected, 'interrupted OTA stream was not rejected');
  } finally {
    await new Promise((resolve) => otaServer.close(resolve));
  }

  await device.disconnect();

  const report = {
    schemaVersion: 1,
    gate: 'ENTERPRISE_WAVE_3',
    classification: 'SIMULATED_HARDWARE_LIVE_SERVICE',
    runId,
    observedAt: new Date().toISOString(),
    device: { deviceId, tenantId: tenant.id, provisioning: 'PASS', heartbeat: 'PASS', wifiMqttReconnect: 'PASS', coldBootRejoin: 'PASS' },
    mqtt: { initialTelemetry: 'PASS', postReconnectTelemetry: 'PASS', coldBootTelemetry: 'PASS', qos1DuplicateTelemetryDedupe: 'PASS', commandAck: 'PASS', duplicateCommandExecutionCount: device.executions, duplicateAckReplays: device.replays },
    ota: { artifactPath: path.relative(projectRoot, firmwarePath).replace(/\\/g, '/'), artifactBytes: firmware.length, artifactSha256: firmwareSha256, trustedHttps: 'PASS', wrongDigestRejected: 'PASS', interruptedStreamRejected: 'PASS', rollbackModel: 'PASS', liveReconnectConfirmationModel: 'PASS' },
    boundary: 'SIMULATED-HARDWARE / LIVE-SERVICE evidence closes automated software UAT; any later physical/site test is a separately labelled field-validation class and does not block software wave progression.',
  };
  const reportPath = path.join(reportDir, `wave3-esp32-simulation-${runId}.json`);
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`PASS  Wave 3 simulated ESP32 provisioning/reconnect/cold-boot/QoS1-dedupe/command/OTA flow`);
  console.log(`REPORT  ${reportPath}`);
}

main()
  .catch((error) => { console.error(`FAIL  ${error.message ?? error}`); process.exitCode = 1; })
  .finally(async () => {
    await Promise.allSettled([...activeClients].map((client) => endMqtt(client)));
    try { await prisma.$disconnect(); } catch {}
  });
