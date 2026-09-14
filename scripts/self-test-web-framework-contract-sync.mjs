#!/usr/bin/env node
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const verifierText = readFileSync(
  resolve(import.meta.dirname, 'verify-web-framework-contract-sync.mjs'),
  'utf8',
);
const temp = mkdtempSync(join(tmpdir(), 'iot-web-contract-sync-'));

function runCase(label, nextVersion, contractVersion, docVersion, expectedCode, expectedText) {
  const root = join(temp, label.replace(/[^a-z0-9]+/gi, '-'));
  mkdirSync(join(root, 'scripts'), { recursive: true });
  mkdirSync(join(root, 'apps', 'admin-web'), { recursive: true });
  mkdirSync(join(root, 'apps', 'user-web'), { recursive: true });
  mkdirSync(join(root, 'test'), { recursive: true });
  mkdirSync(join(root, 'docs'), { recursive: true });

  writeFileSync(join(root, 'scripts', 'verify-web-framework-contract-sync.mjs'), verifierText);
  const pkg = JSON.stringify({ dependencies: { next: nextVersion } });
  writeFileSync(join(root, 'apps', 'admin-web', 'package.json'), pkg);
  writeFileSync(join(root, 'apps', 'user-web', 'package.json'), pkg);
  writeFileSync(
    join(root, 'test', 'module-10-web-workspace-design-system-foundation.contract.spec.ts'),
    `expect(app.dependencies.next).toBe('${contractVersion}');`,
  );
  writeFileSync(
    join(root, 'docs', 'module-10-web-workspace-design-system-foundation.md'),
    `Application packages use security-approved pinned Next.js \`${docVersion}\`.`,
  );

  const result = spawnSync(
    process.execPath,
    [join(root, 'scripts', 'verify-web-framework-contract-sync.mjs')],
    { encoding: 'utf8' },
  );
  const output = `${result.stdout}${result.stderr}`;
  if (result.status !== expectedCode || !output.includes(expectedText)) {
    throw new Error(`${label} failed: status=${result.status} output=${output}`);
  }
  console.log(`PASS  ${label}`);
}

try {
  runCase('synchronized state passes', '16.3.5', '16.3.5', '16.3.5', 0, 'synchronized');
  runCase('stale contract is rejected', '16.3.5', '16.2.10', '16.3.5', 1, 'contract is not synchronized');
  runCase('stale documentation is rejected', '16.3.5', '16.3.5', '16.2.10', 1, 'documentation is not synchronized');
  console.log('WEB FRAMEWORK CONTRACT SYNC SELF-TEST PASS');
} finally {
  rmSync(temp, { recursive: true, force: true });
}
