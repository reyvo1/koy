#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import tls from 'node:tls';

const argv = process.argv.slice(2);
const args = new Set(argv);
const strict = args.has('--strict');
const probeScopeArg = argv.find((value) => value.startsWith('--probe-scope='));
const probeScope = probeScopeArg ? probeScopeArg.slice('--probe-scope='.length) : args.has('--probe') ? 'full' : 'none';
if (!['none', 'infra', 'full'].includes(probeScope)) {
  console.error(`FAIL: unsupported --probe-scope=${probeScope}; expected infra or full.`);
  process.exit(1);
}
const probe = probeScope !== 'none';
const jsonOutput = args.has('--json');
const requireContainerRuntime = args.has('--require-container-runtime');
const envArg = argv.find((value) => value.startsWith('--env='));
const envPath = path.resolve(envArg ? envArg.slice('--env='.length) : '.env');
const rows = [];
const probeTimeoutMs = 1800;

function add(name, state, detail) {
  rows.push({ name, state, detail });
}

function commandVersion(command, versionArgs = ['--version']) {
  const result = spawnSync(command, versionArgs, {
    encoding: 'utf8',
    windowsHide: true,
    shell: process.platform === 'win32' && /\.(?:cmd|bat)$/i.test(command),
  });
  if (result.error || result.status !== 0) return null;
  return (result.stdout || result.stderr || '').trim().split(/\r?\n/)[0] || 'available';
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

function looksPlaceholder(value) {
  if (!value) return true;
  return /change_me|replace_with|example\.com|password@localhost/i.test(value);
}

function dependencyInstallState() {
  const nodeModules = path.resolve('node_modules');
  const hiddenLock = path.join(nodeModules, '.package-lock.json');
  const criticalPackages = ['typescript', 'jest', 'prisma', '@nestjs/cli', 'next', 'expo'];
  const missingCritical = criticalPackages.filter(
    (packageName) => !existsSync(path.join(nodeModules, ...packageName.split('/'), 'package.json')),
  );

  if (!existsSync(nodeModules)) {
    return { state: 'MISSING', missingCritical };
  }
  if (!existsSync(hiddenLock) || missingCritical.length > 0) {
    return { state: 'PARTIAL', missingCritical };
  }
  return { state: 'READY', missingCritical: [] };
}

function resolveTcpTarget(value, fallbackHost, fallbackPort, protocolPorts = {}) {
  if (!value) return { host: fallbackHost, port: fallbackPort, protocol: null };
  try {
    const parsed = new URL(value);
    const protocol = parsed.protocol.replace(':', '');
    const port = parsed.port ? Number(parsed.port) : (protocolPorts[protocol] ?? fallbackPort);
    return { host: parsed.hostname || fallbackHost, port, protocol };
  } catch {
    return { host: fallbackHost, port: fallbackPort, protocol: null };
  }
}

function createTransport({ host, port, tlsEnabled = false }) {
  if (tlsEnabled) {
    return tls.connect({ host, port, servername: net.isIP(host) ? undefined : host });
  }
  return net.createConnection({ host, port });
}

function withSocketProbe(name, target, onConnect, onData) {
  return new Promise((resolve) => {
    const socket = createTransport(target);
    let settled = false;
    const finish = (state, detail) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      add(name, state, detail);
      resolve();
    };

    socket.setTimeout(probeTimeoutMs);
    socket.once('connect', () => {
      try {
        onConnect(socket, finish);
      } catch (error) {
        finish('FAIL', error?.message ?? 'probe write failed');
      }
    });
    socket.on('data', (chunk) => {
      try {
        onData(chunk, finish);
      } catch (error) {
        finish('FAIL', error?.message ?? 'invalid protocol response');
      }
    });
    socket.once('timeout', () => finish('FAIL', `${target.host}:${target.port} timed out`));
    socket.once('error', (error) =>
      finish('FAIL', `${target.host}:${target.port} ${error.code ?? error.message}`),
    );
    socket.once('secureConnect', () => {
      // tls.connect also emits connect; no action needed beyond certificate validation.
    });
  });
}

async function probePostgresProtocol(target) {
  const request = Buffer.alloc(8);
  request.writeInt32BE(8, 0);
  request.writeInt32BE(80877103, 4);
  let buffered = Buffer.alloc(0);
  await withSocketProbe(
    'PostgreSQL protocol',
    { ...target, tlsEnabled: false },
    (socket) => socket.write(request),
    (chunk, finish) => {
      buffered = Buffer.concat([buffered, chunk]);
      if (buffered.length < 1) return;
      const response = String.fromCharCode(buffered[0]);
      if (response === 'S' || response === 'N') {
        finish('PASS', `${target.host}:${target.port} PostgreSQL SSL negotiation responded ${response}`);
      } else {
        finish('FAIL', `${target.host}:${target.port} unexpected PostgreSQL negotiation byte 0x${buffered[0].toString(16)}`);
      }
    },
  );
}

