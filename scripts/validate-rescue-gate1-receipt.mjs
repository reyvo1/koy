#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
process.chdir(root);
const argv = process.argv.slice(2);
const fileArg = argv.find((value) => value.startsWith('--file='));
function resolveReceiptPath() {
  if (fileArg) return path.resolve(fileArg.slice('--file='.length));
  const gateDir = path.resolve(root, 'reports/gate1');
  if (!existsSync(gateDir)) {
    console.error('FAIL  No Gate 1 receipt directory exists yet. Run npm run rescue:gate1 first.');
    process.exit(2);
  }
  const candidates = readdirSync(gateDir)
    .filter((name) => /^gate1-.*\.json$/i.test(name) && !/-bootstrap\.json$/i.test(name))
    .sort((a, b) => b.localeCompare(a));
  if (candidates.length === 0) {
    console.error('FAIL  No Gate 1 receipt exists yet. Run npm run rescue:gate1 first.');
    process.exit(2);
  }
  const selected = path.resolve(gateDir, candidates[0]);
  console.log(`INFO  Using latest Gate 1 receipt: ${path.relative(root, selected).split(path.sep).join('/')}`);
  return selected;
}
const receiptPath = resolveReceiptPath();
if (!existsSync(receiptPath)) {
  console.error(`FAIL  Gate 1 receipt not found: ${receiptPath}`);
  process.exit(2);
}

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}
function sameSourceFingerprint(left, right) {
  return Boolean(left && right) &&
    left.packageLockSha256 === right.packageLockSha256 &&
    left.baselineManifestSha256 === right.baselineManifestSha256 &&
    left.repositoryTreeSha256 === right.repositoryTreeSha256;
}
function readJson(file) {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; }
}
function samePath(left, right) {
  if (!left || !right) return false;
  const a = path.resolve(left);
  const b = path.resolve(right);
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}
function fail(message, detail = '') {
  console.error(`FAIL  ${message}`);
  if (detail) console.error(detail.slice(-3000));
  process.exit(1);
}
let receipt;
try { receipt = JSON.parse(readFileSync(receiptPath, 'utf8')); } catch { fail('Gate 1 receipt is not valid JSON.'); }
if (receipt.schemaVersion !== 1 || receipt.gate !== 'GATE_1_DEPENDENCY_RUNTIME_BRINGUP' || receipt.status !== 'PASS') {
  fail(`Gate 1 receipt is not a PASS receipt (status=${receipt.status ?? 'missing'}).`);
}
for (const [field, file] of Object.entries({
  packageLockSha256: 'package-lock.json',
  baselineManifestSha256: 'BASELINE-MANIFEST.sha256',
  repositoryTreeSha256: 'repository-tree.txt',
})) {
  if (!existsSync(file) || receipt.sourceFingerprint?.[field] !== sha256(file)) {
    fail(`Gate 1 receipt source fingerprint mismatch: ${field}.`);
  }
}
if (receipt.bootstrap?.status !== 'READY') fail('Gate 1 receipt does not record dependency bootstrap READY.');
if (receipt.runtimePreflight?.ready !== true || receipt.runtimePreflight?.blockerCount !== 0 || receipt.runtimePreflight?.probeScope !== 'full') {
  fail('Gate 1 receipt does not record a blocker-free full protocol preflight.');
}
if (!['local', 'external'].includes(receipt.topology)) fail('Gate 1 receipt topology is invalid.');
const generatedAt = Date.parse(receipt.generatedAt ?? '');
if (!Number.isFinite(generatedAt) || generatedAt > Date.now() + 60_000) fail('Gate 1 receipt timestamp is invalid.');
if (receipt.topology === 'local') {
  if (receipt.runtimeState?.status !== 'CORE_RUNTIME_READY_LIVE_BROKER_EVIDENCE_PENDING') {
    fail('Local Gate 1 receipt does not record the expected core-runtime terminal state.');
  }
  if (receipt.runtimeState?.schemaVersion !== 3 || !sameSourceFingerprint(receipt.runtimeState?.sourceFingerprint, receipt.sourceFingerprint)) {
    fail('Local Gate 1 receipt runtime state is not source-bound to the receipt baseline.');
  }
}

const envPath = path.resolve(root, receipt.environmentFile ?? '.env');
let currentState = null;
if (receipt.topology === 'local') {
  const statePath = path.resolve(root, 'reports/local-runtime/state.json');
  currentState = existsSync(statePath) ? readJson(statePath) : null;
  if (!currentState) fail('Current local runtime state is missing or unreadable.');
  if (currentState.status !== 'CORE_RUNTIME_READY_LIVE_BROKER_EVIDENCE_PENDING') {
    fail(`Current local runtime state is not protocol-ready (status=${currentState.status ?? 'missing'}).`);
  }
  if (currentState.schemaVersion !== 3 || !sameSourceFingerprint(currentState.sourceFingerprint, receipt.sourceFingerprint)) {
    fail('Current local runtime state is not source-bound to the validated Gate 1 baseline.');
  }
  if (!samePath(currentState.envPath, envPath)) {
    fail('Current local runtime state belongs to a different environment file.');
  }
}
let runtimeExecutionEnv = process.env;
if (receipt.topology === 'local') {
  if (!currentState?.mqttHostUrl || !Number.isInteger(currentState?.mqttHostPort)) {
    fail('Current local runtime state does not record its dedicated host MQTT endpoint.');
  }
  runtimeExecutionEnv = {
    ...process.env,
    RESCUE_MQTT_HOST_PORT: String(currentState.mqttHostPort),
    RESCUE_MQTT_BROKER_URL: currentState.mqttHostUrl,
  };
}

const doctorPath = path.resolve(root, 'reports/gate1/validate-bootstrap.json');
const doctor = spawnSync(process.execPath, ['scripts/diagnose-rescue-bootstrap.mjs', `--json=${doctorPath}`, '--no-registry-probe'], {
  cwd: root, encoding: 'utf8', windowsHide: true,
});
if (doctor.status !== 0) fail('Current dependency bootstrap no longer satisfies Gate 1.', `${doctor.stdout ?? ''}${doctor.stderr ?? ''}`);
const runtime = spawnSync(process.execPath, ['scripts/check-rescue-runtime.mjs', '--strict', '--probe-scope=full', '--json', `--env=${envPath}`], {
  cwd: root, encoding: 'utf8', windowsHide: true, env: runtimeExecutionEnv,
});
if (runtime.status !== 0) fail('Current runtime no longer satisfies Gate 1.', `${runtime.stdout ?? ''}${runtime.stderr ?? ''}`);
let runtimeBody;
try { runtimeBody = JSON.parse(runtime.stdout ?? ''); } catch { fail('Current runtime checker did not return valid JSON.'); }
if (runtimeBody.ready !== true || runtimeBody.blockerCount !== 0) fail('Current runtime Gate 1 recheck is not READY.');

console.log('PASS  Gate 1 receipt is source-bound and currently revalidated live.');
console.log('PASS  Gate 2 entry is permitted.');
