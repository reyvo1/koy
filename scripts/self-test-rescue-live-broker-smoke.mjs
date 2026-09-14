#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const runner = readFileSync(
  resolve(root, 'scripts/run-rescue-live-broker-smoke.mjs'),
  'utf8',
);

const required = [
  "from './lib/rescue-mqtt-operations.mjs'",
  'activeMqttClients.add(client)',
  'await closeActiveMqttClients()',
  "brokerCheck('liveBroker.publisher-non-command-denied')",
  'if (isMqttOperationTimeout(error)) throw error',
];

for (const token of required) {
  if (!runner.includes(token)) {
    throw new Error(`live broker smoke hardening marker missing: ${token}`);
  }
}

const child = spawnSync(
  process.execPath,
  [resolve(root, 'scripts/self-test-rescue-mqtt-operations.mjs')],
  { encoding: 'utf8' },
);
if (child.status !== 0) {
  throw new Error(
    `MQTT bounded-operation self-test failed:\n${child.stdout}\n${child.stderr}`,
  );
}
process.stdout.write(child.stdout);

if (/client\.subscribe\([^)]*\{ qos \}[^]*new Promise/.test(runner)) {
  throw new Error('unbounded inline MQTT subscribe implementation remains');
}
if (/client\.publish\([^)]*\{ qos \}[^]*new Promise/.test(runner)) {
  throw new Error('unbounded inline MQTT publish implementation remains');
}

console.log('PASS  live broker smoke uses bounded MQTT operations');
console.log('PASS  negative ACL timeouts cannot be misreported as denial');
console.log('PASS  all connected MQTT clients are tracked for final cleanup');
console.log('RESCUE LIVE BROKER SMOKE SELF-TEST PASS');