function respCommand(parts) {
  return `${`*${parts.length}\r\n`}${parts.map((part) => `$${Buffer.byteLength(String(part))}\r\n${part}\r\n`).join('')}`;
}

async function probeRedisProtocol(redisUrl, fallbackHost, fallbackPort) {
  let parsed = null;
  try {
    parsed = redisUrl ? new URL(redisUrl) : null;
  } catch {
    // Preserve fallback target, but report malformed URL explicitly below.
  }
  if (redisUrl && !parsed) {
    add('Redis protocol', 'FAIL', 'REDIS_URL is not a valid URL');
    return;
  }
  const protocol = parsed?.protocol?.replace(':', '') ?? 'redis';
  if (!['redis', 'rediss'].includes(protocol)) {
    add('Redis protocol', 'FAIL', `unsupported Redis protocol ${protocol}`);
    return;
  }
  const host = parsed?.hostname || fallbackHost;
  const port = parsed?.port ? Number(parsed.port) : protocol === 'rediss' ? 6380 : fallbackPort;
  const username = parsed?.username ? decodeURIComponent(parsed.username) : '';
  const password = parsed?.password ? decodeURIComponent(parsed.password) : '';
  const commands = [];
  if (password) commands.push(username ? respCommand(['AUTH', username, password]) : respCommand(['AUTH', password]));
  commands.push(respCommand(['PING']));
  let text = '';
  await withSocketProbe(
    'Redis protocol',
    { host, port, tlsEnabled: protocol === 'rediss' },
    (socket) => socket.write(commands.join('')),
    (chunk, finish) => {
      text += chunk.toString('utf8');
      if (/\+PONG\r\n/.test(text)) {
        finish('PASS', `${host}:${port} PING=PONG${protocol === 'rediss' ? ' over TLS' : ''}`);
      } else if (/(?:-ERR|-NOAUTH|-WRONGPASS)/i.test(text)) {
        const firstError = text.split(/\r?\n/).find((line) => line.startsWith('-')) ?? 'Redis rejected probe';
        finish('FAIL', `${host}:${port} ${firstError.slice(0, 160)}`);
      }
    },
  );
}

function mqttUtf8(value) {
  const body = Buffer.from(String(value), 'utf8');
  const prefix = Buffer.alloc(2);
  prefix.writeUInt16BE(body.length, 0);
  return Buffer.concat([prefix, body]);
}

function encodeMqttRemainingLength(value) {
  const bytes = [];
  let remaining = value;
  do {
    let encodedByte = remaining % 128;
    remaining = Math.floor(remaining / 128);
    if (remaining > 0) encodedByte |= 0x80;
    bytes.push(encodedByte);
  } while (remaining > 0);
  return Buffer.from(bytes);
}

function mqttConnectPacket(username, password, clientId = `rescue-${process.pid}`) {
  const protocolName = mqttUtf8('MQTT');
  const variableHeader = Buffer.concat([
    protocolName,
    Buffer.from([0x04]),
    Buffer.from([0x02 | 0x80 | 0x40]),
    Buffer.from([0x00, 0x1e]),
  ]);
  const payload = Buffer.concat([
    mqttUtf8(clientId),
    mqttUtf8(username),
    mqttUtf8(password),
  ]);
  const remaining = variableHeader.length + payload.length;
  return Buffer.concat([Buffer.from([0x10]), encodeMqttRemainingLength(remaining), variableHeader, payload]);
}

