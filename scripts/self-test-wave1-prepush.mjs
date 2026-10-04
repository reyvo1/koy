#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const script = pkg.scripts?.['wave1:prepush:check'];

if (!script) throw new Error('wave1:prepush:check is missing');

const required = [
  'security:stack:verify',
  'security:web-stack:verify',
  'security:audit:production',
  'lint:check',
  'session:handoff:self-test',
  'enterprise:wave-status:self-test',
  'enterprise:wave-status:verify',
  'user-web:navigation:self-test',
  'rescue:ci-env:self-test',
  'uat:simulated-hardware:self-test',
  'release:approval:self-test',
  'release:approval:gate:self-test',
  'gitignore:source-scope:self-test',
  'fastify:v5:compat:verify',
  'web:framework:contract:verify',
  'tls:protocol:self-test',
  'baseline:hygiene:self-test',
  'baseline:hygiene:clean',
  'baseline:manifest:generate',
  'baseline:manifest:verify',
  'rescue:validate',
  'rescue:github-ci:self-test',
];

let previous = -1;
for (const token of required) {
  const index = script.indexOf(token);
  if (index < 0) throw new Error(`pre-push gate is missing ${token}`);
  if (index <= previous) throw new Error(`pre-push gate order is invalid around ${token}`);
  previous = index;
}

const mobileSpec = readFileSync(
  resolve(root, 'apps/user-mobile/src/device-control/mobile-device-client.spec.ts'),
  'utf8',
);
const userWeb = readFileSync(
  resolve(root, 'apps/user-web/components/device-detail-experience.tsx'),
  'utf8',
);

if (!mobileSpec.includes('requestJson: async <T>(_path: string)')) {
  throw new Error('mobile lint regression fix is missing');
}
if (userWeb.includes('useMemo')) {
  throw new Error('unused useMemo import remains in user-web device detail experience');
}

console.log('PASS  Wave 1 pre-push gate includes GitHub-equivalent cheap checks in order');
console.log('PASS  GitHub lint regression markers are removed');
console.log('WAVE 1 PRE-PUSH SELF-TEST PASS');
