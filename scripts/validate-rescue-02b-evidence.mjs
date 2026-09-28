#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const fileArg = argv.find((value) => value.startsWith('--file='));

const REQUIRED_RUNTIME_FLOW = [
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

const REQUIRED_BROKER = [
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

const REQUIRED_HARDWARE = [
  'esp-idf-compile',
  'provision-and-reboot-persistence',
  'tls-api-and-mqtt-validation',
  'wifi-loss-reconnect',
  'mqtt-reconnect-qos1-dedupe',
  'physical-telemetry-command-ack-heartbeat',
];

const REQUIRED_AUTOMATED_STEPS = [
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

const SECRET_KEY_PATTERN = /(password|secret|token|private[_-]?key|credential[_-]?value)/i;
const failures = [];

function fail(message) {
  failures.push(message);
}

function loadJson(file, label) {
  if (!existsSync(file)) {
    fail(`${label} not found: ${file}`);
    return null;
  }
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    fail(`${label} is not valid JSON: ${error.message}`);
    return null;
  }
}

function sha256File(file) {
  if (!existsSync(file)) return null;
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function validTimestamp(value) {
  if (typeof value !== 'string' || value.length === 0) return false;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return false;
  return time <= Date.now() + 5 * 60 * 1000;
}

function meaningfulEvidence(value) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed.length < 8) return false;
  return !/^(pass|passed|ok|done|n\/a|na|todo|pending|none)$/i.test(trimmed);
}

// A version string is a legitimate concrete value and is often shorter than 8 chars
// ("5.9.2" is EMQX 5.9.2). Length-gate it separately so a real, verified broker version
// is not rejected while free-text placeholders still fail.
function meaningfulVersion(value) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed.length < 3) return false;
  return /^\d+\.\d+(\.\d+)?([-+][0-9A-Za-z.-]+)?$/.test(trimmed);
}

function resolveEvidenceArtifact(reference) {
  const relative = path.resolve(path.dirname(evidencePath), reference);
  return existsSync(relative) ? relative : path.resolve(reference);
}

function validateEvidenceArtifact(sectionName, checkId, evidenceValue) {
  const label = `${sectionName}.${checkId}.evidence`;
  if (!evidenceValue || typeof evidenceValue !== 'object' || Array.isArray(evidenceValue)) {
    fail(`${label} must be an artifact reference object, not free text.`);
    return;
  }
  if (!meaningfulEvidence(evidenceValue.artifactPath)) {
    fail(`${label}.artifactPath must reference a concrete evidence artifact.`);
    return;
  }
  if (!meaningfulEvidence(evidenceValue.note)) {
    fail(`${label}.note must describe what the artifact proves.`);
  }
  if (!/^[a-f0-9]{64}$/i.test(evidenceValue.artifactSha256 ?? '')) {
    fail(`${label}.artifactSha256 must be a SHA-256 digest.`);
    return;
  }
  const artifact = resolveEvidenceArtifact(evidenceValue.artifactPath);
  if (!existsSync(artifact) || !statSync(artifact).isFile()) {
    fail(`${label} artifact file is missing: ${evidenceValue.artifactPath}.`);
    return;
  }
  const actual = sha256File(artifact);
  if (actual?.toLowerCase() !== evidenceValue.artifactSha256.toLowerCase()) {
    fail(`${label} SHA-256 does not match artifact bytes.`);
  }
}

function validateChecks(sectionName, section, requiredIds, automatedGeneratedAt) {
  if (!section || typeof section !== 'object') {
    fail(`${sectionName} section is missing.`);
    return;
  }
  if (!validTimestamp(section.executedAt)) {
    fail(`${sectionName}.executedAt must be a real, non-future ISO timestamp.`);
  } else if (automatedGeneratedAt && Date.parse(section.executedAt) < Date.parse(automatedGeneratedAt)) {
    fail(`${sectionName}.executedAt must not predate the automated full-suite report.`);
  }
  if (!Array.isArray(section.checks)) {
    fail(`${sectionName}.checks must be an array.`);
    return;
  }

  const byId = new Map();
  for (const row of section.checks) {
    if (!row || typeof row.id !== 'string') continue;
    if (byId.has(row.id)) fail(`${sectionName} contains duplicate check id ${row.id}.`);
    byId.set(row.id, row);
  }

  for (const id of requiredIds) {
    const row = byId.get(id);
    if (!row) {
      fail(`${sectionName} is missing required check ${id}.`);
      continue;
    }
    if (row.status !== 'PASS') {
      fail(`${sectionName}.${id} must be PASS; got ${row.status ?? 'missing'}.`);
      continue;
    }
    validateEvidenceArtifact(sectionName, id, row.evidence);
  }
}