async function probeMqttConnectExpectation(
  name,
  mqttUrl,
  username,
  password,
  fallbackPort,
  expectAccepted,
) {
  let parsed;
  try {
    parsed = new URL(mqttUrl);
  } catch {
    add(name, 'FAIL', 'MQTT_BROKER_URL is not a valid URL');
    return;
  }
  const protocol = parsed.protocol.replace(':', '');
  if (!['mqtt', 'mqtts'].includes(protocol)) {
    add(name, 'FAIL', `unsupported MQTT protocol ${protocol}`);
    return;
  }
  if (!username || looksPlaceholder(username) || !password || looksPlaceholder(password)) {
    add(name, 'FAIL', 'configured non-placeholder MQTT_USERNAME/MQTT_PASSWORD required for protocol probe');
    return;
  }
  const host = parsed.hostname;
  const port = parsed.port ? Number(parsed.port) : protocol === 'mqtts' ? 8883 : fallbackPort;
  const clientId = `rescue-${expectAccepted ? 'valid' : 'negative'}-${process.pid}-${randomBytes(4).toString('hex')}`;
  const packet = mqttConnectPacket(username, password, clientId);
  let buffered = Buffer.alloc(0);
  await withSocketProbe(
    name,
    { host, port, tlsEnabled: protocol === 'mqtts' },
    (socket) => socket.write(packet),
    (chunk, finish) => {
      buffered = Buffer.concat([buffered, chunk]);
      if (buffered.length < 4) return;
      if (buffered[0] !== 0x20 || buffered[1] !== 0x02) {
        finish('FAIL', `${host}:${port} invalid MQTT CONNACK frame`);
        return;
      }
      const returnCode = buffered[3];
      const reasons = {
        0: 'accepted',
        1: 'unacceptable protocol version',
        2: 'identifier rejected',
        3: 'server unavailable',
        4: 'bad username/password',
        5: 'not authorized',
      };
      if (expectAccepted) {
        if (returnCode === 0) {
          finish('PASS', `${host}:${port} MQTT 3.1.1 CONNECT accepted`);
        } else {
          finish('FAIL', `${host}:${port} MQTT CONNACK=${returnCode} (${reasons[returnCode] ?? 'unknown'})`);
        }
        return;
      }

      if (returnCode === 4 || returnCode === 5) {
        finish('PASS', `${host}:${port} wrong-secret CONNECT rejected (${reasons[returnCode]})`);
      } else if (returnCode === 0) {
        finish('FAIL', `${host}:${port} SECURITY: wrong-secret MQTT CONNECT was accepted`);
      } else {
        finish('FAIL', `${host}:${port} unexpected negative-auth CONNACK=${returnCode} (${reasons[returnCode] ?? 'unknown'})`);
      }
    },
  );
}

async function probeMqttProtocol(mqttUrl, username, password, fallbackPort) {
  await probeMqttConnectExpectation(
    'MQTT CONNECT/auth',
    mqttUrl,
    username,
    password,
    fallbackPort,
    true,
  );
}

async function probeMqttWrongSecretRejection(mqttUrl, username, fallbackPort) {
  const wrongPassword = `wrong-${randomBytes(24).toString('base64url')}`;
  await probeMqttConnectExpectation(
    'MQTT wrong-secret rejection',
    mqttUrl,
    username,
    wrongPassword,
    fallbackPort,
    false,
  );
}

async function probeEmqxDashboard(env) {
  const base = env.EMQX_API_URL ?? `http://127.0.0.1:${Number(env.EMQX_DASHBOARD_PORT ?? 18083)}`;
  let url;
  try {
    url = new URL('/api/v5/login', base);
  } catch {
    add('EMQX Dashboard login', 'FAIL', 'EMQX_API_URL is not a valid URL');
    return;
  }
  const username = String(env.EMQX_DASHBOARD_USERNAME ?? '').trim();
  const password = env.EMQX_DASHBOARD_PASSWORD;
  if (!username || !password || looksPlaceholder(password)) {
    add('EMQX Dashboard login', 'FAIL', 'configured dashboard username and non-placeholder password required');
    return;
  }
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password }),
      signal: AbortSignal.timeout(probeTimeoutMs),
    });
    if (!response.ok) {
      add('EMQX Dashboard login', 'FAIL', `${url.origin} login HTTP ${response.status}`);
      return;
    }
    const body = await response.json().catch(() => null);
    if (typeof body?.token !== 'string' || body.token.length === 0) {
      add('EMQX Dashboard login', 'FAIL', `${url.origin} login response missing bearer token`);
      return;
    }
    add('EMQX Dashboard login', 'PASS', `${url.origin} authenticated`);
  } catch (error) {
    add('EMQX Dashboard login', 'FAIL', `${url.origin} ${error?.cause?.code ?? error?.name ?? error?.message ?? 'request failed'}`);
  }
}

/**
 * Is the media runtime up.
 *
 * Reported as a distinct row rather than folded into the API's own readiness, because "the media
 * runtime is down" and "the platform is down" have different remedies and an operator reading a
 * single green light has no way to tell which one they are looking at.
 *
 * Only in the `full` scope: the media runtime is optional for the core platform, so gating `infra` on
 * it would fail every database-and-broker-only run for a service those runs never use.
 */
