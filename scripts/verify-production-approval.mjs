#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const argv = process.argv.slice(2);
const evidenceArg = argv.find((value) => value.startsWith('--evidence='));
const releaseArg = argv.find((value) => value.startsWith('--release='));
const simulatedHardwareArg = argv.find((value) => value.startsWith('--simulated-hardware='));
const simulatedHardwarePath = simulatedHardwareArg ? path.resolve(simulatedHardwareArg.slice('--simulated-hardware='.length)) : null;
const evidencePath = evidenceArg ? path.resolve(evidenceArg.slice('--evidence='.length)) : null;
const releaseRoot = path.resolve(
  releaseArg ? releaseArg.slice('--release='.length) : process.env.RELEASE_OUTPUT_DIR ?? 'artifacts/iot-platform-release',
);

function block(message, detail = '') {
  console.error(`BLOCKED  ${message}`);
  if (detail) console.error(detail);
  process.exit(1);
}

function loadJson(file, label) {
  if (!existsSync(file)) block(`${label} is missing: ${file}`);
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    block(`${label} is not valid JSON: ${error.message}`);
  }
}

function sha256File(file) {
  if (!existsSync(file) || !statSync(file).isFile()) return null;
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

if (!evidencePath) {
  block('Production approval requires --evidence=<validated RESCUE-02B evidence.json>.');
}

const evidenceValidation = spawnSync(
  process.execPath,
  [
    'scripts/validate-rescue-02b-evidence.mjs',
    `--file=${evidencePath}`,
    ...(simulatedHardwarePath ? [`--simulated-hardware=${simulatedHardwarePath}`] : []),
  ],
  { cwd: root, encoding: 'utf8', windowsHide: true },
);
if (evidenceValidation.status !== 0) {
  block(
    'RESCUE-02B evidence is not valid for the current source baseline.',
    `${evidenceValidation.stdout ?? ''}${evidenceValidation.stderr ?? ''}`.trim(),
  );
}

const evidence = loadJson(evidencePath, 'RESCUE-02B evidence');
const ota = evidence.productionOnly?.otaDigestVerification;
const simulatedHardware = simulatedHardwarePath ? loadJson(simulatedHardwarePath, 'Simulated hardware UAT summary') : null;
if (!simulatedHardware && ota?.status !== 'PASS') {
  block(`Production hardware gate needs either --simulated-hardware=<PASS summary> or legacy physical OTA PASS; got OTA ${ota?.status ?? 'missing'}.`);
}

const releaseManifestPath = path.resolve(releaseRoot, 'release-manifest.json');
const releaseValidation = spawnSync(process.execPath, ['scripts/verify-production-release.mjs'], {
  cwd: root,
  env: { ...process.env, RELEASE_OUTPUT_DIR: releaseRoot },
  encoding: 'utf8',
  windowsHide: true,
});
if (releaseValidation.status !== 0) {
  block(
    'Production release artifact integrity verification failed.',
    `${releaseValidation.stdout ?? ''}${releaseValidation.stderr ?? ''}`.trim(),
  );
}
const releaseManifest = loadJson(releaseManifestPath, 'Release manifest');

const currentFingerprint = {
  packageLockSha256: sha256File(path.resolve(root, 'package-lock.json')),
  baselineManifestSha256: sha256File(path.resolve(root, 'BASELINE-MANIFEST.sha256')),
  repositoryTreeSha256: sha256File(path.resolve(root, 'repository-tree.txt')),
};
for (const [field, expected] of Object.entries(currentFingerprint)) {
  if (!expected) block(`Current source fingerprint input is missing for ${field}.`);
  const observed = releaseManifest.sourceFingerprint?.[field];
  if (observed !== expected) {
    block(`Release ${field} does not match the current sealed source baseline.`);
  }
  if (simulatedHardware && simulatedHardware.sourceFingerprint?.[field] !== expected) {
    block(`Simulated hardware UAT ${field} does not match the current sealed source baseline.`);
  }
}


const approvalPath = path.resolve(releaseRoot, 'production-approval.json');
const approvalReceipt = {
  schemaVersion: 1,
  gate: 'PRODUCTION_RELEASE',
  status: 'APPROVED',
  approvedAt: new Date().toISOString(),
  releaseManifestSha256: sha256File(releaseManifestPath),
  sourceFingerprint: { ...releaseManifest.sourceFingerprint },
  evidenceSha256: sha256File(evidencePath),
  evidenceGeneratedAt: evidence.generatedAt,
  ...(simulatedHardware
    ? {
        hardwareEvidence: {
          classification: 'SIMULATED_HARDWARE_LIVE_SERVICE',
          observedAt: simulatedHardware.observedAt,
          summarySha256: sha256File(simulatedHardwarePath),
          firmwareArtifactSha256: simulatedHardware.firmwareArtifactSha256,
          sourceFingerprint: { ...simulatedHardware.sourceFingerprint },
        },
      }
    : {
        otaDigestVerification: {
          executedAt: ota.executedAt,
          deviceId: ota.deviceId,
          artifactSha256: ota.artifactSha256,
          deviceObservedSha256: ota.deviceObservedSha256,
        },
      }),
};
writeFileSync(approvalPath, `${JSON.stringify(approvalReceipt, null, 2)}\n`, { mode: 0o640 });

const approvedValidation = spawnSync(
  process.execPath,
  ['scripts/verify-production-release.mjs', '--require-approved'],
  {
    cwd: root,
    env: { ...process.env, RELEASE_OUTPUT_DIR: releaseRoot },
    encoding: 'utf8',
    windowsHide: true,
  },
);
if (approvedValidation.status !== 0) {
  try { unlinkSync(approvalPath); } catch {}
  block(
    'Production approval receipt failed post-write verification.',
    `${approvedValidation.stdout ?? ''}${approvedValidation.stderr ?? ''}`.trim(),
  );
}

console.log('PASS  RESCUE-02B evidence is valid and source-bound.');
console.log(simulatedHardware ? 'PASS  Simulated-hardware UAT receipt is source-bound and firmware-SHA-bound.' : 'PASS  Legacy physical OTA artifact-byte/device digest evidence is validated.');
console.log('PASS  Release artifact manifest covers the exact packaged file set.');
console.log('PASS  Release source fingerprint matches the current sealed baseline.');
console.log(`PASS  Production approval receipt written and re-verified: ${approvalPath}`);
console.log('Result: PRODUCTION APPROVAL EVIDENCE PASS');