function scanSecretKeys(value, trail = '$') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanSecretKeys(item, `${trail}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    const childTrail = `${trail}.${key}`;
    if (SECRET_KEY_PATTERN.test(key)) {
      fail(`Evidence must not contain secret-bearing key ${childTrail}.`);
    }
    scanSecretKeys(child, childTrail);
  }
}

if (!fileArg) {
  console.error('Usage: node scripts/validate-rescue-02b-evidence.mjs --file=<evidence.json>');
  process.exit(2);
}

const evidencePath = path.resolve(fileArg.slice('--file='.length));
const evidence = loadJson(evidencePath, 'RESCUE-02B evidence');
if (!evidence) {
  console.error(`Result: BLOCKED (${failures.length} issue(s))`);
  failures.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}

if (evidence.schemaVersion !== 2) fail(`schemaVersion must be 2; got ${evidence.schemaVersion}.`);
if (!validTimestamp(evidence.generatedAt)) fail('generatedAt must be a real, non-future ISO timestamp.');
if (evidence.gate !== 'RESCUE-02B') fail(`gate must be RESCUE-02B; got ${evidence.gate}.`);
scanSecretKeys(evidence);

const automatedPath = path.resolve(path.dirname(evidencePath), evidence.automatedReport ?? '');
const fallbackAutomatedPath = path.resolve(evidence.automatedReport ?? '');
const resolvedAutomatedPath = existsSync(automatedPath) ? automatedPath : fallbackAutomatedPath;
const automated = loadJson(resolvedAutomatedPath, 'Automated acceptance report');
if (automated) {
  if (automated.schemaVersion !== 1) fail('Automated acceptance report schemaVersion must be 1.');
  if (automated.mode !== 'full') fail(`Automated acceptance report must be mode=full; got ${automated.mode}.`);
  if (automated.status !== 'AUTOMATED_TEST_SUITE_PASS') {
    fail(`Automated acceptance status must be AUTOMATED_TEST_SUITE_PASS; got ${automated.status}.`);
  }
  if (!validTimestamp(automated.generatedAt)) {
    fail('Automated acceptance report generatedAt must be a real, non-future ISO timestamp.');
  }
  if (!Array.isArray(automated.steps)) {
    fail('Automated acceptance report steps must be an array.');
  } else {
    const stepByName = new Map(automated.steps.map((step) => [step?.name, step]));
    for (const name of REQUIRED_AUTOMATED_STEPS) {
      const step = stepByName.get(name);
      if (!step) {
        fail(`Automated acceptance report is missing required successful step: ${name}.`);
        continue;
      }
      if (step.pass !== true || step.exitCode !== 0) {
        fail(`Automated acceptance step ${name} must have pass=true and exitCode=0.`);
      }
      if (!validTimestamp(step.startedAt) || !validTimestamp(step.endedAt)) {
        fail(`Automated acceptance step ${name} must contain valid startedAt/endedAt timestamps.`);
      } else if (Date.parse(step.endedAt) < Date.parse(step.startedAt)) {
        fail(`Automated acceptance step ${name} endedAt precedes startedAt.`);
      }
    }
  }

  const expectedFiles = {
    packageLockSha256: 'package-lock.json',
    baselineManifestSha256: 'BASELINE-MANIFEST.sha256',
    repositoryTreeSha256: 'repository-tree.txt',
  };
  for (const [field, file] of Object.entries(expectedFiles)) {
    const expected = sha256File(path.resolve(file));
    const observed = automated.sourceFingerprint?.[field];
    if (!expected) {
      fail(`Current source fingerprint file is missing: ${file}.`);
    } else if (observed !== expected) {
      fail(`Automated report ${field} does not match the current source baseline.`);
    }
  }
}

if (!meaningfulEvidence(evidence.runtimeFlow?.environment)) {
  fail('runtimeFlow.environment must identify the tested runtime environment without secrets.');
}
validateChecks('runtimeFlow', evidence.runtimeFlow, REQUIRED_RUNTIME_FLOW, automated?.generatedAt);

if (!meaningfulVersion(evidence.liveBroker?.emqxVersion)) {
  fail('liveBroker.emqxVersion must record the broker version actually tested.');
}
validateChecks('liveBroker', evidence.liveBroker, REQUIRED_BROKER, automated?.generatedAt);

if (!meaningfulEvidence(evidence.physicalEsp32?.boardModel)) {
  fail('physicalEsp32.boardModel must identify the physical board model tested.');
}
if (!meaningfulEvidence(evidence.physicalEsp32?.espIdfVersion)) {
  fail('physicalEsp32.espIdfVersion must record the ESP-IDF version used for the physical test.');
}
validateChecks('physicalEsp32', evidence.physicalEsp32, REQUIRED_HARDWARE, automated?.generatedAt);

const ota = evidence.productionOnly?.otaDigestVerification;
if (!ota || !['DEFERRED', 'PASS'].includes(ota.status)) {
  fail('productionOnly.otaDigestVerification.status must be DEFERRED or PASS.');
} else if (!meaningfulEvidence(ota.evidence)) {
  fail('productionOnly.otaDigestVerification requires concrete evidence/reason.');
}

if (ota?.status === 'PASS') {
  if (!validTimestamp(ota.executedAt)) {
    fail('productionOnly.otaDigestVerification.executedAt must be a real, non-future ISO timestamp when status=PASS.');
  }
  const shaPattern = /^[a-f0-9]{64}$/i;
  if (!shaPattern.test(ota.artifactSha256 ?? '')) {
    fail('productionOnly.otaDigestVerification.artifactSha256 must be a SHA-256 digest when status=PASS.');
  }
  if (!shaPattern.test(ota.deviceObservedSha256 ?? '')) {
    fail('productionOnly.otaDigestVerification.deviceObservedSha256 must be a SHA-256 digest when status=PASS.');
  }
  if (
    shaPattern.test(ota.artifactSha256 ?? '') &&
    shaPattern.test(ota.deviceObservedSha256 ?? '') &&
    ota.artifactSha256.toLowerCase() !== ota.deviceObservedSha256.toLowerCase()
  ) {
    fail('OTA artifact SHA-256 and device-observed SHA-256 must match.');
  }
  if (!meaningfulEvidence(ota.deviceId)) {
    fail('productionOnly.otaDigestVerification.deviceId must identify the physical device when status=PASS.');
  }
  if (!meaningfulEvidence(ota.artifactPath)) {
    fail('productionOnly.otaDigestVerification.artifactPath must reference the tested firmware bytes when status=PASS.');
  } else {
    const relativeArtifact = path.resolve(path.dirname(evidencePath), ota.artifactPath);
    const fallbackArtifact = path.resolve(ota.artifactPath);
    const artifactPath = existsSync(relativeArtifact) ? relativeArtifact : fallbackArtifact;
    if (!existsSync(artifactPath) || !statSync(artifactPath).isFile()) {
      fail(`OTA artifact file is missing: ${ota.artifactPath}.`);
    } else {
      const observedArtifactSha = sha256File(artifactPath);
      if (
        shaPattern.test(ota.artifactSha256 ?? '') &&
        observedArtifactSha?.toLowerCase() !== ota.artifactSha256.toLowerCase()
      ) {
        fail('OTA artifact file bytes do not match productionOnly.otaDigestVerification.artifactSha256.');
      }
    }
  }
}

if (failures.length > 0) {
  console.error(`Result: RESCUE-02B EVIDENCE BLOCKED (${failures.length} issue(s))`);
  failures.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}

console.log('PASS  Automated full-suite report is green and bound to the current source fingerprint.');
console.log('PASS  Live runtime vertical-flow evidence is complete.');
console.log('PASS  EMQX auth/ACL/webhook negative-flow evidence is complete.');
console.log('PASS  Physical ESP32 core-flow evidence is complete.');
console.log(`INFO  OTA production-only status: ${ota.status}.`);
console.log('Result: RESCUE-02B EVIDENCE PASS');
