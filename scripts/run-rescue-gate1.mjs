#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from './manage-rescue-local-runtime.mjs';
import { withLocalRescueNetworkEnv } from './rescue-local-network.mjs';

const root = path.resolve(import.meta.dirname, '..');
process.chdir(root);
const argv = process.argv.slice(2);
const envArg = argv.find((value) => value.startsWith('--env='));
const topologyArg = argv.find((value) => value.startsWith('--topology='));
const reportArg = argv.find((value) => value.startsWith('--report='));
const envInput = envArg ? envArg.slice('--env='.length) : '.env';
const envPath = path.resolve(root, envInput);
const topology = topologyArg ? topologyArg.slice('--topology='.length) : 'local';
const attemptInstall = argv.includes('--attempt-install');
const reportPath = path.resolve(
  reportArg
    ? reportArg.slice('--report='.length)
    : `reports/gate1/gate1-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
);
const bootstrapPath = path.resolve(path.dirname(reportPath), `${path.basename(reportPath, '.json')}-bootstrap.json`);

if (!['local', 'external'].includes(topology)) {
  console.error('FAIL  --topology must be local or external.');
  process.exit(2);
}

function sha256File(file) {
  if (!existsSync(file)) return null;
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

const sourceFingerprint = {
  packageLockSha256: sha256File(path.resolve(root, 'package-lock.json')),
  baselineManifestSha256: sha256File(path.resolve(root, 'BASELINE-MANIFEST.sha256')),
  repositoryTreeSha256: sha256File(path.resolve(root, 'repository-tree.txt')),
};

function sameSourceFingerprint(left, right) {
  return Boolean(left && right) &&
    left.packageLockSha256 === right.packageLockSha256 &&
    left.baselineManifestSha256 === right.baselineManifestSha256 &&
    left.repositoryTreeSha256 === right.repositoryTreeSha256;
}

const steps = [];
let bootstrap = null;
let runtimePreflight = null;
let runtimeState = null;

function command(name, executable, args, options = {}) {
  const startedAt = new Date();
  const result = spawnSync(executable, args, {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    shell: process.platform === 'win32' && /\.(?:cmd|bat)$/i.test(executable),
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  });
  const pass = !result.error && result.status === 0;
  const record = {
    name,
    pass,
    command: [executable, ...args].join(' '),
    exitCode: result.status,
    startedAt: startedAt.toISOString(),
    endedAt: new Date().toISOString(),
    stdout: (result.stdout ?? '').trim(),
    stderr: (result.stderr ?? '').trim(),
    error: result.error?.message ?? null,
  };
  steps.push(record);
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}`);
  if (!pass) {
    const detail = record.stderr || record.stdout || record.error;
    if (detail) console.log(detail.slice(-2500));
  }
  return { pass, result, record };
}

function readJson(file) {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; }
}

function save(status, reason = null) {
  mkdirSync(path.dirname(reportPath), { recursive: true });
  const report = {
    schemaVersion: 1,
    gate: 'GATE_1_DEPENDENCY_RUNTIME_BRINGUP',
    status,
    reason,
    generatedAt: new Date().toISOString(),
    topology,
    environmentFile: envInput,
    sourceFingerprint,
    bootstrap,
    runtimePreflight,
    runtimeState,
    steps,
  };
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  console.log(`REPORT  ${reportPath}`);
  return report;
}

function block(status, reason, exitCode = 2) {
  save(status, reason);
  console.error(`BLOCKED  ${reason}`);
  process.exit(exitCode);
}

for (const [name, executable, args] of [
  ['Rescue source validator', process.execPath, ['scripts/validate-rescue-baseline.mjs']],
  ['Baseline manifest verifier', process.execPath, ['scripts/manage-baseline-manifest.mjs', 'verify']],
  ['Lifecycle validator', process.execPath, ['scripts/manage-module-state.mjs', 'validate']],
]) {
  const result = command(name, executable, args);
  if (!result.pass) block('GATE1_SOURCE_VALIDATION_FAILED', `${name} failed.`, 1);
}

function runDoctor() {
  rmSync(bootstrapPath, { force: true });
  const result = command('Dependency bootstrap doctor', process.execPath, [
    'scripts/diagnose-rescue-bootstrap.mjs',
    `--json=${bootstrapPath}`,
  ]);
  bootstrap = readJson(bootstrapPath);
  return { result, report: bootstrap };
}

let doctor = runDoctor();
if (bootstrap?.status !== 'READY' && attemptInstall) {
  if (bootstrap?.status === 'INSTALL_REQUIRED_REGISTRY_REACHABLE') {
    const npmExecutable = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const install = command('Exact lockfile dependency installation', npmExecutable, [
      'ci', '--ignore-scripts', '--prefer-offline', '--no-audit', '--fund=false', '--progress=false',
    ]);
    if (!install.pass) {
      rmSync(path.resolve(root, 'node_modules'), { recursive: true, force: true });
      for (const workspaceRoot of ['apps', 'packages']) {
        const absolute = path.resolve(root, workspaceRoot);
        if (!existsSync(absolute)) continue;
        // npm ci may leave workspace node_modules after a failed install; those are runtime artifacts, not source.
        for (const name of (await import('node:fs')).readdirSync(absolute)) {
          rmSync(path.join(absolute, name, 'node_modules'), { recursive: true, force: true });
        }
      }
    }
    doctor = runDoctor();
  } else {
    console.log(`SKIP  Exact lockfile install not attempted because bootstrap status is ${bootstrap?.status ?? 'UNKNOWN'}.`);
  }
}

