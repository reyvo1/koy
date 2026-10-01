#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import net from 'node:net';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  resolveRescueMqttBrokerUrl,
  resolveRescueMqttHostPort,
  withLocalRescueNetworkEnv,
} from './rescue-local-network.mjs';

const root = path.resolve(import.meta.dirname, '..');
const runtimeRoot = path.resolve(root, 'reports/local-runtime');
const statePath = path.join(runtimeRoot, 'state.json');

function sha256File(file) {
  if (!existsSync(file)) return null;
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function sealedSourceFingerprint() {
  return {
    packageLockSha256: sha256File(path.resolve(root, 'package-lock.json')),
    baselineManifestSha256: sha256File(path.resolve(root, 'BASELINE-MANIFEST.sha256')),
    repositoryTreeSha256: sha256File(path.resolve(root, 'repository-tree.txt')),
  };
}

export const LOCAL_RUNTIME_STAGES = Object.freeze([
  'validate source/runtime prerequisites',
  'start PostgreSQL/Redis/EMQX local infrastructure',
  'wait for protocol-valid PostgreSQL/Redis/EMQX Dashboard readiness',
  'build the rescue API container image with Node 22/npm 10',
  'start the API container; its entrypoint applies committed Prisma migrations before API startup',
  'wait for API liveness then configure EMQX HTTP auth + source-validated telemetry/ACK webhooks over the Compose network',
  'wait for full PostgreSQL/Redis/MQTT/EMQX/API readiness',
]);

export function parseEnv(file) {
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

export function apiHealthUrls(env) {
  const configured = env.API_PROBE_URL?.trim();
  if (configured) {
    const ready = new URL(configured);
    return {
      live: new URL('/health/live', ready.origin).toString(),
      ready: ready.toString(),
    };
  }
  const configuredHost = String(env.HOST ?? '127.0.0.1').trim();
  const host = ['0.0.0.0', '::', '[::]'].includes(configuredHost)
    ? '127.0.0.1'
    : configuredHost;
  const port = Number(env.PORT ?? 3000);
  return {
    live: `http://${host}:${port}/health/live`,
    ready: `http://${host}:${port}/health/ready`,
  };
}

function fail(message, code = 1) {
  const error = new Error(message);
  error.exitCode = code;
  throw error;
}

function commandResult(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    shell: process.platform === 'win32' && /\.(?:cmd|bat)$/i.test(command),
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  });
}

function formatCommand(command, args) {
  return [command, ...args].join(' ');
}

function runChecked(label, command, args, options = {}) {
  console.log(`RUN   ${label}: ${formatCommand(command, args)}`);
  const result = commandResult(command, args, options);
  if (result.status !== 0 || result.error) {
    const detail = (result.stderr || result.stdout || result.error?.message || '').trim();
    fail(`${label} failed${detail ? `: ${detail.slice(-3000)}` : ''}`);
  }
  return result;
}

function processAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readState() {
  if (!existsSync(statePath)) return null;
  try {
    return JSON.parse(readFileSync(statePath, 'utf8'));
  } catch {
    return null;
  }
}

function writeState(state) {
  mkdirSync(runtimeRoot, { recursive: true });
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
}

function composeRuntime() {
  const docker = commandResult('docker', ['compose', 'version']);
  if (!docker.error && docker.status === 0) {
    return { command: 'docker', prefix: ['compose'] };
  }
  const podman = commandResult('podman', ['compose', 'version']);
  if (!podman.error && podman.status === 0) {
    return { command: 'podman', prefix: ['compose'] };
  }
  return null;
}

function composeArgs(runtime, actionArgs) {
  return [...runtime.prefix, '-f', 'docker-compose.rescue.yml', ...actionArgs];
}

function runtimeCheckArgs(envPath, scope, requireContainerRuntime = true) {
  const args = [
    'scripts/check-rescue-runtime.mjs',
    '--strict',
    '--json',
    `--env=${envPath}`,
  ];
  if (requireContainerRuntime) args.push('--require-container-runtime');
  if (scope !== 'none') args.push(`--probe-scope=${scope}`);
  return args;
}

