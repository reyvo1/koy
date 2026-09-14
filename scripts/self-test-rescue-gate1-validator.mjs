#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const sourceRoot = path.resolve(import.meta.dirname, '..');
const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'iot-gate1-validator-'));

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function write(relative, content) {
  const file = path.join(fixtureRoot, relative);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
  return file;
}

function pass(message) {
  console.log(`PASS  ${message}`);
}

function fail(message, detail = '') {
  console.error(`FAIL  ${message}`);
  if (detail) console.error(detail.slice(-2500));
  process.exitCode = 1;
}

try {
  mkdirSync(path.join(fixtureRoot, 'scripts'), { recursive: true });
  cpSync(
    path.join(sourceRoot, 'scripts/validate-rescue-gate1-receipt.mjs'),
    path.join(fixtureRoot, 'scripts/validate-rescue-gate1-receipt.mjs'),
  );

  write('package-lock.json', '{"lockfileVersion":3}\n');
  write('BASELINE-MANIFEST.sha256', 'fixture baseline manifest\n');
  write('repository-tree.txt', 'fixture repository tree\n');
  write('.env', 'RESCUE_MQTT_HOST_PORT=18884\n');

  const sourceFingerprint = {
    packageLockSha256: sha256(path.join(fixtureRoot, 'package-lock.json')),
    baselineManifestSha256: sha256(path.join(fixtureRoot, 'BASELINE-MANIFEST.sha256')),
    repositoryTreeSha256: sha256(path.join(fixtureRoot, 'repository-tree.txt')),
  };

  const runtimeState = {
    schemaVersion: 3,
    status: 'CORE_RUNTIME_READY_LIVE_BROKER_EVIDENCE_PENDING',
    envPath: path.join(fixtureRoot, '.env'),
    mqttHostPort: 18884,
    mqttHostUrl: 'mqtt://127.0.0.1:18884',
    sourceFingerprint,
  };
  write('reports/local-runtime/state.json', `${JSON.stringify(runtimeState, null, 2)}\n`);

  const receipt = {
    schemaVersion: 1,
    gate: 'GATE_1_DEPENDENCY_RUNTIME_BRINGUP',
    status: 'PASS',
    generatedAt: new Date().toISOString(),
    topology: 'local',
    environmentFile: '.env',
    sourceFingerprint,
    bootstrap: { status: 'READY' },
    runtimePreflight: { ready: true, blockerCount: 0, probeScope: 'full' },
    runtimeState,
    steps: [],
  };
  write('reports/gate1/gate1-fixture.json', `${JSON.stringify(receipt, null, 2)}\n`);

  write(
    'scripts/diagnose-rescue-bootstrap.mjs',
    `import { writeFileSync } from 'node:fs';\n` +
      `const jsonArg = process.argv.find((value) => value.startsWith('--json='));\n` +
      `if (!jsonArg) process.exit(2);\n` +
      `writeFileSync(jsonArg.slice('--json='.length), JSON.stringify({ status: 'READY' }));\n`,
  );

  write(
    'scripts/check-rescue-runtime.mjs',
    `const expectedUrl = 'mqtt://127.0.0.1:18884';\n` +
      `const expectedPort = '18884';\n` +
      `if (process.env.RESCUE_MQTT_BROKER_URL !== expectedUrl || process.env.RESCUE_MQTT_HOST_PORT !== expectedPort) {\n` +
      `  console.error('dedicated rescue MQTT endpoint was not propagated');\n` +
      `  process.exit(9);\n` +
      `}\n` +
      `process.stdout.write(JSON.stringify({ ready: true, blockerCount: 0 }));\n`,
  );

  const result = spawnSync(
    process.execPath,
    ['scripts/validate-rescue-gate1-receipt.mjs'],
    {
      cwd: fixtureRoot,
      encoding: 'utf8',
      windowsHide: true,
    },
  );

  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  if (result.status !== 0) {
    fail('Gate 1 validator executes end-to-end without block-scope ReferenceError', output);
  } else if (!output.includes('PASS  Gate 2 entry is permitted.')) {
    fail('Gate 1 validator reaches the explicit Gate 2 permit boundary', output);
  } else {
    pass('Gate 1 validator executes end-to-end without block-scope ReferenceError');
    pass('Gate 1 validator propagates the source-bound dedicated rescue MQTT endpoint into live revalidation');
  }
} finally {
  rmSync(fixtureRoot, { recursive: true, force: true });
}
