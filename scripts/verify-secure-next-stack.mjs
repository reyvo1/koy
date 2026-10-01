#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const lockPath = resolve(process.env.SECURE_NEXT_LOCK_PATH || resolve(root, 'package-lock.json'));
const adminPath = resolve(process.env.SECURE_NEXT_ADMIN_PACKAGE_PATH || resolve(root, 'apps/admin-web/package.json'));
const userPath = resolve(process.env.SECURE_NEXT_USER_PACKAGE_PATH || resolve(root, 'apps/user-web/package.json'));

const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
const admin = JSON.parse(readFileSync(adminPath, 'utf8'));
const user = JSON.parse(readFileSync(userPath, 'utf8'));

const REQUIRED = '16.3.8';
const MINIMUM = '16.3.3';

function parse(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(String(version || ''));
  if (!match) throw new Error(`Invalid semantic version: ${version}`);
  return match.slice(1, 4).map(Number);
}

function compare(a, b) {
  const av = parse(a);
  const bv = parse(b);
  for (let i = 0; i < 3; i += 1) {
    if (av[i] !== bv[i]) return av[i] - bv[i];
  }
  return 0;
}

for (const [name, workspace] of [['admin-web', admin], ['user-web', user]]) {
  const declared = workspace.dependencies?.next;
  if (declared !== REQUIRED) {
    throw new Error(`${name} must declare exact next@${REQUIRED}; found ${declared ?? 'missing'}`);
  }
}

const locked = lock.packages?.['node_modules/next']?.version;
if (!locked) throw new Error('package-lock is missing node_modules/next');
if (compare(locked, MINIMUM) < 0) {
  throw new Error(`Vulnerable Next.js remains locked: ${locked}; minimum secure line is ${MINIMUM}`);
}
if (locked !== REQUIRED) {
  throw new Error(`Next.js lock must be exact ${REQUIRED}; found ${locked}`);
}

for (const workspacePath of ['apps/admin-web', 'apps/user-web']) {
  const declared = lock.packages?.[workspacePath]?.dependencies?.next;
  if (declared !== REQUIRED) {
    throw new Error(`package-lock workspace ${workspacePath} must declare next@${REQUIRED}; found ${declared ?? 'missing'}`);
  }
}

console.log(`PASS  secure Next.js boundary locked at ${REQUIRED} (minimum secure ${MINIMUM})`);
