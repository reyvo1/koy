#!/usr/bin/env node
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { mqttPublisherRecoveryState } from './probe-runtime-contract.mjs';

const root = path.resolve(import.meta.dirname, '..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');

function assert(condition, message, detail = '') {
  if (!condition) throw new Error(`FAIL  ${message}${detail ? ` — ${detail}` : ''}`);
  console.log(`PASS  ${message}`);
}

const pkg = JSON.parse(read('package.json'));
const workflow = read('.github/workflows/ci.yml');
const common = read('scripts/probe-common.sh');
const seed = read('scripts/seed-demo-accounts.mjs');

const canonicalScripts = {
  'wave4:staging:probe': 'bash scripts/run-wave4-staging-probes.sh',
  'wave5:public-api:probe': 'bash scripts/run-wave5-public-api-probes.sh',
  'wave6:management:probe': 'bash scripts/run-wave6-management-probes.sh',
  'wave7:operations:probe': 'bash scripts/run-wave7-operations-probes.sh',
  'wave8:billing:probe': 'bash scripts/run-billing-probe.sh',
  'wave9:simulated-hardware:probe': 'bash scripts/run-wave9-simulated-hardware-probes.sh',
};
for (const [name, command] of Object.entries(canonicalScripts)) {
  assert(pkg.scripts?.[name] === command, `${name} is a canonical package entrypoint`);
}

assert(
  pkg.scripts?.['live-probe:contracts:self-test'] ===
    'node scripts/self-test-live-probe-contracts.mjs',
  'cross-wave live-probe contract self-test is package-exposed',
);
assert(
  pkg.scripts?.['wave1:prepush:check']?.includes('live-probe:contracts:self-test'),
  'local pre-push runs the cross-wave live-probe contract self-test',
);
assert(
  workflow.includes('npm run live-probe:contracts:self-test'),
  'core GitHub CI runs the cross-wave live-probe contract self-test',
);

for (const token of [
  'npm run wave4:staging:probe',
  'npm run wave5:public-api:probe',
  'npm run wave6:management:probe',
  'npm run wave7:operations:probe',
  'npm run wave8:billing:probe',
  'npm run wave9:simulated-hardware:probe',
]) {
  assert(workflow.includes(token), `GitHub live acceptance uses canonical ${token}`);
}

const wave6 = read('scripts/run-wave6-management-probes.sh');
for (const child of [
  'run-capability-template-probe.sh',
  'run-saved-reports-probe.sh',
  'run-mqtt-management-probe.sh',
  'run-noc-probe.sh',
]) {
  assert(wave6.includes(child), `Wave 6 aggregate still executes ${child}`);
}
assert(
  wave6.includes('probe_export_demo_admin_env') &&
    ['CAPABILITY_STATUS', 'REPORTS_STATUS', 'MQTT_STATUS', 'NOC_STATUS'].every((token) =>
      wave6.includes(token),
    ),
  'Wave 6 seeds once and aggregates all management-probe failures',
);

assert(
  common.includes('probe_export_demo_admin_env()') &&
    common.includes('--credentials-file=$credential_file') &&
    common.includes('--quiet >/dev/null'),
  'Wave 6 demo credentials are exchanged through a file without credential-bearing stdout',
);
assert(
  seed.includes("optionValue('credentials-file')") &&
    seed.includes("process.argv.includes('--quiet')") &&
    seed.includes('{ mode: 0o600 }') &&
    seed.includes('chmodSync(credentialsFile, 0o600)'),
  'demo seeder supports a 0600 machine-readable credential file and quiet mode',
);

const wave6Wrappers = [
  'scripts/run-capability-template-probe.sh',
  'scripts/run-saved-reports-probe.sh',
  'scripts/run-mqtt-management-probe.sh',
  'scripts/run-noc-probe.sh',
];
for (const rel of wave6Wrappers) {
  const source = read(rel);
  assert(source.includes('probe_export_demo_admin_env'), `${rel} consumes the shared demo credential contract`);
  assert(!source.includes('SEED_OUT='), `${rel} no longer parses credential-bearing seed stdout`);
  assert(!source.includes('could not read both passwords from one seed run'), `${rel} no longer has the old secret-leak error branch`);
}

for (const rel of ['scripts/run-capability-template-probe.sh', 'scripts/run-saved-reports-probe.sh']) {
  const source = read(rel);
  assert(
    source.includes('-v ON_ERROR_STOP=1'),
    `${rel} cleanup fails closed on SQL errors instead of accepting psql continuation`,
  );
}

const uatWrappers = [
  'scripts/run-wave5-public-api-probes.sh',
  'scripts/run-mobile-notification-probe.sh',
  'scripts/run-device-maintenance-probe.sh',
  'scripts/run-billing-probe.sh',
  'scripts/run-camera-probe.sh',
  'scripts/run-device-location-probe.sh',
];
for (const rel of uatWrappers) {
  const source = read(rel);
  assert(source.includes('probe-common.sh'), `${rel} uses the shared UAT helper`);
}
for (const rel of [
  'scripts/run-mobile-notification-probe.sh',
  'scripts/run-device-maintenance-probe.sh',
  'scripts/run-billing-probe.sh',
  'scripts/run-camera-probe.sh',
  'scripts/run-device-location-probe.sh',
]) {
  const source = read(rel);
  assert(source.includes('probe_login "$API" "$CREDS"'), `${rel} uses the shared UAT login function`);
  assert(!source.includes("awk '/uat.admin@iot.local"), `${rel} has no private copy of the UAT password parser`);
}

