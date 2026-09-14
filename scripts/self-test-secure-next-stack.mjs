#!/usr/bin/env node
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const verifier = resolve(import.meta.dirname, 'verify-secure-next-stack.mjs');
const temp = mkdtempSync(join(tmpdir(), 'iot-secure-next-'));

function fixture(name, { admin = '16.3.5', user = '16.3.5', locked = '16.3.5' } = {}) {
  const adminPath = join(temp, `${name}.admin.json`);
  const userPath = join(temp, `${name}.user.json`);
  const lockPath = join(temp, `${name}.lock.json`);
  writeFileSync(adminPath, JSON.stringify({ dependencies: { next: admin } }));
  writeFileSync(userPath, JSON.stringify({ dependencies: { next: user } }));
  writeFileSync(lockPath, JSON.stringify({
    lockfileVersion: 3,
    packages: {
      'apps/admin-web': { dependencies: { next: admin } },
      'apps/user-web': { dependencies: { next: user } },
      'node_modules/next': { version: locked },
    },
  }));
  return { adminPath, userPath, lockPath };
}

function run(label, fx, expectedCode, expectedText) {
  const result = spawnSync(process.execPath, [verifier], {
    encoding: 'utf8',
    env: {
      ...process.env,
      SECURE_NEXT_ADMIN_PACKAGE_PATH: fx.adminPath,
      SECURE_NEXT_USER_PACKAGE_PATH: fx.userPath,
      SECURE_NEXT_LOCK_PATH: fx.lockPath,
    },
  });
  const output = `${result.stdout}${result.stderr}`;
  if (result.status !== expectedCode || !output.includes(expectedText)) {
    throw new Error(`${label} failed: status=${result.status} output=${output}`);
  }
  console.log(`PASS  ${label}`);
}

try {
  run('patched Next.js stack passes', fixture('patched'), 0, 'secure Next.js boundary locked');
  run('Next.js 16.2.10 is rejected', fixture('old-lock', { admin: '16.2.10', user: '16.2.10', locked: '16.2.10' }), 1, 'must declare exact next@16.3.5');
  run('stale lockfile is rejected', fixture('stale-lock', { locked: '16.2.10' }), 1, 'Vulnerable Next.js remains locked');
  console.log('SECURE NEXT STACK SELF-TEST PASS');
} finally {
  rmSync(temp, { recursive: true, force: true });
}
