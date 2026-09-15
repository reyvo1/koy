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
  'expectPublishDeniedBounded',
  'observeSubscribeDenialBounded',
  'async function expectSubscribeDeniedFresh(',
  'async function expectPublishDeniedFresh(',
  "'publisher-negative-subscribe'",
  "'publisher-negative-publish'",
  "'cross-device-subscribe'",
  "'cross-device-publish'",
  "'wrong-device-ack-publish'",
  'activeMqttClients.add(client)',
  'await closeActiveMqttClients()',
  "brokerCheck('liveBroker.publisher-non-command-denied')",
];

for (const token of required) {
  if (!runner.includes(token)) {
    throw new Error(`live broker smoke hardening marker missing: ${token}`);
  }
}

function sourceSlice(startToken, endToken) {
  const start = runner.indexOf(startToken);
  const end = runner.indexOf(endToken, start + startToken.length);
  if (start < 0 || end < 0 || end <= start) {
    throw new Error(
      `live broker smoke fixture block missing: ${startToken} -> ${endToken}`,
    );
  }
  return runner.slice(start, end);
}

const capabilityFixture = sourceSlice(
  'const capability = (',
  'const capabilityArtifact =',
);
const dashboardFixture = sourceSlice(
  'const dashboard = (',
  "assert(dashboard?.id, 'Dashboard create response missing id');",
);

for (const token of [
  "key: 'power'",
  "dataType: 'boolean'",
  'isReadable: true',
  'isReportable: true',
]) {
  if (!capabilityFixture.includes(token)) {
    throw new Error(
      `live power capability contract marker missing: ${token}`,
    );
  }
}

for (const token of [
  "kind: 'CARD'",
  "intent: 'READ'",
  "mode: 'LATEST'",
  'capabilityId: capability.id',
]) {
  if (!dashboardFixture.includes(token)) {
    throw new Error(
      `live dashboard boolean-latest contract marker missing: ${token}`,
    );
  }
}

if (dashboardFixture.includes("kind: 'GAUGE'")) {
  throw new Error(
    'live dashboard fixture regressed to GAUGE for the boolean power capability',
  );
}

const child = spawnSync(
  process.execPath,
  [resolve(root, 'scripts/self-test-rescue-mqtt-operations.mjs')],
  { encoding: 'utf8' },
);
if (child.status !== 0) {
  throw new Error(
    `MQTT ACL-observation self-test failed:\n${child.stdout}\n${child.stderr}`,
  );
}
process.stdout.write(child.stdout);

if (/client\.subscribe\([^)]*\{ qos \}[^]*new Promise/.test(runner)) {
  throw new Error('unbounded inline MQTT subscribe implementation remains');
}
if (/client\.publish\([^)]*\{ qos \}[^]*new Promise/.test(runner)) {
  throw new Error('unbounded inline MQTT publish implementation remains');
}

const forbiddenPatterns = [
  'expectSubscribeDenied(\n    negativePublisher',
  'mqttPublish(\n      negativePublisher',
  'expectSubscribeDenied(\n    deviceAClient',
  'mqttPublish(\n      deviceAClient,\n      crossTelemetryTopic',
  'mqttPublish(\n      deviceBClient,\n      ackTopicA',
  'if (isMqttOperationTimeout(error)) throw error',
];
for (const pattern of forbiddenPatterns) {
  if (runner.includes(pattern)) {
    throw new Error(
      `negative ACL client-reuse/timeout inference pattern remains: ${pattern}`,
    );
  }
}

console.log('PASS  live broker smoke uses bounded MQTT operations');
console.log('PASS  negative ACL subscribe/publish checks use fresh one-shot clients');
console.log('PASS  explicit MQTT denial signals are required before negative ACL PASS');
console.log('PASS  close-only and timeout paths remain fail-closed');
console.log('PASS  primary positive MQTT clients are not sacrificed to disconnect-on-deny checks');
console.log('PASS  all connected MQTT clients are tracked for final cleanup');
console.log('PASS  live dashboard fixture matches boolean CARD/LATEST resolver semantics');
console.log('RESCUE LIVE BROKER SMOKE SELF-TEST PASS');
