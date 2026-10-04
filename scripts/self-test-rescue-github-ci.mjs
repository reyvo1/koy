#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const failures = [];

function pass(name) { console.log(`PASS  ${name}`); }
function fail(name, detail = '') { failures.push(`${name}${detail ? `: ${detail}` : ''}`); console.error(`FAIL  ${name}${detail ? ` (${detail})` : ''}`); }
function check(name, condition, detail = '') { condition ? pass(name) : fail(name, detail); }
function read(rel) { return readFileSync(path.join(root, rel), 'utf8'); }

const workflowPath = '.github/workflows/ci.yml';
const smokePath = 'scripts/run-rescue-live-broker-smoke.mjs';
check('GitHub CI workflow exists', existsSync(path.join(root, workflowPath)));
check('real EMQX smoke runner exists', existsSync(path.join(root, smokePath)));

const workflow = read(workflowPath);
const smoke = read(smokePath);
const brokerSmokeSelfTest = read('scripts/self-test-rescue-live-broker-smoke.mjs');
const pkg = JSON.parse(read('package.json'));

check('CI remains runnable manually', workflow.includes('workflow_dispatch:'));
check('CI verifies secure NestJS/Fastify dependency boundary before production audit', workflow.includes('Verify secure NestJS/Fastify dependency boundary') && workflow.indexOf('security:stack:verify') < workflow.indexOf('security:audit:production'));
check('CI verifies secure Next.js dependency boundary before production audit', workflow.includes('Verify secure Next.js dependency boundary') && workflow.indexOf('security:web-stack:verify') < workflow.indexOf('security:audit:production'));
check('CI verifies Fastify v5 source compatibility before backend build', workflow.includes('Verify Fastify v5 source compatibility') && workflow.indexOf('fastify:v5:compat:verify') < workflow.indexOf('Build backend'));
check('CI self-tests baseline build-artifact hygiene before backend build', workflow.includes('Self-test baseline build-artifact hygiene') && workflow.indexOf('baseline:hygiene:self-test') < workflow.indexOf('Build backend'));
check('CI verifies web framework contract/documentation sync before web type-check', workflow.includes('Verify web framework contract/documentation sync') && workflow.indexOf('web:framework:contract:verify') < workflow.indexOf('Type-check web workspaces'));
check('existing core CI job is preserved', workflow.includes('\n  test:\n') && workflow.includes('Database integration test') && workflow.includes('MQTT workflow integration test'));
check('core CI labels PostgreSQL integration as Wave 2 runtime evidence', workflow.includes('Database integration test (includes Wave 2 runtime evidence)') && workflow.includes('run: npm run test:integration:db'));
check(
  'core CI runs Wave 2 runtime invariant guard before backend build',
  workflow.includes('Verify Wave 2 core runtime contract') &&
    workflow.indexOf('npm run wave2:core-runtime:self-test') <
      workflow.indexOf('Build backend'),
);
check(
  'rescue job self-tests cross-platform manifest portability before sealed-source verification',
  workflow.includes('npm run baseline:manifest:self-test') &&
    workflow.indexOf('npm run baseline:manifest:self-test') <
      workflow.lastIndexOf('npm run baseline:manifest:verify'),
);
check('rescue live EMQX job runs on GitHub Ubuntu', workflow.includes('\n  rescue-live-emqx:\n') && workflow.includes('runs-on: ubuntu-latest'));
check('rescue live EMQX job waits for core CI and Wave 3 firmware simulation', workflow.includes('needs: [test, esp32-firmware-simulation]'));
check('CI generates ephemeral uncommitted rescue secrets', workflow.includes('rescue:env:init -- --output=.env'));
check('CI uses source rescue Docker Compose runtime', workflow.includes('rescue:local:up -- --env=.env') && workflow.includes('docker compose -f docker-compose.rescue.yml'));
check('CI runs targeted DB stability before full acceptance', workflow.indexOf('Targeted PostgreSQL integration stability gate') < workflow.indexOf('Full automated acceptance once'));
check('CI runs real broker smoke before Gate 1/full acceptance', workflow.indexOf('Real EMQX auth ACL webhook and ACK smoke') < workflow.indexOf('Gate 1 source-bound runtime receipt'));
check('CI captures reports and container logs on failure', workflow.includes('if: always()') && workflow.includes('docker-compose.log') && workflow.includes('actions/upload-artifact@v4'));
check('CI tears down only ephemeral runner volumes', workflow.includes('down --volumes --remove-orphans'));
check(
  'CI self-tests bounded broker smoke operations before live EMQX smoke',
  workflow.includes('Self-test bounded live broker smoke operations') &&
    workflow.indexOf('rescue:broker:smoke:self-test') <
      workflow.indexOf('rescue:broker:smoke -- --env=.env'),
);
check('broker smoke package command is exposed', pkg.scripts?.['rescue:broker:smoke'] === 'node scripts/run-rescue-live-broker-smoke.mjs');
check('CI self-test package command is exposed', pkg.scripts?.['rescue:github-ci:self-test'] === 'node scripts/self-test-rescue-github-ci.mjs');
check('Wave 2 core runtime self-test package command is exposed', pkg.scripts?.['wave2:core-runtime:self-test'] === 'node scripts/self-test-wave2-core-runtime.mjs');
check('session handoff self-test command is exposed', pkg.scripts?.['session:handoff:self-test'] === 'node scripts/self-test-session-handoff.mjs');
check('core CI executes the session handoff continuity self-test', workflow.includes('npm run session:handoff:self-test'));
check('TLS protocol parser self-test command is exposed', pkg.scripts?.['tls:protocol:self-test'] === 'node scripts/verify-tls-terminator.mjs --self-test');
check('core CI executes the TLS protocol parser self-test before live Wave 4 TLS', workflow.includes('npm run tls:protocol:self-test') && workflow.indexOf('npm run tls:protocol:self-test') < workflow.indexOf('Wave 4 staging UAT and TLS regression'));
check('enterprise wave status verifier command is exposed', pkg.scripts?.['enterprise:wave-status:verify'] === 'node scripts/verify-enterprise-wave-status.mjs');
check('enterprise wave status self-test command is exposed', pkg.scripts?.['enterprise:wave-status:self-test'] === 'node scripts/self-test-enterprise-wave-status.mjs');
check('User Web navigation self-test command is exposed', pkg.scripts?.['user-web:navigation:self-test'] === 'node scripts/self-test-user-web-navigation.mjs');
check('simulated hardware UAT verifier command is exposed', pkg.scripts?.['uat:simulated-hardware:verify'] === 'node scripts/verify-simulated-hardware-uat.mjs');
check('simulated hardware UAT self-test command is exposed', pkg.scripts?.['uat:simulated-hardware:self-test'] === 'node scripts/self-test-simulated-hardware-uat.mjs');
check('core CI self-tests the simulated hardware UAT verifier', workflow.includes('npm run uat:simulated-hardware:self-test'));
check('core CI executes the User Web navigation completeness self-test', workflow.includes('npm run user-web:navigation:self-test'));
check('rescue CI exports generated runtime configuration before live probes', workflow.includes('Export generated rescue runtime to subsequent probes') && workflow.includes('node scripts/export-rescue-ci-env.mjs --env=.env'));
check(
  'core CI self-tests and executes enterprise wave status synchronization',
  workflow.includes('npm run enterprise:wave-status:self-test') &&
    workflow.includes('Verify enterprise wave status synchronization') &&
    workflow.indexOf('npm run enterprise:wave-status:verify') < workflow.indexOf('Build backend'),
);
const uatSeedIndex = workflow.indexOf('Seed the UAT baseline');
const wave9Index = workflow.indexOf('Wave 9 media runtime RTSP to WebRTC');
check(
  'Wave 4 staging UAT and TLS regression is mandatory after UAT seed',
  uatSeedIndex >= 0 &&
    workflow.indexOf('Wave 4 staging UAT and TLS regression') > uatSeedIndex &&
    ['npm run uat:docs', 'npm run uat:login', 'npm run tls:verify'].every((token) => workflow.includes(token)),
);
check(
  'Wave 5 webhook and SDK live regressions are mandatory before Wave 9',
  workflow.indexOf('Wave 5 public API webhook and SDK live regression') > uatSeedIndex &&
    workflow.indexOf('Wave 5 public API webhook and SDK live regression') < wave9Index &&
    ['npm run webhook:probe', 'npm run sdk:probe'].every((token) => workflow.includes(token)),
);
check(
  'Wave 6 management plane live regressions are mandatory before Wave 9',
  workflow.indexOf('Wave 6 management plane live regression') > uatSeedIndex &&
    workflow.indexOf('Wave 6 management plane live regression') < wave9Index &&
    ['npm run capability-template:probe', 'npm run saved-reports:probe', 'npm run mqtt-management:probe', 'npm run noc:probe'].every((token) => workflow.includes(token)),
);
check(
  'Wave 7 mobile and technician live regressions are mandatory before Wave 9',
  workflow.indexOf('Wave 7 mobile and technician live regression') > uatSeedIndex &&
    workflow.indexOf('Wave 7 mobile and technician live regression') < wave9Index &&
    ['npm run mobile:notification:probe', 'npm run maintenance:probe'].every((token) => workflow.includes(token)),
);
check(
  'Wave 8 billing lifecycle regression is mandatory without fabricating provider evidence',
  workflow.indexOf('Wave 8 billing lifecycle live regression') > uatSeedIndex &&
    workflow.indexOf('Wave 8 billing lifecycle live regression') < wave9Index &&
    workflow.includes('npm run billing:probe') &&
    workflow.includes('positive provider-owned settlement/webhook still requires real provider credentials'),
);
check('Wave 3 ESP32 self-test package command is exposed', pkg.scripts?.['wave3:esp32:self-test'] === 'node scripts/self-test-wave3-esp32-simulation.mjs && node scripts/self-test-wave3-esp-idf-build-graph.mjs && node scripts/self-test-wave3-esp-idf-api-surface.mjs && node scripts/self-test-wave3-esp-idf-toolchain-lifecycle.mjs && node scripts/self-test-wave3-qemu-boot-runner.mjs && node scripts/self-test-wave3-esp32-source.mjs');
check('Wave 3 firmware simulation job is mandatory before rescue live services', workflow.includes('esp32-firmware-simulation:') && workflow.includes('Wave 3 ESP-IDF ${{ matrix.target }} build and QEMU boot') && workflow.includes('needs: [test, esp32-firmware-simulation]'));
check('Wave 3 firmware job runs in parallel with core CI', !workflow.slice(workflow.indexOf('  esp32-firmware-simulation:'), workflow.indexOf('  rescue-live-emqx:')).includes('needs: test'));
check('Wave 3 firmware matrix covers ESP32 and ESP32-C3', workflow.includes('target: [esp32, esp32c3]') && workflow.includes('qemu-riscv32') && workflow.includes('qemu-xtensa'));
check('Wave 3 build-graph guard runs before ESP-IDF install', workflow.indexOf('Verify Wave 3 firmware/build-graph contract before toolchain install') < workflow.indexOf('Install ESP-IDF 5.5.5'));
check('Wave 3 ESP-IDF API-surface guard runs before ESP-IDF install', workflow.indexOf('node scripts/self-test-wave3-esp-idf-api-surface.mjs') > workflow.indexOf('Verify Wave 3 firmware/build-graph contract before toolchain install') && workflow.indexOf('node scripts/self-test-wave3-esp-idf-api-surface.mjs') < workflow.indexOf('Install ESP-IDF 5.5.5'));
check('Wave 3 ESP-IDF toolchain-lifecycle guard runs before ESP-IDF install', workflow.indexOf('node scripts/self-test-wave3-esp-idf-toolchain-lifecycle.mjs') > workflow.indexOf('Verify Wave 3 firmware/build-graph contract before toolchain install') && workflow.indexOf('node scripts/self-test-wave3-esp-idf-toolchain-lifecycle.mjs') < workflow.indexOf('Install ESP-IDF 5.5.5'));
check('Wave 3 QEMU setup does not reactivate installer-managed ESP-IDF environment', !workflow.slice(workflow.indexOf('  esp32-firmware-simulation:'), workflow.indexOf('  rescue-live-emqx:')).includes('$IDF_PATH/export.sh'));
check('Wave 3 QEMU setup uses the installer-managed Python venv for tool installation', workflow.includes('IDF_PYTHON="$IDF_PYTHON_ENV_PATH/bin/python"') && workflow.includes('"$IDF_PYTHON" "$IDF_PATH/tools/idf_tools.py" install "$QEMU_TOOL"'));
check('Wave 3 mandatory QEMU boot removes pytest-embedded/esptool version coupling', !workflow.includes('pytest-embedded') && !workflow.includes('pytest_wave3.py') && workflow.includes('node scripts/run-wave3-qemu-boot.mjs'));
check('Wave 3 QEMU runner self-test executes before expensive ESP-IDF install', workflow.indexOf('node scripts/self-test-wave3-qemu-boot-runner.mjs') > workflow.indexOf('Verify Wave 3 firmware/build-graph contract before toolchain install') && workflow.indexOf('node scripts/self-test-wave3-qemu-boot-runner.mjs') < workflow.indexOf('Install ESP-IDF 5.5.5'));
check('Wave 3 QEMU setup exports only the newly installed QEMU binary directory', workflow.includes('QEMU_PATH="$(find "$IDF_TOOLS_PATH/tools/$QEMU_TOOL"') && workflow.includes('echo "$QEMU_DIR" >> "$GITHUB_PATH"'));
check('Wave 3 firmware artifact is downloaded before live device simulation', workflow.indexOf('Download exact Wave 3 firmware artifact') < workflow.indexOf('Wave 3 simulated ESP32 provisioning reconnect command and OTA'));
check('Wave 3 live simulation runs after real EMQX smoke', workflow.indexOf('Real EMQX auth ACL webhook and ACK smoke') < workflow.indexOf('Wave 3 simulated ESP32 provisioning reconnect command and OTA'));
check('combined simulated hardware UAT is sealed after media and camera probes', workflow.includes('Seal simulated hardware UAT evidence') && workflow.indexOf('npm run media:probe') < workflow.indexOf('npm run uat:simulated-hardware:verify') && workflow.indexOf('npm run camera:probe') < workflow.indexOf('npm run uat:simulated-hardware:verify'));
check(
  'rescue CI re-runs Wave 2 runtime invariant guard before live runtime',
  workflow.lastIndexOf('npm run wave2:core-runtime:self-test') >
    workflow.indexOf('\n  rescue-live-emqx:\n') &&
    workflow.lastIndexOf('npm run wave2:core-runtime:self-test') <
      workflow.indexOf('Verify Docker Compose runtime'),
);
check('broker smoke prioritizes dedicated rescue broker URL', smoke.includes('env.RESCUE_MQTT_BROKER_URL?.trim()') && smoke.includes("'18884'"));
check('broker smoke CI mode does not require an evidence file', smoke.includes('const evidenceMode = Boolean(evidenceArg)') && smoke.includes("'CI smoke (no evidence mutation)'"));
check('broker smoke covers concrete live broker safety paths', [
  'device-valid-secret-allowed',
  'device-wrong-secret-denied',
  'publisher-command-publish-allowed',
  'publisher-non-command-operations-denied',
  'device-telemetry-publish-allowed',
  'device-ack-publish-allowed',
  'device-command-subscribe-allowed',
  'cross-device-tenant-topic-denied',
  'telemetry-webhook-idempotent',
  'ack-bound-to-matching-device-command',
  'wrong-webhook-secret-denied',
  'revoked-device-denied',
].every((token) => smoke.includes(token)));
check(
  'negative ACL smoke operations use fresh one-shot clients',
  [
    'expectSubscribeDeniedFresh',
    'expectPublishDeniedFresh',
    'publisher-negative-subscribe',
    'publisher-negative-publish',
    'cross-device-subscribe',
    'cross-device-publish',
    'wrong-device-ack-publish',
  ].every((token) => smoke.includes(token)),
);

check(
  'broker smoke self-test guards live dashboard boolean/widget semantic compatibility',
  brokerSmokeSelfTest.includes(
    'live dashboard fixture matches boolean CARD/LATEST resolver semantics',
  ) &&
    brokerSmokeSelfTest.includes(
      'live dashboard fixture regressed to GAUGE for the boolean power capability',
    ),
);

if (failures.length) {
  console.error(`\nRESCUE GITHUB CI SELF-TEST FAILED (${failures.length})`);
  process.exit(1);
}
console.log('\nRESCUE GITHUB CI SELF-TEST PASS');
