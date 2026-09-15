#!/usr/bin/env node

import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const fixture = mkdtempSync(path.join(os.tmpdir(), 'iot-baseline-manifest-'));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function run(mode) {
  return spawnSync(process.execPath, ['scripts/manage-baseline-manifest.mjs', mode], {
    cwd: fixture,
    encoding: 'utf8',
    windowsHide: true,
  });
}

try {
  mkdirSync(path.join(fixture, 'scripts'), { recursive: true });
  mkdirSync(path.join(fixture, 'apps/admin-web'), { recursive: true });
  cpSync(path.join(root, 'scripts/manage-baseline-manifest.mjs'), path.join(fixture, 'scripts/manage-baseline-manifest.mjs'));
  writeFileSync(path.join(fixture, 'package.json'), '{"name":"fixture"}\n');
  writeFileSync(path.join(fixture, 'apps/admin-web/source.ts'), 'export const value = 1;\n');
  writeFileSync(path.join(fixture, 'apps/admin-web/tsconfig.tsbuildinfo'), '{"fixture":true}\n');
  writeFileSync(path.join(fixture, 'apps/admin-web/next-env.d.ts'), 'generated next env variant A\n');
  writeFileSync(path.join(fixture, 'apps/admin-web/custom-types.d.ts'), 'declare const durableType: true;\n');

  let result = run('generate');
  assert(result.status === 0, `generate failed: ${result.stderr || result.stdout}`);
  const tree = readFileSync(path.join(fixture, 'repository-tree.txt'), 'utf8');
  assert(tree.includes('apps/admin-web/source.ts'), 'ordinary source file must remain sealed');
  assert(!tree.includes('tsconfig.tsbuildinfo'), '*.tsbuildinfo must be excluded from sealed source tree');
  assert(!tree.includes('next-env.d.ts'), 'Next.js generated next-env.d.ts must be excluded from sealed source tree');
  assert(tree.includes('custom-types.d.ts'), 'ordinary authored .d.ts files must remain sealed');

  writeFileSync(path.join(fixture, 'apps/admin-web/next-env.d.ts'), 'generated next env variant B\n');
  result = run('verify');
  assert(result.status === 0, `verify must tolerate regenerated next-env.d.ts: ${result.stderr || result.stdout}`);
  console.log('PASS  baseline manifest ignores regenerated Next.js next-env.d.ts but seals authored .d.ts files');

  writeFileSync(
    path.join(fixture, 'apps/admin-web/tsconfig.tsbuildinfo'),
    'generated tsbuildinfo variant B\n',
  );
  result = run('verify');
  assert(result.status === 0, `verify must tolerate regenerated tsbuildinfo: ${result.stderr || result.stdout}`);
  console.log('PASS  baseline manifest ignores regenerated *.tsbuildinfo files at arbitrary source depth');

  // Prove repository-tree ordering is deterministic and does not depend on host locale.
  // The mixed case names intentionally sort differently under localeCompare() on some hosts.
  writeFileSync(path.join(fixture, 'apps/admin-web/README.ts'), 'export const upper = true;\n');
  writeFileSync(path.join(fixture, 'apps/admin-web/agent.ts'), 'export const lower = true;\n');
  result = run('generate');
  assert(result.status === 0, `deterministic ordering generate failed: ${result.stderr || result.stdout}`);
  const orderedTree = readFileSync(path.join(fixture, 'repository-tree.txt'), 'utf8')
    .split(/\r?\n/)
    .filter(Boolean);
  const codePointSortedTree = [...orderedTree].sort();
  assert(
    JSON.stringify(orderedTree) === JSON.stringify(codePointSortedTree),
    'repository-tree ordering must use deterministic code-point order, not host locale collation',
  );
  console.log('PASS  baseline manifest tree ordering is deterministic across host locales');

  // Prove source sealing is invariant across equivalent LF/CRLF text checkouts.
  const sourcePath = path.join(fixture, 'apps/admin-web/source.ts');
  const cmdPath = path.join(fixture, 'tools/operator.cmd');
  mkdirSync(path.dirname(cmdPath), { recursive: true });

  writeFileSync(sourcePath, 'export const value = 1;\n');
  writeFileSync(cmdPath, '@echo off\r\necho ok\r\n');
  result = run('generate');
  assert(result.status === 0, `portable generate failed: ${result.stderr || result.stdout}`);
  const manifestLf = readFileSync(path.join(fixture, 'BASELINE-MANIFEST.sha256'), 'utf8');

  writeFileSync(sourcePath, 'export const value = 1;\r\n');
  writeFileSync(cmdPath, '@echo off\necho ok\n');
  result = run('generate');
  assert(result.status === 0, `portable CRLF generate failed: ${result.stderr || result.stdout}`);
  const manifestCrlf = readFileSync(path.join(fixture, 'BASELINE-MANIFEST.sha256'), 'utf8');

  assert(
    manifestLf === manifestCrlf,
    'equivalent LF/CRLF checkouts must produce identical sealed-source manifests',
  );
  console.log('PASS  baseline manifest is portable across equivalent LF/CRLF text checkouts');

  writeFileSync(sourcePath, 'export const value = 2;\r\n');
  result = run('verify');
  assert(result.status !== 0, 'real source-content drift must still fail');
  console.log('PASS  baseline manifest still rejects real text-content drift');

  writeFileSync(sourcePath, 'export const value = 1;\n');
  writeFileSync(cmdPath, '@echo off\r\necho ok\r\n');
  result = run('generate');
  assert(result.status === 0, `fixture restore failed: ${result.stderr || result.stdout}`);

  writeFileSync(path.join(fixture, 'apps/admin-web/untracked-source.ts'), 'export const drift = true;\n');
  result = run('verify');
  assert(result.status !== 0, 'verify must still reject an ordinary untracked source file');
  assert((result.stderr + result.stdout).includes('untracked-source.ts'), 'drift failure must identify the ordinary untracked file');
  console.log('PASS  baseline manifest still rejects ordinary untracked source drift');
} finally {
  rmSync(fixture, { recursive: true, force: true });
}