function runRuntimeCheck(
  envPath,
  scope,
  requireContainerRuntime = true,
  executionEnv = process.env,
) {
  const result = commandResult(
    process.execPath,
    runtimeCheckArgs(envPath, scope, requireContainerRuntime),
    { env: executionEnv },
  );
  let body = null;
  try {
    body = JSON.parse(result.stdout ?? '');
  } catch {
    // The caller reports malformed checker output as a blocker.
  }
  return { result, body };
}

async function waitForRuntimeScope(envPath, scope, timeoutMs, executionEnv = process.env) {
  const startedAt = Date.now();
  let latest = null;
  while (Date.now() - startedAt < timeoutMs) {
    latest = runRuntimeCheck(envPath, scope, true, executionEnv);
    if (latest.result.status === 0 && latest.body?.ready === true) {
      console.log(`PASS  ${scope} protocol readiness`);
      return latest.body;
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  const blockers = latest?.body?.blockers ?? [];
  const summary = blockers
    .map((item) => `${item.name}: ${item.detail}`)
    .join('; ')
    .slice(0, 3000);
  fail(`${scope} protocol readiness timed out${summary ? `: ${summary}` : ''}`);
}

async function waitForHttp(url, expectedStatus, timeoutMs) {
  const startedAt = Date.now();
  let latest = 'no response';
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1800) });
      latest = `HTTP ${response.status}`;
      if (response.status === expectedStatus) return;
    } catch (error) {
      latest = error?.cause?.code ?? error?.name ?? error?.message ?? 'request failed';
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  fail(`Timed out waiting for ${url}; last result: ${latest}`);
}


async function stopPid(pid, timeoutMs = 8000) {
  if (!processAlive(pid)) return;
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    return;
  }
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (!processAlive(pid)) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  try {
    process.kill(pid, 'SIGKILL');
  } catch {
    // Process already stopped.
  }
}

async function assertTcpPortAvailable(host, port, label) {
  const inUse = await new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(600);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
  if (inUse) {
    fail(
      `${label} ${host}:${port} is already in use. Choose a free RESCUE_MQTT_HOST_PORT; do not stop or reuse an unrelated broker just to satisfy the rescue runtime.`,
    );
  }
}

function assertLocalEnv(envPath) {
  if (!existsSync(envPath)) {
    fail(`Environment file not found: ${envPath}. Run npm run rescue:env:init first.`);
  }
  const example = path.resolve(root, 'ops/env/rescue-local.env.example');
  if (path.resolve(envPath) === example) {
    fail('Refusing to use the placeholder rescue-local.env.example as a runnable local environment. Initialize a real gitignored .env first.');
  }
}

function plan() {
  console.log('RESCUE-02B local runtime plan (does not prove runtime acceptance):');
  LOCAL_RUNTIME_STAGES.forEach((stage, index) => console.log(`${index + 1}. ${stage}`));
  console.log('8. stop here with webhook configuration present but live broker delivery/ACL/idempotency evidence still explicitly pending');
}

