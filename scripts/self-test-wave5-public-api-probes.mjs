#!/usr/bin/env node
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');

function assert(condition, message, detail = '') {
  if (!condition) throw new Error(`FAIL  ${message}${detail ? ` — ${detail}` : ''}`);
  console.log(`PASS  ${message}`);
}

const wrapper = read('scripts/run-wave5-public-api-probes.sh');
const common = read('scripts/probe-common.sh');
const webhook = read('scripts/probe-webhook-event-vocabulary.sh');
const sdk = read('scripts/probe-public-api-sdk.mts');
const workflow = read('.github/workflows/ci.yml');
const pkg = JSON.parse(read('package.json'));

assert(wrapper.includes('set -euo pipefail'), 'Wave 5 wrapper fails closed');
assert(wrapper.includes('source scripts/probe-common.sh'), 'Wave 5 wrapper uses the shared UAT credential contract');
assert(wrapper.includes('probe_export_uat_admin_env'), 'Wave 5 wrapper exports one UAT identity for both probes');
assert(
  wrapper.indexOf('probe-webhook-event-vocabulary.sh') < wrapper.indexOf('probe-public-api-sdk.mts'),
  'Wave 5 wrapper runs webhook then SDK under the same UAT identity',
);
assert(common.includes('probe_export_uat_admin_env()'), 'shared probe helper exposes UAT env export');
assert(webhook.includes('PROBE_EMAIL') && webhook.includes('PROBE_PASSWORD'), 'webhook low-level probe still requires explicit credentials');
assert(sdk.includes('requireProbeCredential'), 'SDK low-level probe fails with a named missing-credential cause');
assert(pkg.scripts?.['wave5:public-api:probe'] === 'bash scripts/run-wave5-public-api-probes.sh', 'canonical Wave 5 live probe is package-exposed');
assert(pkg.scripts?.['wave5:public-api:self-test'] === 'node scripts/self-test-wave5-public-api-probes.mjs', 'Wave 5 credential self-test is package-exposed');
assert(
  workflow.includes('Wave 5 public API webhook and SDK live regression') &&
    workflow.includes('npm run wave5:public-api:probe') &&
    !workflow.slice(
      workflow.indexOf('Wave 5 public API webhook and SDK live regression'),
      workflow.indexOf('Wave 6 management plane live regression'),
    ).includes('npm run webhook:probe'),
  'GitHub Wave 5 uses the canonical UAT-authenticated wrapper instead of naked low-level probes',
);

const temp = mkdtempSync(path.join(tmpdir(), 'iot-wave5-probe-'));
try {
  writeFileSync(path.join(temp, '.env'), 'PORT=4321\n');
  writeFileSync(
    path.join(temp, '.uat-credentials'),
    [
      'uat.admin@iot.local',
      '  tenant    : 44444444-4444-4444-8444-444444444444',
      '  role      : ADMIN',
      '  password  : fixture-value',
      '',
    ].join('\n'),
  );

  const probeCommon = path.join(root, 'scripts/probe-common.sh').replaceAll("'", "'\\''");
  const shell = [
    'set -euo pipefail',
    `source '${probeCommon}'`,
    'probe_export_uat_admin_env',
    'printf "%s|%s|%s|%s\\n" "$PROBE_EMAIL" "$PROBE_PASSWORD" "$PROBE_TENANT_ID" "$PROBE_BASE"',
  ].join('; ');
  const result = spawnSync('bash', ['-lc', shell], { cwd: temp, encoding: 'utf8' });
  assert(result.status === 0, 'shared UAT credential loader executes successfully', result.stderr.trim());
  assert(
    result.stdout.trim() === 'uat.admin@iot.local|fixture-value|44444444-4444-4444-8444-444444444444|http://127.0.0.1:4321',
    'shared UAT credential loader exports email/password/tenant/API from seeded files',
    result.stdout.trim(),
  );

  writeFileSync(
    path.join(temp, '.uat-credentials'),
    ['uat.admin@iot.local', '  password  : (unknown — run with --reset to set a new one)', ''].join('\n'),
  );
  const unknown = spawnSync('bash', ['-lc', shell], { cwd: temp, encoding: 'utf8' });
  assert(unknown.status !== 0, 'shared UAT credential loader rejects an unknown-password placeholder');

  rmSync(path.join(temp, '.uat-credentials'));
  const missing = spawnSync('bash', ['-lc', shell], { cwd: temp, encoding: 'utf8' });
  assert(missing.status !== 0, 'shared UAT credential loader fails closed when seed credentials are missing');
} finally {
  rmSync(temp, { recursive: true, force: true });
}

const syntax = spawnSync('bash', ['-n', path.join(root, 'scripts/run-wave5-public-api-probes.sh')], { encoding: 'utf8' });
assert(syntax.status === 0, 'Wave 5 wrapper shell syntax is valid', syntax.stderr.trim());

console.log('WAVE 5 PUBLIC API PROBE SELF-TEST PASS');
