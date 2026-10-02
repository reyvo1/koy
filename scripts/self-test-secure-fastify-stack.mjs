#!/usr/bin/env node
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const verifier = resolve(import.meta.dirname, 'verify-secure-fastify-stack.mjs');
const temp = mkdtempSync(join(tmpdir(), 'iot-secure-stack-'));

// The "secure stack" fixture must sit AT the advisory floors the verifier enforces, not at the versions
// that happened to be pinned when this self-test was written. A self-test whose pass-case is below the
// floor fails the moment a real security fix raises the floor, which reads as a broken verifier when the
// verifier is in fact correct.
const deps = {
  '@nestjs/common': '11.2.3',
  '@nestjs/core': '11.2.3',
  '@nestjs/platform-fastify': '11.2.7',
  'fastify': '5.12.5',
  '@fastify/cors': '11.3.0',
  '@fastify/static': '10.1.2',
};

// platform-fastify pulls its own fastify, so the override is part of a secure stack, not an optional extra.
const overrides = { fastify: '$fastify' };

function fixture(name, lockOverrides = {}, pkgOverrides = {}) {
  const dir = join(temp, name);
  const pkgPath = `${dir}.package.json`;
  const lockPath = `${dir}.package-lock.json`;
  const packages = { '': { dependencies: deps } };
  for (const [dep, version] of Object.entries(deps)) {
    packages[`node_modules/${dep}`] = { version };
  }
  Object.assign(packages, lockOverrides);
  writeFileSync(
    pkgPath,
    JSON.stringify({ dependencies: deps, overrides, ...pkgOverrides }, null, 2),
  );
  writeFileSync(lockPath, JSON.stringify({ lockfileVersion: 3, packages }));
  return { pkgPath, lockPath };
}

function run(label, fx, expectedCode, expectedText) {
  const result = spawnSync(process.execPath, [verifier], {
    encoding: 'utf8',
    env: {
      ...process.env,
      SECURE_STACK_PACKAGE_PATH: fx.pkgPath,
      SECURE_STACK_LOCK_PATH: fx.lockPath,
    },
  });
  const output = `${result.stdout}${result.stderr}`;
  if (result.status !== expectedCode || !output.includes(expectedText)) {
    throw new Error(`${label} failed: status=${result.status} output=${output}`);
  }
  console.log(`PASS  ${label}`);
}

try {
  run('patched stack passes', fixture('patched'), 0, 'secure NestJS/Fastify dependency boundary is locked');
  run(
    'middie 8.3.3 is rejected',
    fixture('middie-old', { 'node_modules/@fastify/middie': { version: '8.3.3' } }),
    1,
    'Vulnerable @fastify/middie remains',
  );
  run(
    'old platform-fastify is rejected',
    fixture('platform-old', { 'node_modules/@nestjs/platform-fastify': { version: '10.4.22' } }),
    1,
    'requires locked @nestjs/platform-fastify@>=11.2.4',
  );

  // Below the advisory floors -- these are the exact versions the CVE fixes landed on top of.
  run(
    'platform-fastify 11.2.3 is rejected',
    fixture('platform-advisory', { 'node_modules/@nestjs/platform-fastify': { version: '11.2.3' } }),
    1,
    'requires locked @nestjs/platform-fastify@>=11.2.4',
  );
  run(
    'fastify 5.11.3 is rejected',
    fixture('fastify-advisory', { 'node_modules/fastify': { version: '5.11.3' } }),
    1,
    'requires locked fastify@>=5.12.5',
  );

  // A DECLARATION below the floor must fail too, not just the lockfile: pinning a vulnerable exact string in
  // package.json is what an exact-match verifier used to accept.
  run(
    'a vulnerable declaration is rejected',
    fixture('decl-old', {}, { dependencies: { ...deps, '@nestjs/platform-fastify': '11.2.3' }, overrides }),
    1,
    'package.json declares 11.2.3',
  );

  // Without the override, platform-fastify resolves its own vulnerable fastify and the direct pin looks fine.
  run(
    'a missing fastify override is rejected',
    fixture('no-override', {}, { dependencies: deps, overrides: {} }),
    1,
    'overrides.fastify',
  );
  console.log('SECURE FASTIFY STACK SELF-TEST PASS');
} finally {
  rmSync(temp, { recursive: true, force: true });
}
