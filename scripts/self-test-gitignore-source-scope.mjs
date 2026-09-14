#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const gitignore = readFileSync(resolve(root, '.gitignore'), 'utf8');

if (!gitignore.split(/\r?\n/).includes('/reports/')) {
  throw new Error('top-level /reports/ ignore rule is missing');
}
if (gitignore.split(/\r?\n/).some((line) => line.trim() === 'reports/')) {
  throw new Error('broad reports/ ignore rule would hide nested application report routes');
}

function checkIgnore(path) {
  return spawnSync('git', ['check-ignore', '--no-index', '--', path], {
    cwd: root,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
}

const runtimeEvidence = checkIgnore('reports/runtime-evidence.json');
if (runtimeEvidence.status !== 0) {
  throw new Error(`top-level runtime reports path is not ignored: ${runtimeEvidence.stdout}${runtimeEvidence.stderr}`);
}

for (const path of [
  'apps/admin-web/app/super/reports/page.tsx',
  'apps/admin-web/app/api/super/reports/tenant-summary/route.ts',
]) {
  const result = checkIgnore(path);
  if (result.status === 0) {
    throw new Error(`application source route is still ignored by Git: ${path} (${result.stdout.trim()})`);
  }
}

console.log('PASS  top-level runtime reports remain ignored');
console.log('PASS  nested Super Admin report routes are visible to Git');
console.log('GITIGNORE SOURCE-SCOPE SELF-TEST PASS');
