#!/usr/bin/env node
/**
 * Fail-closed coverage for the production approval GENERATOR.
 *
 * Software production-readiness must not stop merely because a physical board is unavailable. The approved
 * automated path is therefore a source-bound + firmware-SHA-bound SIMULATED_HARDWARE_LIVE_SERVICE receipt
 * generated only after the live rescue stack and combined simulated-hardware UAT are green. The historical
 * physical OTA/device-digest path remains supported as an optional field-validation path.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const temp = mkdtempSync(path.join(os.tmpdir(), 'iot-production-approval-gate-'));
const evidenceDir = path.join(temp, 'evidence');
const releaseRoot = path.join(temp, 'release');
const now = Date.now();
const autoTime = new Date(now - 3000).toISOString();
const liveTime = new Date(now - 2000).toISOString();
const simTime = new Date(now - 1000).toISOString();
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
const runtimeIds = [
  'login', 'tenant-context-isolation', 'register-device', 'pair-device', 'repair-rotation-safety',
  'register-capability', 'heartbeat-active', 'telemetry-idempotency', 'realtime-dashboard',
  'command-publish-path', 'ack-correlation-and-replay', 'command-history', 'command-device-replay-safety',
  'scene-device-command-path', 'automation-runtime-path', 'schedule-runtime-path', 'notification-report-persisted-data',
];
const brokerIds = [
  'device-valid-secret-allowed', 'device-wrong-secret-denied', 'revoked-device-denied',
  'publisher-command-publish-allowed', 'publisher-non-command-operations-denied',
  'device-telemetry-publish-allowed', 'device-ack-publish-allowed', 'device-command-subscribe-allowed',
  'cross-device-tenant-topic-denied', 'telemetry-webhook-idempotent', 'ack-bound-to-matching-device-command',
  'wrong-webhook-secret-denied',
];
const releaseFiles = [
  'dist/main.js', 'package.json', 'package-lock.json', 'prisma/schema.prisma', 'prisma/migrations/migration_lock.toml',
  'ops/systemd/iot-platform.service', 'ops/systemd/iot-platform-backup.service', 'ops/systemd/iot-platform-backup.timer',
  'ops/nginx/iot-platform.conf.template', 'ops/sysctl/99-iot-platform.conf', 'ops/security/migration-compatibility-policy.json', 'ops/env/iot-platform.env.example', 'ops/env/iot-platform-backup.env.example',
  'ops/scripts/install-release.sh', 'ops/scripts/rollback-release.sh', 'ops/scripts/postgres-backup.sh',
  'ops/scripts/postgres-restore.sh', 'ops/production/environment-attestation.example.json',
  'scripts/verify-production-release.mjs', 'scripts/verify-production-environment-evidence.mjs',
  'scripts/create-production-environment-evidence.mjs', 'scripts/verify-production-environment-current.mjs', 'scripts/verify-migration-compatibility.mjs', 'docs/deployment-recovery.md',
];

function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
function sha256File(file) { return sha256(readFileSync(file)); }
function writeJson(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}
function runApproval(args) {
  const result = spawnSync(process.execPath, ['scripts/verify-production-approval.mjs', ...args], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  });
  return { status: result.status, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}
function expect(condition, message, detail = '') {
  if (!condition) throw new Error(`${message}${detail ? `\n${detail}` : ''}`);
}
function expectRejected(label, args, expectedText) {
  const result = runApproval(args);
  expect(result.status !== 0, `${label}: the gate returned success. It must fail closed.`, result.output);
  expect(result.output.includes(expectedText), `${label}: rejected for the wrong reason. Expected: ${expectedText}`, result.output);
  console.log(`PASS  ${label}`);
}

try {
  expectRejected('missing evidence is refused', [], 'Production approval requires --evidence=');
  expectRejected('missing environment evidence is refused', [`--evidence=${path.join(temp, 'absent.json')}`], 'Production approval requires --environment=');
  expectRejected('a nonexistent evidence file is refused', [`--evidence=${path.join(temp, 'absent.json')}`, `--environment=${path.join(temp, 'absent-environment.json')}`], 'RESCUE-02B evidence');

  const malformed = path.join(temp, 'malformed.json');
  writeFileSync(malformed, '{ this is not the evidence schema }\n');
  expectRejected('evidence that fails validation is refused', [`--evidence=${malformed}`, `--environment=${path.join(temp, 'absent-environment.json')}`], 'RESCUE-02B evidence');

  const sourceFingerprint = {
    packageLockSha256: sha256File(path.join(root, 'package-lock.json')),
    baselineManifestSha256: sha256File(path.join(root, 'BASELINE-MANIFEST.sha256')),
    repositoryTreeSha256: sha256File(path.join(root, 'repository-tree.txt')),
  };

  mkdirSync(evidenceDir, { recursive: true });
  const proofPath = path.join(evidenceDir, 'runtime-proof.txt');
  writeFileSync(proofPath, 'immutable simulated hardware UAT fixture proof\n');
  const proof = {
    artifactPath: 'runtime-proof.txt',
    artifactSha256: sha256File(proofPath),
    note: 'Immutable fixture proving the required runtime/broker acceptance row.',
  };
  const automatedPath = path.join(evidenceDir, 'automated.json');
  writeJson(automatedPath, {
    schemaVersion: 1,
    mode: 'full',
    status: 'AUTOMATED_TEST_SUITE_PASS',
    generatedAt: autoTime,
    sourceFingerprint,
    steps: requiredAutomatedSteps.map((name) => ({ name, pass: true, exitCode: 0, startedAt: autoTime, endedAt: autoTime })),
  });
  const evidencePath = path.join(evidenceDir, 'evidence.json');
  writeJson(evidencePath, {
    schemaVersion: 2,
    gate: 'RESCUE-02B',
    generatedAt: liveTime,
    automatedReport: 'automated.json',
    runtimeFlow: {
      executedAt: liveTime,
      environment: 'self-test live rescue fixture',
      checks: runtimeIds.map((id) => ({ id, status: 'PASS', evidence: proof })),
    },
    liveBroker: {
      executedAt: liveTime,
      emqxVersion: '5.9.2',
      checks: brokerIds.map((id) => ({ id, status: 'PASS', evidence: proof })),
    },
    productionOnly: {
      otaDigestVerification: {
        status: 'DEFERRED',
        executedAt: null,
        deviceId: '',
        artifactPath: '',
        artifactSha256: '',
        deviceObservedSha256: '',
        evidence: 'Physical field OTA observation is optional because automated simulated-hardware UAT is source-bound.',
      },
    },
  });

  const simulatedPath = path.join(evidenceDir, 'simulated-hardware-summary.json');
  writeJson(simulatedPath, {
    schemaVersion: 1,
    gate: 'SIMULATED_HARDWARE_UAT',
    status: 'PASS',
    evidenceClass: 'SIMULATED_HARDWARE_LIVE_SERVICE',
    observedAt: simTime,
    sourceFingerprint,
    firmwareArtifactSha256: 'a'.repeat(64),
  });

  mkdirSync(releaseRoot, { recursive: true });
  for (const relative of releaseFiles) {
    const target = path.join(releaseRoot, relative);
    mkdirSync(path.dirname(target), { recursive: true });
    if (relative === 'scripts/verify-production-environment-evidence.mjs' || relative === 'scripts/verify-production-environment-current.mjs' || relative === 'scripts/verify-migration-compatibility.mjs') {
      writeFileSync(target, readFileSync(path.join(root, relative)));
    } else if (relative === 'package-lock.json') {
      writeFileSync(target, readFileSync(path.join(root, 'package-lock.json')));
    } else if (relative === 'package.json') {
      writeJson(target, { name: 'iot-platform', version: '0.0.1', engines: { node: '>=22 <23' }, scripts: { start: 'node dist/main.js', 'migrate:deploy': 'prisma migrate deploy' } });
    } else {
      writeFileSync(target, `fixture:${relative}\n`);
    }
  }
  const manifestFiles = releaseFiles.map((relative) => {
    const absolute = path.join(releaseRoot, relative);
    return { path: relative, bytes: readFileSync(absolute).length, sha256: sha256File(absolute) };
  }).sort((a, b) => a.path.localeCompare(b.path));
  writeJson(path.join(releaseRoot, 'release-manifest.json'), {
    schemaVersion: 1,
    application: 'iot-platform',
    version: '0.0.1',
    revision: 'simulated-hardware-self-test',
    node: '>=22 <23',
    packageManager: null,
    entrypoint: 'dist/main.js',
    createdAt: simTime,
    sourceFingerprint,
    files: manifestFiles,
  });

  const releaseManifestPath = path.join(releaseRoot, 'release-manifest.json');
  const environmentPath = path.join(evidenceDir, 'production-environment-evidence.json');
  writeJson(environmentPath, {
    schemaVersion: 1,
    gate: 'PRODUCTION_ENVIRONMENT',
    status: 'APPROVED',
    observedAt: simTime,
    releaseManifestSha256: sha256File(releaseManifestPath),
    runtimeEnvSha256: '1'.repeat(64),
    backupEnvSha256: '2'.repeat(64),
    localChecks: {
      nodeMajor: 22,
      vmOvercommitMemory: 1,
      runtimeFeaturesEnabled: true,
      runtimeEnvironmentProtected: true,
      backupEnvironmentProtected: true,
      secretPlaceholdersAbsent: true,
    },
    externalChecks: {
      publicOrigin: 'https://app.iot-fixture.test',
      mqttAclVerified: true,
      mqttCaHostnameVerified: true,
      dnsTlsVerified: true,
      offHostBackupVerified: true,
      monitoringAccessVerified: true,
      backupOwner: 'ops-backup',
      monitoringOwner: 'ops-monitoring',
      rollbackOwner: 'ops-release',
      reviewedBy: 'operator-a',
    },
  });

  expectRejected(
    'DEFERRED physical OTA without simulated-hardware receipt is refused',
    [`--evidence=${evidencePath}`, `--environment=${environmentPath}`, `--release=${releaseRoot}`],
    'RESCUE-02B evidence',
  );

  const approved = runApproval([
    `--evidence=${evidencePath}`,
    `--simulated-hardware=${simulatedPath}`,
    `--environment=${environmentPath}`,
    `--release=${releaseRoot}`,
  ]);
  expect(approved.status === 0 && approved.output.includes('PRODUCTION APPROVAL EVIDENCE PASS'), 'source-bound simulated-hardware approval path did not pass', approved.output);
  const receipt = JSON.parse(readFileSync(path.join(releaseRoot, 'production-approval.json'), 'utf8'));
  expect(receipt.hardwareEvidence?.classification === 'SIMULATED_HARDWARE_LIVE_SERVICE', 'approval receipt did not record simulated-hardware classification');
  expect(receipt.hardwareEvidence?.firmwareArtifactSha256 === 'a'.repeat(64), 'approval receipt did not bind the firmware SHA-256');
  expect(receipt.environmentEvidenceSha256 === sha256File(path.join(releaseRoot, 'production-environment-evidence.json')), 'approval receipt did not bind the environment evidence SHA-256');
  console.log('PASS  source-bound simulated-hardware UAT plus validated production environment can close the production approval gate');

  const tampered = JSON.parse(readFileSync(simulatedPath, 'utf8'));
  tampered.sourceFingerprint.repositoryTreeSha256 = '0'.repeat(64);
  writeJson(simulatedPath, tampered);
  expectRejected(
    'simulated-hardware receipt from another source baseline is refused',
    [`--evidence=${evidencePath}`, `--simulated-hardware=${simulatedPath}`, `--environment=${environmentPath}`, `--release=${releaseRoot}`],
    'RESCUE-02B evidence',
  );

  console.log('PRODUCTION APPROVAL GENERATOR GATE SELF-TEST PASS');
} finally {
  rmSync(temp, { recursive: true, force: true });
}