if (!doctor.report || doctor.report.status !== 'READY') {
  block(
    'GATE1_BLOCKED_DEPENDENCY',
    `Dependency bootstrap is ${doctor.report?.status ?? 'UNKNOWN'}; Gate 1 requires READY.`,
  );
}

if (!existsSync(envPath)) {
  block('GATE1_BLOCKED_ENV', `Environment file is missing: ${envInput}.`);
}

const runtimeExecutionEnv = topology === 'local'
  ? withLocalRescueNetworkEnv({ ...process.env, ...parseEnv(envPath) })
  : process.env;

if (topology === 'local') {
  const localStatePath = path.resolve(root, 'reports/local-runtime/state.json');
  const stateFileExists = existsSync(localStatePath);
  const existingState = stateFileExists ? readJson(localStatePath) : null;

  if (stateFileExists && !existingState) {
    block('GATE1_BLOCKED_RUNTIME', 'Tracked local runtime state exists but is unreadable. Run rescue:local:recover after an interruption/crash, or rescue:local:down before a deliberate clean restart, then retry Gate 1.');
  }

  if (existingState?.status === 'CORE_RUNTIME_READY_LIVE_BROKER_EVIDENCE_PENDING') {
    const trackedEnvPath = existingState.envPath ? path.resolve(existingState.envPath) : null;
    const sameEnv = trackedEnvPath && (
      process.platform === 'win32'
        ? trackedEnvPath.toLowerCase() === envPath.toLowerCase()
        : trackedEnvPath === envPath
    );
    if (!sameEnv) {
      block(
        'GATE1_BLOCKED_RUNTIME',
        `Tracked local runtime belongs to a different environment file (${existingState.envPath ?? 'missing'}). Run rescue:local:recover after an interruption/crash, or rescue:local:down before a deliberate clean restart, then retry Gate 1.`,
      );
    }
    if (existingState.schemaVersion !== 3 || !sameSourceFingerprint(existingState.sourceFingerprint, sourceFingerprint)) {
      block(
        'GATE1_BLOCKED_RUNTIME',
        'Tracked local runtime is not source-bound to the current sealed baseline. Run rescue:local:recover once before retrying Gate 1.',
      );
    }
    runtimeState = existingState;
    console.log('REUSE  Local runtime already tracks the source-bound CORE_RUNTIME_READY_LIVE_BROKER_EVIDENCE_PENDING state for the selected environment.');
    console.log('CHECK  Gate 1 will still require a fresh blocker-free full protocol preflight before PASS.');
  } else {
    if (existingState && existingState.status !== 'NOT_TRACKED') {
      block(
        'GATE1_BLOCKED_RUNTIME',
        `Tracked local runtime state is ${existingState.status ?? 'UNKNOWN'}, not the reusable protocol-ready boundary. Run rescue:local:recover after an interruption/crash, or rescue:local:down before a deliberate clean restart, then retry Gate 1.`,
      );
    }
    const local = command('Local runtime bring-up', process.execPath, [
      'scripts/manage-rescue-local-runtime.mjs', 'up', `--env=${envInput}`,
    ]);
    if (!local.pass) block('GATE1_BLOCKED_RUNTIME', 'Local runtime bring-up failed.');
    runtimeState = readJson(localStatePath);
  }
}

if (topology === 'local' && !sameSourceFingerprint(runtimeState?.sourceFingerprint, sourceFingerprint)) {
  block('GATE1_BLOCKED_RUNTIME', 'Local runtime state is not source-bound to the current sealed baseline.');
}
if (topology === 'local') {
  if (!runtimeState?.mqttHostUrl || !Number.isInteger(runtimeState?.mqttHostPort)) {
    block('GATE1_BLOCKED_RUNTIME', 'Local runtime state does not record its dedicated host MQTT endpoint. Run rescue:local:recover once before retrying Gate 1.');
  }
  if (runtimeState.mqttHostUrl !== runtimeExecutionEnv.RESCUE_MQTT_BROKER_URL || String(runtimeState.mqttHostPort) !== runtimeExecutionEnv.RESCUE_MQTT_HOST_PORT) {
    block('GATE1_BLOCKED_RUNTIME', 'Local runtime MQTT host endpoint does not match the current rescue network configuration. Run rescue:local:recover once before retrying Gate 1.');
  }
}

const runtime = command('Full protocol runtime preflight', process.execPath, [
  'scripts/check-rescue-runtime.mjs', '--strict', '--probe-scope=full', '--json', `--env=${envInput}`,
], { env: runtimeExecutionEnv });
try { runtimePreflight = JSON.parse(runtime.record.stdout); } catch { runtimePreflight = null; }
if (!runtime.pass || runtimePreflight?.ready !== true || runtimePreflight?.blockerCount !== 0) {
  block('GATE1_BLOCKED_RUNTIME', 'Full protocol runtime preflight is not READY.');
}
if (topology === 'local' && runtimeState?.status !== 'CORE_RUNTIME_READY_LIVE_BROKER_EVIDENCE_PENDING') {
  block('GATE1_BLOCKED_RUNTIME', 'Local runtime state did not reach the expected protocol-ready boundary.');
}

save('PASS');
console.log('PASS  GATE 1 — dependency bootstrap and core runtime bring-up are READY.');
console.log('NEXT  Validate this live Gate 1 receipt with: npm run rescue:gate1:validate');
