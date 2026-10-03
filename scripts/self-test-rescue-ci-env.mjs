#!/usr/bin/env node
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const fixture = mkdtempSync(path.join(tmpdir(), 'iot-rescue-ci-env-'));
try {
  const envFile = path.join(fixture, '.env');
  const githubEnv = path.join(fixture, 'github-env');
  writeFileSync(envFile, [
    'PORT=4321',
    'DATABASE_URL=postgresql://iot:secret-db@127.0.0.1:5432/iot',
    'TEST_DATABASE_URL=postgresql://iot:secret-test@127.0.0.1:5432/iot',
    '',
  ].join('\n'));
  writeFileSync(githubEnv, '');
  const result = spawnSync(process.execPath, [path.join(root, 'scripts/export-rescue-ci-env.mjs'), `--env=${envFile}`], {
    cwd: root,
    env: { ...process.env, GITHUB_ENV: githubEnv },
    encoding: 'utf8',
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'exporter failed');
  const exported = readFileSync(githubEnv, 'utf8');
  for (const expected of [
    'DATABASE_URL=postgresql://iot:secret-db@127.0.0.1:5432/iot',
    'TEST_DATABASE_URL=postgresql://iot:secret-test@127.0.0.1:5432/iot',
    'IOT_API=http://127.0.0.1:4321',
    'PROBE_BASE=http://127.0.0.1:4321',
    'PROBE_API_BASE=http://127.0.0.1:4321',
  ]) {
    if (!exported.includes(expected)) throw new Error(`missing exported runtime key: ${expected.split('=')[0]}`);
  }
  const combinedOutput = `${result.stdout}\n${result.stderr}`;
  if (combinedOutput.includes('secret-db') || combinedOutput.includes('secret-test')) {
    throw new Error('exporter printed a database secret');
  }
  console.log('PASS  generated rescue env is exported to later GitHub steps without printing database secrets');
  const probeFiles = [
    'scripts/probe-device-location.py', 'scripts/probe-webhook-event-vocabulary.sh',
    'scripts/probe-capability-template-lifecycle.mts', 'scripts/run-noc-probe.sh',
    'scripts/run-mobile-notification-probe.sh', 'scripts/probe-device-maintenance.py',
    'scripts/probe-mqtt-management.mts', 'scripts/run-saved-reports-probe.sh',
    'scripts/run-device-maintenance-probe.sh', 'scripts/probe-billing-cycle.py',
    'scripts/probe-noc-operations.mts', 'scripts/probe-saved-reports.mts',
    'scripts/probe-device-command-log.py', 'scripts/probe-notification-writers.py',
    'scripts/run-billing-probe.sh', 'scripts/probe-public-api-sdk.mts',
    'scripts/run-mqtt-management-probe.sh', 'scripts/probe-camera-onboarding.py',
  ];
  for (const rel of probeFiles) {
    const source = readFileSync(path.join(root, rel), 'utf8');
    if (source.includes('http://127.0.0.1:5000')) throw new Error(`stale rescue probe port remains in ${rel}`);
  }
  console.log('PASS  Wave 4-9 rescue probes no longer carry a stale 5000 fallback');
  console.log('RESCUE CI ENV SELF-TEST PASS');
} finally {
  rmSync(fixture, { recursive: true, force: true });
}