async function probeMediaRuntime(env) {
  const raw = env.GO2RTC_URL ?? 'http://127.0.0.1:8189';
  let url;
  try {
    url = new URL(raw);
  } catch {
    add('media runtime /api', 'FAIL', 'GO2RTC_URL is not a valid URL');
    return;
  }
  if (['0.0.0.0', '::'].includes(url.hostname)) url.hostname = '127.0.0.1';
  const target = `${url.origin}/api`;
  try {
    const response = await fetch(target, { signal: AbortSignal.timeout(probeTimeoutMs) });
    if (!response.ok) {
      add('media runtime /api', 'FAIL', `HTTP ${response.status} from ${target}`);
      return;
    }
    const body = await response.json().catch(() => null);
    // A version is what distinguishes a runtime that answered from a proxy that returned 200.
    if (typeof body?.version === 'string' && body.version.length > 0) {
      add('media runtime /api', 'PASS', `go2rtc ${body.version} at ${url.origin}`);
      return;
    }
    add('media runtime /api', 'FAIL', `${target} responded 200 with no version field`);
  } catch (cause) {
    add(
      'media runtime /api',
      'FAIL',
      `${target} unreachable: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }
}

async function probeApiReadiness(env) {
  const fallbackHost = env.API_PROBE_HOST ?? '127.0.0.1';
  const host = ['0.0.0.0', '::'].includes(fallbackHost) ? '127.0.0.1' : fallbackHost;
  const defaultUrl = `http://${host}:${Number(env.PORT ?? 3000)}/health/ready`;
  let url;
  try {
    url = new URL(env.API_PROBE_URL ?? defaultUrl);
  } catch {
    add('API /health/ready', 'FAIL', 'API_PROBE_URL is not a valid URL');
    return;
  }
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(probeTimeoutMs) });
    const body = await response.json().catch(() => null);
    const statuses = body?.checks
      ? Object.entries(body.checks)
          .map(([name, value]) => `${name}=${value?.status ?? 'unknown'}`)
          .join(', ')
      : null;
    if (response.status === 200 && body?.status === 'ready') {
      add('API /health/ready', 'PASS', `${url.origin} ready${statuses ? ` (${statuses})` : ''}`);
      return;
    }
    add(
      'API /health/ready',
      'FAIL',
      `${url.origin} HTTP ${response.status}; status=${body?.status ?? 'unknown'}${statuses ? ` (${statuses})` : ''}`,
    );
  } catch (error) {
    add('API /health/ready', 'FAIL', `${url.origin} ${error?.cause?.code ?? error?.name ?? error?.message ?? 'request failed'}`);
  }
}

const nodeMajor = Number(process.versions.node.split('.')[0]);
add('Node.js', nodeMajor === 22 ? 'PASS' : 'FAIL', process.version);
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npmVersion = commandVersion(npmCommand);
add(
  'npm',
  npmVersion && Number(npmVersion.split('.')[0]) === 10 ? 'PASS' : 'FAIL',
  npmVersion ?? 'not found',
);

const dockerVersion = commandVersion('docker');
const podmanVersion = commandVersion('podman');
const containerDetail = dockerVersion
  ? `docker ${dockerVersion}`
  : podmanVersion
    ? `podman ${podmanVersion}`
    : requireContainerRuntime
      ? 'docker/podman not found; required by --require-container-runtime'
      : 'docker/podman not found; acceptable when external/managed runtime services are used';
add(
  'Container runtime',
  dockerVersion || podmanVersion ? 'PASS' : requireContainerRuntime ? 'FAIL' : 'INFO',
  containerDetail,
);

const dependencies = dependencyInstallState();
add(
  'Installed dependencies',
  dependencies.state === 'READY' ? 'PASS' : 'FAIL',
  dependencies.state === 'READY'
    ? 'dependency doctor boundary satisfied: hidden npm lock + critical tool packages present'
    : dependencies.state === 'PARTIAL'
      ? `partial/incomplete node_modules${dependencies.missingCritical.length ? `; missing critical: ${dependencies.missingCritical.join(', ')}` : ''}`
      : 'node_modules not installed; run npm ci and require rescue:bootstrap:doctor READY',
);

const env = { ...parseEnv(envPath), ...process.env };
if (!existsSync(envPath)) {
  add('Environment file', 'WARN', `${envPath} not found; process environment only`);
} else {
  add('Environment file', 'PASS', envPath);
}

const schedulerRuntimeEnabled =
  String(env.SCHEDULER_RUNTIME_ENABLED ?? '').trim().toLowerCase() === 'true';
add(
  'env:SCHEDULER_RUNTIME_ENABLED',
  schedulerRuntimeEnabled ? 'PASS' : 'FAIL',
  schedulerRuntimeEnabled ? 'enabled' : 'must be true for schedule acceptance',
);

