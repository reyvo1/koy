#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, unlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'iot-release-approval-self-test-'));
const releaseRoot = path.join(tempRoot, 'release');
const requiredFiles = [
  'dist/main.js',
  'package.json',
  'package-lock.json',
  'prisma/schema.prisma',
  'prisma/migrations/migration_lock.toml',
  'ops/systemd/iot-platform.service',
  'ops/systemd/iot-platform-backup.service',
  'ops/systemd/iot-platform-backup.timer',
  'ops/nginx/iot-platform.conf.template',
  'ops/env/iot-platform.env.example',
  'ops/env/iot-platform-backup.env.example',
  'ops/scripts/install-release.sh',
  'ops/scripts/rollback-release.sh',
  'ops/scripts/postgres-backup.sh',
  'ops/scripts/postgres-restore.sh',
  'scripts/verify-production-release.mjs',
  'docs/deployment-recovery.md',
];

function sha256Bytes(value) {
  return createHash('sha256').update(value).digest('hex');
}
function sha256File(file) {
  return sha256Bytes(readFileSync(file));
}
function write(relative, content) {
  const target = path.join(releaseRoot, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content);
}
function run(requireApproved = false) {
  const result = spawnSync(
    process.execPath,
    ['scripts/verify-production-release.mjs', ...(requireApproved ? ['--require-approved'] : [])],
    {
      cwd: root,
      env: { ...process.env, RELEASE_OUTPUT_DIR: releaseRoot },
      encoding: 'utf8',
      windowsHide: true,
    },
  );
  return { status: result.status, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}
function expect(condition, message, detail = '') {
  if (!condition) throw new Error(`${message}${detail ? `\n${detail}` : ''}`);
}

try {
  mkdirSync(releaseRoot, { recursive: true });
  for (const relative of requiredFiles) {
    if (relative === 'package.json') {
      write(relative, `${JSON.stringify({ name: 'iot-platform', version: '0.0.1', engines: { node: '>=22 <23' }, scripts: { start: 'node dist/main.js', 'migrate:deploy': 'prisma migrate deploy' } }, null, 2)}\n`);
    } else if (relative === 'package-lock.json') {
      write(relative, `${JSON.stringify({ name: 'iot-platform', version: '0.0.1', lockfileVersion: 3, packages: {} }, null, 2)}\n`);
    } else {
      write(relative, `fixture:${relative}\n`);
    }
  }

  const payload = requiredFiles.map((relative) => {
    const absolute = path.join(releaseRoot, relative);
    return { path: relative, bytes: readFileSync(absolute).length, sha256: sha256File(absolute) };
  }).sort((a, b) => a.path.localeCompare(b.path));
  const sourceFingerprint = {
    packageLockSha256: sha256File(path.join(releaseRoot, 'package-lock.json')),
    baselineManifestSha256: 'a'.repeat(64),
    repositoryTreeSha256: 'b'.repeat(64),
  };
  const releaseManifest = {
    schemaVersion: 1,
    application: 'iot-platform',
    version: '0.0.1',
    revision: 'fixture',
    node: '>=22 <23',
    packageManager: null,
    entrypoint: 'dist/main.js',
    createdAt: new Date().toISOString(),
    sourceFingerprint,
    files: payload,
  };
  write('release-manifest.json', `${JSON.stringify(releaseManifest, null, 2)}\n`);

  const unapproved = run(true);
  expect(unapproved.status !== 0 && unapproved.output.includes('Production approval receipt is required'), 'Unapproved release was not rejected', unapproved.output);

  const receipt = {
    schemaVersion: 1,
    gate: 'PRODUCTION_RELEASE',
    status: 'APPROVED',
    approvedAt: new Date().toISOString(),
    releaseManifestSha256: sha256File(path.join(releaseRoot, 'release-manifest.json')),
    sourceFingerprint,
    evidenceSha256: 'c'.repeat(64),
    evidenceGeneratedAt: new Date().toISOString(),
    hardwareEvidence: {
      classification: 'SIMULATED_HARDWARE_LIVE_SERVICE',
      observedAt: new Date().toISOString(),
      summarySha256: 'd'.repeat(64),
      firmwareArtifactSha256: 'e'.repeat(64),
      sourceFingerprint: { ...sourceFingerprint },
    },
  };
  write('production-approval.json', `${JSON.stringify(receipt, null, 2)}\n`);
  const approved = run(true);
  expect(approved.status === 0, 'Valid simulated-hardware approval receipt was rejected', approved.output);

  receipt.hardwareEvidence.sourceFingerprint.repositoryTreeSha256 = '0'.repeat(64);
  write('production-approval.json', `${JSON.stringify(receipt, null, 2)}\n`);
  const wrongHardwareSource = run(true);
  expect(
    wrongHardwareSource.status !== 0 && wrongHardwareSource.output.includes('simulated-hardware source fingerprint mismatch'),
    'Simulated-hardware evidence from a different source baseline was not rejected',
    wrongHardwareSource.output,
  );
  receipt.hardwareEvidence.sourceFingerprint = { ...sourceFingerprint };

  receipt.releaseManifestSha256 = '0'.repeat(64);
  write('production-approval.json', `${JSON.stringify(receipt, null, 2)}\n`);
  const tampered = run(true);
  expect(tampered.status !== 0 && tampered.output.includes('not bound to this release manifest'), 'Tampered approval receipt was not rejected', tampered.output);

  receipt.releaseManifestSha256 = sha256File(path.join(releaseRoot, 'release-manifest.json'));
  write('production-approval.json', `${JSON.stringify(receipt, null, 2)}\n`);
  write('unexpected.bin', 'untracked\n');
  const untracked = run(true);
  expect(untracked.status !== 0 && untracked.output.includes('Untracked release file'), 'Untracked release file was not rejected after approval', untracked.output);
  unlinkSync(path.join(releaseRoot, 'unexpected.bin'));

  const digest = 'f'.repeat(64);
  const legacyReceipt = {
    ...receipt,
    hardwareEvidence: undefined,
    otaDigestVerification: {
      executedAt: new Date().toISOString(),
      deviceId: 'fixture-physical-device',
      artifactSha256: digest,
      deviceObservedSha256: digest,
    },
  };
  delete legacyReceipt.hardwareEvidence;
  write('production-approval.json', `${JSON.stringify(legacyReceipt, null, 2)}\n`);
  const legacyApproved = run(true);
  expect(legacyApproved.status === 0, 'Legacy physical OTA approval receipt compatibility was broken', legacyApproved.output);

  console.log('PASS  Missing production approval receipt is rejected.');
  console.log('PASS  Valid simulated-hardware manifest-bound approval receipt is accepted.');
  console.log('PASS  Simulated-hardware receipt from another source baseline is rejected.');
  console.log('PASS  Tampered approval receipt is rejected.');
  console.log('PASS  Untracked release files remain rejected after approval.');
  console.log('PASS  Legacy physical OTA approval receipt remains supported.');
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
