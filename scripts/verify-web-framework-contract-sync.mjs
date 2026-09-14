#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const admin = JSON.parse(readFileSync(resolve(root, 'apps/admin-web/package.json'), 'utf8'));
const user = JSON.parse(readFileSync(resolve(root, 'apps/user-web/package.json'), 'utf8'));
const contract = readFileSync(
  resolve(root, 'test/module-10-web-workspace-design-system-foundation.contract.spec.ts'),
  'utf8',
);
const doc = readFileSync(
  resolve(root, 'docs/module-10-web-workspace-design-system-foundation.md'),
  'utf8',
);

const expected = '16.3.5';

for (const [name, pkg] of [['admin-web', admin], ['user-web', user]]) {
  if (pkg.dependencies?.next !== expected) {
    throw new Error(`${name} Next.js pin drifted from ${expected}: ${pkg.dependencies?.next ?? 'missing'}`);
  }
}

if (!contract.includes(`expect(app.dependencies.next).toBe('${expected}')`)) {
  throw new Error(`active web workspace foundation contract is not synchronized to Next.js ${expected}`);
}

if (!doc.includes(`Next.js \`${expected}\``)) {
  throw new Error(`active web workspace foundation documentation is not synchronized to Next.js ${expected}`);
}

console.log(`PASS  active web workspace contract/docs synchronized to Next.js ${expected}`);