const automationRuntimeEnabled =
  String(env.AUTOMATION_RUNTIME_ENABLED ?? '').trim().toLowerCase() === 'true';
add(
  'env:AUTOMATION_RUNTIME_ENABLED',
  automationRuntimeEnabled ? 'PASS' : 'FAIL',
  automationRuntimeEnabled
    ? 'enabled'
    : 'must be true for automation runtime acceptance',
);

const schedulerClaimTimeoutMs = Number(env.SCHEDULER_CLAIM_TIMEOUT_MS ?? 300_000);
const schedulerClaimTimeoutValid =
  Number.isInteger(schedulerClaimTimeoutMs) &&
  schedulerClaimTimeoutMs >= 60_000 &&
  schedulerClaimTimeoutMs <= 3_600_000;
add(
  'env:SCHEDULER_CLAIM_TIMEOUT_MS',
  schedulerClaimTimeoutValid ? 'PASS' : 'FAIL',
  schedulerClaimTimeoutValid
    ? `${schedulerClaimTimeoutMs} ms`
    : 'must be an integer between 60000 and 3600000',
);

for (const key of [
  'DATABASE_URL',
  'REDIS_URL',
  'MQTT_BROKER_URL',
  'MQTT_USERNAME',
  'MQTT_PASSWORD',
  'MQTT_WEBHOOK_SECRET',
  'JWT_SECRET',
  'EMQX_DASHBOARD_PASSWORD',
]) {
  const value = env[key];
  add(
    `env:${key}`,
    value && !looksPlaceholder(value) ? 'PASS' : 'FAIL',
    !value ? 'missing' : looksPlaceholder(value) ? 'placeholder value' : 'configured',
  );
}

add(
  'env:EMQX_DASHBOARD_USERNAME',
  String(env.EMQX_DASHBOARD_USERNAME ?? '').trim() ? 'PASS' : 'FAIL',
  String(env.EMQX_DASHBOARD_USERNAME ?? '').trim() ? 'configured' : 'missing',
);

if (probe) {
  const databaseTarget = resolveTcpTarget(
    env.DATABASE_URL,
    '127.0.0.1',
    Number(env.POSTGRES_PORT ?? 5432),
    { postgresql: 5432, postgres: 5432 },
  );
  await probePostgresProtocol(databaseTarget);
  await probeRedisProtocol(env.REDIS_URL, '127.0.0.1', Number(env.REDIS_PORT ?? 6379));
  await probeEmqxDashboard(env);

  if (probeScope === 'full') {
    const mqttProbeFallbackPort = Number(
      env.RESCUE_MQTT_HOST_PORT ?? env.MQTT_PORT ?? 1883,
    );
    const mqttProbeUrl =
      env.RESCUE_MQTT_BROKER_URL ??
      env.MQTT_BROKER_URL ??
      `mqtt://127.0.0.1:${mqttProbeFallbackPort}`;
    await probeMqttProtocol(
      mqttProbeUrl,
      env.MQTT_USERNAME,
      env.MQTT_PASSWORD,
      mqttProbeFallbackPort,
    );
    await probeMqttWrongSecretRejection(
      mqttProbeUrl,
      env.MQTT_USERNAME,
      mqttProbeFallbackPort,
    );
    await probeApiReadiness(env);
    await probeMediaRuntime(env);
  }
}

const failures = rows.filter((row) => row.state === 'FAIL');
const runtimeReport = {
  schemaVersion: 2,
  generatedAt: new Date().toISOString(),
  environmentFile: envPath,
  strict,
  probe,
  probeScope,
  containerRuntimeRequired: requireContainerRuntime,
  ready: failures.length === 0,
  blockerCount: failures.length,
  blockers: failures.map((row) => ({ name: row.name, detail: row.detail })),
  rows,
};

if (jsonOutput) {
  console.log(JSON.stringify(runtimeReport));
} else {
  const widths = {
    name: Math.max('Check'.length, ...rows.map((row) => row.name.length)),
    state: Math.max('State'.length, ...rows.map((row) => row.state.length)),
  };
  console.log(`${'Check'.padEnd(widths.name)}  ${'State'.padEnd(widths.state)}  Detail`);
  console.log(`${'-'.repeat(widths.name)}  ${'-'.repeat(widths.state)}  ${'-'.repeat(40)}`);
  for (const row of rows) {
    console.log(`${row.name.padEnd(widths.name)}  ${row.state.padEnd(widths.state)}  ${row.detail}`);
  }
  console.log(`\nResult: ${failures.length === 0 ? 'READY FOR NEXT RUNTIME STEP' : `${failures.length} blocker(s) detected`}`);
}
if (strict && failures.length > 0) process.exitCode = 1;
