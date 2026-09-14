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

  let result = run('generate');
  assert(result.status === 0, `generate failed: ${result.stderr || result.stdout}`);
  const tree = readFileSync(path.join(fixture, 'repository-tree.txt'), 'utf8');
  assert(tree.includes('apps/admin-web/source.ts'), 'ordinary source file must remain sealed');
  assert(!tree.includes('tsconfig.tsbuildinfo'), '*.tsbuildinfo must be excluded from sealed source tree');

  result = run('verify');
  assert(result.status === 0, `verify must tolerate generated tsbuildinfo: ${result.stderr || result.stdout}`);
  console.log('PASS  baseline manifest ignores generated *.tsbuildinfo files at arbitrary source depth');

  writeFileSync(path.join(fixture, 'apps/admin-web/untracked-source.ts'), 'export const drift = true;\n');
  result = run('verify');
  assert(result.status !== 0, 'verify must still reject an ordinary untracked source file');
  assert((result.stderr + result.stdout).includes('untracked-source.ts'), 'drift failure must identify the ordinary untracked file');
  console.log('PASS  baseline manifest still rejects ordinary untracked source drift');
} finally {
  rmSync(fixture, { recursive: true, force: true });
}
