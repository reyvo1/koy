#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { summarizeFailureOutput } from './rescue-failure-summary.mjs';

const argv = process.argv.slice(2);
const full = argv.includes('--full');
const envArg = argv.find((value) => value.startsWith('--env='));
const envPath = path.resolve(envArg ? envArg.slice('--env='.length) : '.env');
const reportArg = argv.find((value) => value.startsWith('--report='));
const reportPath = path.resolve(
  reportArg
    ? reportArg.slice('--report='.length)
    : `reports/rescue-runtime-acceptance-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
);

const steps = [];
let runtimePreflight = null;

function sha256File(file) {
  const resolved = path.resolve(file);
  if (!existsSync(resolved)) return null;
  return createHash('sha256').update(readFileSync(resolved)).digest('hex');
}

const sourceFingerprint = {
  packageLockSha256: sha256File('package-lock.json'),
  baselineManifestSha256: sha256File('BASELINE-MANIFEST.sha256'),
  repositoryTreeSha256: sha256File('repository-tree.txt'),
};

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
      ((value.startsWith('\"') && value.endsWith('\"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

const executionEnv = { ...parseEnv(envPath), ...process.env };
const npmExecutable = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function samePath(left, right) {
  if (!left || !right) return false;
  const a = path.resolve(left);
  const b = path.resolve(right);
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function localRuntimeProbeEnv() {
  const statePath = path.resolve('reports/local-runtime/state.json');
  if (!existsSync(statePath)) return executionEnv;
  let state;
  try {
    state = JSON.parse(readFileSync(statePath, 'utf8'));
  } catch {
    return executionEnv;
  }
  if (
    state?.status !== 'CORE_RUNTIME_READY_LIVE_BROKER_EVIDENCE_PENDING' ||
    !samePath(state?.envPath, envPath) ||
    state?.sourceFingerprint?.packageLockSha256 !== sourceFingerprint.packageLockSha256 ||
    state?.sourceFingerprint?.baselineManifestSha256 !== sourceFingerprint.baselineManifestSha256 ||
    state?.sourceFingerprint?.repositoryTreeSha256 !== sourceFingerprint.repositoryTreeSha256 ||
    !state?.mqttHostUrl ||
    !Number.isInteger(state?.mqttHostPort)
  ) {
    return executionEnv;
  }
  return {
    ...executionEnv,
    RESCUE_MQTT_HOST_PORT: String(state.mqttHostPort),
    RESCUE_MQTT_BROKER_URL: state.mqttHostUrl,
  };
}

function run(name, command, args, options = {}) {
  const startedAt = new Date();
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: executionEnv,
    encoding: 'utf8',
    windowsHide: true,
    shell: process.platform === 'win32' && /\.(?:cmd|bat)$/i.test(command),
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  });
  const endedAt = new Date();
  const pass = !result.error && result.status === 0;
  const record = {
    name,
    pass,
    command: [command, ...args].join(' '),
    exitCode: result.status,
    signal: result.signal ?? null,
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    stdout: (result.stdout ?? '').trim(),
    stderr: (result.stderr ?? '').trim(),
    error: result.error?.message ?? null,
  };
  steps.push(record);
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}`);
  if (!pass) {
    const detail = [record.stdout, record.stderr, record.error]
      .filter(Boolean)
      .join('\n');
    const summary = summarizeFailureOutput(detail);
    if (summary) {
      console.log('FAILURE SUMMARY');
      console.log(summary);
    }
    if (detail) {
      console.log('FAILURE TAIL');
      console.log(detail.slice(-3000));
    }
  }
  return pass;
}

function save(status) {
  mkdirSync(path.dirname(reportPath), { recursive: true });
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    status,
    mode: full ? 'full' : 'preflight',
    environmentFile: envPath,
    sourceFingerprint,
    runtimePreflight,
    steps,
  };
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`REPORT  ${reportPath}`);
}

if (!run('Rescue source validator', process.execPath, ['scripts/validate-rescue-baseline.mjs'])) {
  save('SOURCE_VALIDATION_FAILED');
  process.exit(1);
}

if (!run('Baseline manifest verifier', process.execPath, ['scripts/manage-baseline-manifest.mjs', 'verify'])) {
  save('SOURCE_VALIDATION_FAILED');
  process.exit(1);
}

if (!run('Lifecycle validator', process.execPath, ['scripts/manage-module-state.mjs', 'validate'])) {
  save('LIFECYCLE_VALIDATION_FAILED');
  process.exit(1);
}

const runtimeArgs = ['scripts/check-rescue-runtime.mjs', '--strict', '--probe', '--json', `--env=${envPath}`];
const runtimePass = run('Runtime prerequisite and connectivity probe', process.execPath, runtimeArgs, {
  env: localRuntimeProbeEnv(),
});
try {
  runtimePreflight = JSON.parse(steps.at(-1)?.stdout ?? '');
} catch {
  runtimePreflight = {
    schemaVersion: 1,
    ready: false,
    blockerCount: null,
    blockers: [],
    parseError: 'Runtime checker did not return valid structured JSON.',
  };
}
if (!runtimePass) {
  save('RUNTIME_PRECHECK_BLOCKED');
  process.exit(2);
}

if (!full) {
  save('READY_FOR_FULL_ACCEPTANCE');
  console.log('NEXT  Re-run with --full to execute dependency-resolved build and integration suites.');
  process.exit(0);
}

const productionBuildEnv = { ...executionEnv, NODE_ENV: 'production' };
const testExecutionEnv = { ...executionEnv, NODE_ENV: 'test' };
const fullSteps = [
  {
    name: 'Backend production build',
    command: npmExecutable,
    args: ['run', 'build'],
    options: { env: productionBuildEnv },
  },
  {
    name: 'Web/mobile validation',
    command: npmExecutable,
    args: ['run', 'web:validate'],
    options: { env: productionBuildEnv },
  },
  {
    name: 'Unit/contract tests',
    command: npmExecutable,
    args: ['test', '--', '--runInBand'],
    options: { env: testExecutionEnv },
  },
  {
    name: 'Database integration',
    command: npmExecutable,
    args: ['run', 'test:integration:db'],
    options: { env: testExecutionEnv },
  },
  {
    name: 'MQTT integration',
    command: npmExecutable,
    args: ['run', 'test:integration:mqtt'],
    options: { env: testExecutionEnv },
  },
];

for (const { name, command, args, options } of fullSteps) {
  if (!run(name, command, args, options)) {
    save('FULL_ACCEPTANCE_FAILED');
    process.exit(3);
  }
}

save('AUTOMATED_TEST_SUITE_PASS');
console.log('PASS  Automated build/test suites completed. Live EMQX auth/webhook vertical flow and physical ESP32 checks remain separate gates.');
console.log(`NEXT  Initialize the auditable runtime/hardware evidence file with: npm run rescue:evidence:init -- --automated-report=${reportPath}`);
