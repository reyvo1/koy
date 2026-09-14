#!/usr/bin/env node
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';

const root = resolve(process.env.BASELINE_HYGIENE_ROOT || resolve(import.meta.dirname, '..'));

const generatedDirs = [
  'dist',
  'apps/admin-web/.next',
  'apps/user-web/.next',
];

const incrementalRoots = [
  'apps/admin-web',
  'apps/user-web',
  'apps/user-mobile',
  'packages/design-system',
];

const removed = [];

function removePath(rel) {
  const absolute = resolve(root, rel);
  if (!existsSync(absolute)) return;
  rmSync(absolute, { recursive: true, force: true });
  removed.push(rel);
}

function removeTsBuildInfo(dir) {
  const absolute = resolve(root, dir);
  if (!existsSync(absolute) || !statSync(absolute).isDirectory()) return;

  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const full = resolve(absolute, entry.name);
    if (entry.isDirectory()) {
      removeTsBuildInfo(relative(root, full).split(sep).join('/'));
      continue;
    }
    if (/\.tsbuildinfo$/i.test(entry.name)) {
      const rel = relative(root, full).split(sep).join('/');
      rmSync(full, { force: true });
      removed.push(rel);
    }
  }
}

for (const rel of generatedDirs) removePath(rel);
for (const rel of incrementalRoots) removeTsBuildInfo(rel);

if (removed.length === 0) {
  console.log('PASS  baseline hygiene already clean; no generated build artifacts found');
} else {
  for (const rel of removed) console.log(`CLEAN ${rel}`);
  console.log(`PASS  removed ${removed.length} generated build artifact path(s)`);
}