for (const rel of ['scripts/run-device-maintenance-probe.sh', 'scripts/run-billing-probe.sh']) {
  const source = read(rel);
  assert(
    source.includes('PROBE_STATUS=0') &&
      source.includes('|| PROBE_STATUS=$?') &&
      source.indexOf('|| PROBE_STATUS=$?') < source.lastIndexOf('cleanup.sql') &&
      source.includes('if [ "$PROBE_STATUS" -eq 0 ]'),
    `${rel} preserves the probe failure while still running cleanup`,
  );
}

const mqttProbe = read('scripts/probe-mqtt-management.mts');
assert(
  mqttProbe.includes('mqttPublisherRecoveryState') &&
    mqttProbe.includes('state.brokerReachable && state.publisherReady') &&
    !mqttProbe.includes("((after.body.clients as Array<Json> | undefined) ?? []).length > 0"),
  'MQTT recovery waits for the platform publisher, not merely a reachable broker or any client',
);
for (const [snapshot, expected, label] of [
  [{ brokerReachable: true, platformPublisherPrefix: 'iot-', platformPublisherCount: 0, clients: [] }, false, 'broker-only recovery'],
  [{ brokerReachable: true, platformPublisherPrefix: 'iot-', platformPublisherCount: 1, clients: [{ clientId: 'other-1', username: 'u', connectedAt: 'now' }] }, false, 'unrelated-client recovery'],
  [{ brokerReachable: true, platformPublisherPrefix: 'iot-', platformPublisherCount: 1, clients: [{ clientId: 'iot-1' }] }, false, 'incomplete publisher row'],
  [{ brokerReachable: true, platformPublisherPrefix: 'iot-', platformPublisherCount: 1, clients: [{ clientId: 'iot-1', username: 'publisher', connectedAt: 'now' }] }, true, 'full publisher recovery'],
]) {
  const state = mqttPublisherRecoveryState(snapshot);
  assert(
    state.brokerReachable && state.publisherReady === expected,
    `MQTT recovery predicate rejects/accepts ${label} correctly`,
    state.detail,
  );
}

const runners = [
  'scripts/run-wave4-staging-probes.sh',
  'scripts/run-wave5-public-api-probes.sh',
  'scripts/run-wave6-management-probes.sh',
  'scripts/run-wave7-operations-probes.sh',
  'scripts/run-billing-probe.sh',
  'scripts/run-wave9-simulated-hardware-probes.sh',
  ...wave6Wrappers,
  'scripts/run-mobile-notification-probe.sh',
  'scripts/run-device-maintenance-probe.sh',
  'scripts/run-camera-probe.sh',
  'scripts/run-device-location-probe.sh',
  'scripts/run-media-probe.sh',
];
for (const rel of [...new Set(runners)]) {
  const source = read(rel);
  assert(source.includes('set -euo pipefail'), `${rel} is fail-closed at shell level`);
  const syntax = spawnSync('bash', ['-n', path.join(root, rel)], { encoding: 'utf8' });
  assert(syntax.status === 0, `${rel} has valid shell syntax`, syntax.stderr.trim());
}

const temp = mkdtempSync(path.join(tmpdir(), 'iot-live-probe-contract-'));
try {
  writeFileSync(path.join(temp, '.env'), 'PORT=4321\n');
  writeFileSync(
    path.join(temp, 'demo.json'),
    JSON.stringify({
      schemaVersion: 1,
      platformAdmin: { email: 'demo.superadmin@iot.local', password: 'fixture-super' },
      tenantAdmin: {
        tenantId: '22222222-2222-4222-8222-222222222222',
        email: 'demo.admin@iot.local',
        password: 'fixture-tenant',
      },
    }),
  );
  const helper = path.join(root, 'scripts/probe-common.sh').replaceAll("'", "'\\''");
  const shell = [
    'set -euo pipefail',
    `source '${helper}'`,
    'export PROBE_DEMO_CREDENTIAL_FILE="$PWD/demo.json"',
    'probe_export_demo_admin_env',
    'printf "%s|%s|%s\\n" "$PROBE_EMAIL" "$PROBE_TENANT_EMAIL" "$PROBE_API_BASE"',
  ].join('; ');
  const result = spawnSync('bash', ['-lc', shell], { cwd: temp, encoding: 'utf8' });
  assert(result.status === 0, 'shared demo credential loader accepts a machine-readable fixture', result.stderr.trim());
  assert(
    result.stdout.trim() ===
      'demo.superadmin@iot.local|demo.admin@iot.local|http://127.0.0.1:4321',
    'shared demo credential loader exports identities and API base without printing passwords',
    result.stdout.trim(),
  );
  assert(
    !`${result.stdout}\n${result.stderr}`.includes('fixture-super') &&
      !`${result.stdout}\n${result.stderr}`.includes('fixture-tenant'),
    'shared demo credential loader does not leak passwords to stdout/stderr',
  );
} finally {
  rmSync(temp, { recursive: true, force: true });
}

console.log('CROSS-WAVE LIVE PROBE CONTRACT SELF-TEST PASS');
