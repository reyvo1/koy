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
const pkg = JSON.parse(read('package.json'));

check('CI remains runnable manually', workflow.includes('workflow_dispatch:'));
check('CI verifies secure NestJS/Fastify dependency boundary before production audit', workflow.includes('Verify secure NestJS/Fastify dependency boundary') && workflow.indexOf('security:stack:verify') < workflow.indexOf('security:audit:production'));
check('CI verifies secure Next.js dependency boundary before production audit', workflow.includes('Verify secure Next.js dependency boundary') && workflow.indexOf('security:web-stack:verify') < workflow.indexOf('security:audit:production'));
check('CI verifies Fastify v5 source compatibility before backend build', workflow.includes('Verify Fastify v5 source compatibility') && workflow.indexOf('fastify:v5:compat:verify') < workflow.indexOf('Build backend'));
check('CI self-tests baseline build-artifact hygiene before backend build', workflow.includes('Self-test baseline build-artifact hygiene') && workflow.indexOf('baseline:hygiene:self-test') < workflow.indexOf('Build backend'));
check('CI verifies web framework contract/documentation sync before web type-check', workflow.includes('Verify web framework contract/documentation sync') && workflow.indexOf('web:framework:contract:verify') < workflow.indexOf('Type-check web workspaces'));
check('existing core CI job is preserved', workflow.includes('\n  test:\n') && workflow.includes('Database integration test') && workflow.includes('MQTT workflow integration test'));
check(
  'rescue job self-tests cross-platform manifest portability before sealed-source verification',
  workflow.includes('npm run baseline:manifest:self-test') &&
    workflow.indexOf('npm run baseline:manifest:self-test') <
      workflow.lastIndexOf('npm run baseline:manifest:verify'),
);
check('rescue live EMQX job runs on GitHub Ubuntu', workflow.includes('\n  rescue-live-emqx:\n') && workflow.includes('runs-on: ubuntu-latest'));
check('rescue live EMQX job is sequenced after core CI', workflow.includes('needs: test'));
check('CI generates ephemeral uncommitted rescue secrets', workflow.includes('rescue:env:init -- --output=.env'));
check('CI uses source rescue Docker Compose runtime', workflow.includes('rescue:local:up -- --env=.env') && workflow.includes('docker compose -f docker-compose.rescue.yml'));
check('CI runs targeted DB stability before full acceptance', workflow.indexOf('Targeted PostgreSQL integration stability gate') < workflow.indexOf('Full automated acceptance once'));
check('CI runs real broker smoke before Gate 1/full acceptance', workflow.indexOf('Real EMQX auth ACL webhook and ACK smoke') < workflow.indexOf('Gate 1 source-bound runtime receipt'));
check('CI captures reports and container logs on failure', workflow.includes('if: always()') && workflow.includes('docker-compose.log') && workflow.includes('actions/upload-artifact@v4'));
check('CI tears down only ephemeral runner volumes', workflow.includes('down --volumes --remove-orphans'));
check('broker smoke package command is exposed', pkg.scripts?.['rescue:broker:smoke'] === 'node scripts/run-rescue-live-broker-smoke.mjs');
check('CI self-test package command is exposed', pkg.scripts?.['rescue:github-ci:self-test'] === 'node scripts/self-test-rescue-github-ci.mjs');
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

if (failures.length) {
  console.error(`\nRESCUE GITHUB CI SELF-TEST FAILED (${failures.length})`);
  process.exit(1);
}
console.log('\nRESCUE GITHUB CI SELF-TEST PASS');
