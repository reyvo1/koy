#!/usr/bin/env node
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = path.resolve(import.meta.dirname, '..');
const verifier = path.join(repoRoot, 'scripts', 'verify-simulated-hardware-uat.mjs');
const root = mkdtempSync(path.join(tmpdir(), 'iot-sim-hw-uat-'));
const writeJson = (rel, value) => {
  const file = path.join(root, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
};
const run = () => spawnSync(process.execPath, [verifier, `--root=${root}`], { encoding: 'utf8' });
const expect = (condition, message) => { if (!condition) throw new Error(message); };

try {
  writeFileSync(path.join(root, 'package-lock.json'), '{\"lockfileVersion\":3}\n');
  writeFileSync(path.join(root, 'BASELINE-MANIFEST.sha256'), 'fixture baseline\n');
  writeFileSync(path.join(root, 'repository-tree.txt'), 'fixture tree\n');
  writeJson('reports/wave3/wave3-esp32-simulation-fixture.json', {
    classification: 'SIMULATED_HARDWARE_LIVE_SERVICE',
    device: { provisioning: 'PASS', heartbeat: 'PASS', wifiMqttReconnect: 'PASS', coldBootRejoin: 'PASS' },
    mqtt: { initialTelemetry: 'PASS', postReconnectTelemetry: 'PASS', coldBootTelemetry: 'PASS', qos1DuplicateTelemetryDedupe: 'PASS', commandAck: 'PASS', duplicateCommandExecutionCount: 1, duplicateAckReplays: 1 },
    ota: { artifactSha256: 'a'.repeat(64), trustedHttps: 'PASS', wrongDigestRejected: 'PASS', interruptedStreamRejected: 'PASS', rollbackModel: 'PASS', liveReconnectConfirmationModel: 'PASS' },
  });
  writeJson('reports/live-broker-smoke-fixture/live-broker-summary.json', { details: { status: 'PASS', mode: 'ci-smoke' } });
  writeJson('reports/simulated-hardware-uat/camera.json', { status: 'PASS', evidenceClass: 'SIMULATED_HARDWARE' });
  writeJson('reports/simulated-hardware-uat/media.json', { status: 'PASS', evidenceClass: 'SIMULATED_HARDWARE' });

  let result = run();
  expect(result.status === 0 && /SIMULATED HARDWARE UAT PASS/.test(result.stdout), `valid fixture failed: ${result.stderr || result.stdout}`);
  console.log('PASS  complete simulated-hardware evidence set is accepted');
  expect(JSON.parse(readFileSync(path.join(root, 'reports/simulated-hardware-uat/summary.json'), 'utf8')).status === 'PASS', 'summary receipt was not written');
  console.log('PASS  combined UAT receipt is emitted');

  writeJson('reports/simulated-hardware-uat/camera.json', { status: 'FAIL', evidenceClass: 'SIMULATED_HARDWARE' });
  result = run();
  expect(result.status !== 0 && /camera onboarding/.test(result.stderr), 'failed camera evidence must fail closed');
  console.log('PASS  a failed simulated camera cannot be promoted to UAT PASS');

  console.log('SIMULATED HARDWARE UAT SELF-TEST PASS');
} finally {
  rmSync(root, { recursive: true, force: true });
}
