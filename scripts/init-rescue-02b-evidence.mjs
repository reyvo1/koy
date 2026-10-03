#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const reportArg = argv.find((value) => value.startsWith('--automated-report='));
const outputArg = argv.find((value) => value.startsWith('--output='));

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function sha256File(file) {
  if (!existsSync(file)) return null;
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function validTimestamp(value) {
  if (typeof value !== 'string' || value.length === 0) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && time <= Date.now() + 5 * 60 * 1000;
}

const requiredAutomatedSteps = [
  'Rescue source validator',
  'Baseline manifest verifier',
  'Lifecycle validator',
  'Runtime prerequisite and connectivity probe',
  'Backend production build',
  'Web/mobile validation',
  'Unit/contract tests',
  'Database integration',
  'MQTT integration',
];

if (!reportArg) {
  fail('--automated-report=<path> is required. Run rescue:acceptance --full first.');
}

const automatedReportPath = path.resolve(reportArg.slice('--automated-report='.length));
if (!existsSync(automatedReportPath)) {
  fail(`Automated acceptance report not found: ${automatedReportPath}`);
}

let automatedReport;
try {
  automatedReport = JSON.parse(readFileSync(automatedReportPath, 'utf8'));
} catch (error) {
  fail(`Automated acceptance report is not valid JSON: ${error.message}`);
}

if (automatedReport.status !== 'AUTOMATED_TEST_SUITE_PASS' || automatedReport.mode !== 'full') {
  fail(
    `Automated report must be a full AUTOMATED_TEST_SUITE_PASS report; got mode=${automatedReport.mode ?? 'unknown'} status=${automatedReport.status ?? 'unknown'}.`,
  );
}

if (automatedReport.schemaVersion !== 1 || !validTimestamp(automatedReport.generatedAt)) {
  fail('Automated report must be schemaVersion=1 with a valid generatedAt timestamp.');
}
const automatedSteps = new Map((automatedReport.steps ?? []).map((step) => [step?.name, step]));
for (const name of requiredAutomatedSteps) {
  const step = automatedSteps.get(name);
  if (!step || step.pass !== true || step.exitCode !== 0) {
    fail(`Automated report is missing successful required step: ${name}.`);
  }
}
const expectedFingerprint = {
  packageLockSha256: sha256File(path.resolve('package-lock.json')),
  baselineManifestSha256: sha256File(path.resolve('BASELINE-MANIFEST.sha256')),
  repositoryTreeSha256: sha256File(path.resolve('repository-tree.txt')),
};
for (const [field, expected] of Object.entries(expectedFingerprint)) {
  if (!expected || automatedReport.sourceFingerprint?.[field] !== expected) {
    fail(`Automated report ${field} does not match the current source baseline.`);
  }
}

const defaultOutput = path.resolve(
  'reports',
  `rescue-02b-evidence-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
);
const outputPath = path.resolve(outputArg ? outputArg.slice('--output='.length) : defaultOutput);

const runtimeFlowIds = [
  'login',
  'tenant-context-isolation',
  'register-device',
  'pair-device',
  'repair-rotation-safety',
  'register-capability',
  'heartbeat-active',
  'telemetry-idempotency',
  'realtime-dashboard',
  'command-publish-path',
  'ack-correlation-and-replay',
  'command-history',
  'command-device-replay-safety',
  'scene-device-command-path',
  'automation-runtime-path',
  'schedule-runtime-path',
  'notification-report-persisted-data',
];

const brokerIds = [
  'device-valid-secret-allowed',
  'device-wrong-secret-denied',
  'revoked-device-denied',
  'publisher-command-publish-allowed',
  'publisher-non-command-operations-denied',
  'device-telemetry-publish-allowed',
  'device-ack-publish-allowed',
  'device-command-subscribe-allowed',
  'cross-device-tenant-topic-denied',
  'telemetry-webhook-idempotent',
  'ack-bound-to-matching-device-command',
  'wrong-webhook-secret-denied',
];

const hardwareIds = [
  'esp-idf-compile',
  'provision-and-reboot-persistence',
  'tls-api-and-mqtt-validation',
  'wifi-loss-reconnect',
  'mqtt-reconnect-qos1-dedupe',
  'physical-telemetry-command-ack-heartbeat',
];

function pendingChecks(ids) {
  return ids.map((id) => ({ id, status: 'PENDING', evidence: null }));
}

const relativeAutomatedReport = path.relative(path.dirname(outputPath), automatedReportPath) || path.basename(automatedReportPath);
const evidence = {
  schemaVersion: 2,
  gate: 'RESCUE-02B',
  generatedAt: new Date().toISOString(),
  automatedReport: relativeAutomatedReport,
  runtimeFlow: {
    executedAt: null,
    environment: '',
    checks: pendingChecks(runtimeFlowIds),
  },
  liveBroker: {
    executedAt: null,
    emqxVersion: '',
    checks: pendingChecks(brokerIds),
  },
  physicalEsp32: {
    executedAt: null,
    boardModel: '',
    espIdfVersion: '',
    checks: pendingChecks(hardwareIds),
  },
  productionOnly: {
    otaDigestVerification: {
      status: 'DEFERRED',
      executedAt: null,
      deviceId: '',
      artifactPath: '',
      artifactSha256: '',
      deviceObservedSha256: '',
      evidence:
        'Physical OTA field evidence is optional when a source-bound SIMULATED_HARDWARE_LIVE_SERVICE summary is supplied; DEFERRED is not a physical PASS.',
    },
  },
  operatorNotes: '',
};

mkdirSync(path.dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(`CREATED  ${outputPath}`);
console.log('NEXT  Replace every required PENDING row with PASS plus concrete evidence, then run rescue:evidence:validate.');
console.log('SAFETY  Do not place passwords, tokens, webhook secrets, private keys, or credential values in the evidence file.');