async function up({ envPath, timeoutMs, keepOnFailure }) {
  assertLocalEnv(envPath);
  const stale = readState();
  if (stale?.apiPid && processAlive(stale.apiPid)) {
    fail(`A tracked legacy host API process is still running with pid ${stale.apiPid}. Run rescue:local:down first.`);
  }
  if (stale && stale.status !== 'NOT_TRACKED') {
    fail('A local runtime state record already exists. Run rescue:local:recover after an interruption/crash, or rescue:local:down before a deliberate clean restart.');
  }

  // For local-compose execution, the selected .env is authoritative over the
  // caller shell. This avoids stale Windows environment variables overriding
  // the generated rescue credentials.
  const executionEnv = withLocalRescueNetworkEnv({
    ...process.env,
    ...parseEnv(envPath),
  });
  const mqttHostPort = resolveRescueMqttHostPort(executionEnv);
  const mqttHostUrl = resolveRescueMqttBrokerUrl(executionEnv);
  const brokerExecutionEnv = {
    ...executionEnv,
    // EMQX and API share the default Compose network. Never route broker
    // callbacks through the Windows/Podman host boundary.
    IOT_API_FROM_EMQX: 'http://api:3000',
  };
  const compose = composeRuntime();
  if (!compose) fail('docker compose or podman compose is required for rescue:local:up.');

  runChecked('rescue source validator', process.execPath, ['scripts/validate-rescue-baseline.mjs'], { env: executionEnv });
  runChecked('baseline manifest verifier', process.execPath, ['scripts/manage-baseline-manifest.mjs', 'verify'], { env: executionEnv });
  runChecked('lifecycle validator', process.execPath, ['scripts/manage-module-state.mjs', 'validate'], { env: executionEnv });
  const sourceFingerprint = sealedSourceFingerprint();

  const preflight = runRuntimeCheck(envPath, 'none', true, executionEnv);
  if (preflight.result.status !== 0 || preflight.body?.ready !== true) {
    const blockers = preflight.body?.blockers ?? [];
    fail(`Local preflight blocked: ${blockers.map((item) => `${item.name}: ${item.detail}`).join('; ')}`);
  }

  let composeStarted = false;
  let apiStarted = false;
  const startedAt = new Date().toISOString();
  await assertTcpPortAvailable('127.0.0.1', mqttHostPort, 'Rescue MQTT host port');
  try {
    runChecked(
      'local infrastructure start',
      compose.command,
      // go2rtc is named explicitly for the same reason postgres/redis/emqx are: the whole point of
      // listing services is that `up` with no arguments would also start anything added later
      // without anyone deciding to. The media runtime is in the `full` gate, so it belongs here.
      composeArgs(compose, ['up', '-d', 'postgres', 'redis', 'emqx', 'go2rtc']),
      { env: executionEnv },
    );
    composeStarted = true;
    writeState({
      schemaVersion: 3,
      status: 'INFRA_STARTING',
      sourceFingerprint,
      apiMode: 'compose',
      apiService: 'api',
      mqttHostPort,
      mqttHostUrl,
      envPath,
      composeCommand: compose.command,
      startedAt,
    });
    await waitForRuntimeScope(envPath, 'infra', timeoutMs, executionEnv);

    runChecked(
      'rescue API image build',
      compose.command,
      composeArgs(compose, ['build', 'api']),
      { env: executionEnv },
    );
    runChecked(
      'rescue API container start (Prisma migrate deploy -> API)',
      compose.command,
      composeArgs(compose, ['up', '-d', 'api']),
      { env: executionEnv },
    );
    apiStarted = true;
    writeState({
      schemaVersion: 3,
      status: 'API_CONTAINER_STARTING',
      sourceFingerprint,
      apiMode: 'compose',
      apiService: 'api',
      mqttHostPort,
      mqttHostUrl,
      envPath,
      composeCommand: compose.command,
      startedAt,
    });

    const urls = apiHealthUrls(executionEnv);
    await waitForHttp(urls.live, 200, timeoutMs);
    console.log(`PASS  API liveness ${urls.live}`);

    runChecked('EMQX HTTP authentication configuration', process.execPath, [
      'scripts/configure-emqx-http-auth.mjs',
      `--env=${envPath}`,
    ], { env: brokerExecutionEnv });

    runChecked('EMQX telemetry/ACK webhook configuration', process.execPath, [
      'scripts/configure-emqx-webhooks.mjs',
      `--env=${envPath}`,
    ], { env: brokerExecutionEnv });

    await waitForRuntimeScope(envPath, 'full', timeoutMs, executionEnv);
    writeState({
      schemaVersion: 3,
      status: 'CORE_RUNTIME_READY_LIVE_BROKER_EVIDENCE_PENDING',
      sourceFingerprint,
      apiMode: 'compose',
      apiService: 'api',
      mqttHostPort,
      mqttHostUrl,
      envPath,
      composeCommand: compose.command,
      startedAt,
      readyAt: new Date().toISOString(),
    });
    console.log('PASS  Local core runtime is protocol-ready.');
    console.log('PASS  EMQX -> API auth/webhook traffic stays on the internal Compose service network (http://api:3000).');
    console.log('BOUNDARY  Telemetry/ACK webhook configuration is present, but live publish/idempotency/ACK/negative-path broker evidence is still required before RESCUE-02B.');
    console.log(`LOG   ${compose.command} ${composeArgs(compose, ['logs', '--tail=120', 'api']).join(' ')}`);
  } catch (error) {
    if (apiStarted) {
      const logs = commandResult(compose.command, composeArgs(compose, ['logs', '--no-color', '--tail=120', 'api']), { env: executionEnv });
      const detail = (logs.stdout || logs.stderr || '').trim();
      if (detail) console.error(`API-LOG\n${detail.slice(-6000)}`);
    }
    if (!keepOnFailure) {
      console.error('ROLLBACK  Bring-up failed; stopping local compose stack.');
      if (composeStarted) {
        commandResult(compose.command, composeArgs(compose, ['down']), { env: executionEnv });
      }
      rmSync(statePath, { force: true });
    } else {
      writeState({
        schemaVersion: 3,
        status: 'FAILED_DEBUG_RESOURCES_KEPT',
        sourceFingerprint,
        apiMode: 'compose',
        apiService: 'api',
        mqttHostPort,
        mqttHostUrl,
        envPath,
        composeCommand: compose.command,
        startedAt,
        failedAt: new Date().toISOString(),
        failure: String(error?.message ?? error),
      });
      console.error('WARN  --keep-on-failure requested; local runtime resources were not rolled back.');
    }
    throw error;
  }
}

async function down({ envPath, removeVolumes }) {
  const state = readState();
  const selectedEnv = state?.envPath && existsSync(state.envPath) ? state.envPath : envPath;
  const executionEnv = withLocalRescueNetworkEnv({
    ...process.env,
    ...parseEnv(selectedEnv),
  });
  if (state?.apiPid) {
    await stopPid(state.apiPid);
    console.log(`PASS  API process stopped (pid ${state.apiPid}).`);
  } else {
    console.log('INFO  No legacy host API process found.');
  }

  const compose = composeRuntime();
  if (!compose) {
    fail('docker/podman compose is unavailable; infrastructure stop cannot be confirmed. The runtime state file was retained for recovery.');
  }
  const args = ['down'];
  if (removeVolumes) args.push('--volumes');
  runChecked('local infrastructure stop', compose.command, composeArgs(compose, args), {
    env: executionEnv,
  });
  rmSync(statePath, { force: true });
  console.log(removeVolumes
    ? 'PASS  Local runtime stopped and named rescue volumes were explicitly removed.'
    : 'PASS  Local runtime stopped; named rescue volumes were preserved.');
}

async function recover({ envPath, timeoutMs, keepOnFailure }) {
  assertLocalEnv(envPath);
  const state = readState();
  const sourceFingerprint = sealedSourceFingerprint();
  const executionEnv = withLocalRescueNetworkEnv({
    ...process.env,
    ...parseEnv(envPath),
  });

  if (state?.status === 'CORE_RUNTIME_READY_LIVE_BROKER_EVIDENCE_PENDING') {
    const trackedEnvPath = state.envPath ? path.resolve(state.envPath) : null;
    const sameEnv = trackedEnvPath && (
      process.platform === 'win32'
        ? trackedEnvPath.toLowerCase() === envPath.toLowerCase()
        : trackedEnvPath === envPath
    );
    const sameFingerprint = state.schemaVersion === 3 &&
      state.sourceFingerprint?.packageLockSha256 === sourceFingerprint.packageLockSha256 &&
      state.sourceFingerprint?.baselineManifestSha256 === sourceFingerprint.baselineManifestSha256 &&
      state.sourceFingerprint?.repositoryTreeSha256 === sourceFingerprint.repositoryTreeSha256;

    if (sameEnv && sameFingerprint) {
      const live = runRuntimeCheck(envPath, 'full', true, executionEnv);
      if (live.result.status === 0 && live.body?.ready === true && live.body?.blockerCount === 0) {
        console.log('PASS  Local runtime is already source-bound and fully protocol-ready; recovery mutation is unnecessary.');
        return;
      }
    }
  }

  console.log('RECOVER  Resetting possibly partial local runtime state after interruption/crash; named volumes will be preserved.');
  await down({ envPath, removeVolumes: false });
  await up({ envPath, timeoutMs, keepOnFailure });
}

function status({ envPath }) {
  const state = readState();
  const selectedEnv = state?.envPath && existsSync(state.envPath) ? state.envPath : envPath;
  const executionEnv = existsSync(selectedEnv)
    ? withLocalRescueNetworkEnv({ ...process.env, ...parseEnv(selectedEnv) })
    : process.env;
  console.log(`STATE  ${state?.status ?? 'NOT_TRACKED'}`);
  if (state?.apiMode === 'compose') {
    console.log(`API    compose service ${state.apiService ?? 'api'}`);
  } else {
    const pidAlive = processAlive(state?.apiPid);
    console.log(`API    ${state?.apiPid ?? '-'} ${pidAlive ? 'running' : 'not-running'}`);
  }
  console.log(`ENV    ${selectedEnv}`);
  if (state?.mqttHostUrl) console.log(`MQTT   ${state.mqttHostUrl}`);
  if (existsSync(selectedEnv)) {
    for (const scope of ['infra', 'full']) {
      const { result, body } = runRuntimeCheck(selectedEnv, scope, true, executionEnv);
      console.log(`${scope.toUpperCase()}  ${result.status === 0 && body?.ready ? 'READY' : 'BLOCKED'}${body?.blockerCount != null ? ` (${body.blockerCount} blocker(s))` : ''}`);
    }
  } else {
    console.log('INFO  Environment file is missing; protocol status was not probed.');
  }
}

async function main() {
  process.chdir(root);
  const argv = process.argv.slice(2);
  const command = argv[0] ?? 'plan';
  const envArg = argv.find((value) => value.startsWith('--env='));
  const timeoutArg = argv.find((value) => value.startsWith('--timeout-ms='));
  const envPath = path.resolve(root, envArg ? envArg.slice('--env='.length) : '.env');
  const timeoutMs = timeoutArg ? Number(timeoutArg.slice('--timeout-ms='.length)) : 120_000;
  if (!Number.isFinite(timeoutMs) || timeoutMs < 5_000 || timeoutMs > 600_000) {
    fail('--timeout-ms must be between 5000 and 600000.');
  }

  if (command === 'plan') {
    plan();
  } else if (command === 'up') {
    await up({
      envPath,
      timeoutMs,
      keepOnFailure: argv.includes('--keep-on-failure'),
    });
  } else if (command === 'down') {
    await down({ envPath, removeVolumes: argv.includes('--volumes') });
  } else if (command === 'recover') {
    if (argv.includes('--volumes')) {
      fail('rescue:local:recover never removes named volumes; omit --volumes.');
    }
    await recover({
      envPath,
      timeoutMs,
      keepOnFailure: argv.includes('--keep-on-failure'),
    });
  } else if (command === 'status') {
    status({ envPath });
  } else {
    fail('Usage: manage-rescue-local-runtime.mjs <plan|up|recover|status|down> [--env=.env] [--timeout-ms=120000] [--keep-on-failure] [--volumes]');
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    console.error(`FAIL  ${error?.message ?? error}`);
    process.exitCode = error?.exitCode ?? 1;
  });
}
