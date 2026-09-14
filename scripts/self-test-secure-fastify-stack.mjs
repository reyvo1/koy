#!/usr/bin/env node
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const verifier = resolve(import.meta.dirname, 'verify-secure-fastify-stack.mjs');
const temp = mkdtempSync(join(tmpdir(), 'iot-secure-stack-'));

const deps = {
  '@nestjs/common': '11.2.3',
  '@nestjs/core': '11.2.3',
  '@nestjs/platform-fastify': '11.2.3',
  'fastify': '5.10.0',
  '@fastify/cors': '11.3.0',
  '@fastify/static': '10.1.2',
};

function fixture(name, overrides = {}) {
  const dir = join(temp, name);
  const pkgPath = `${dir}.package.json`;
  const lockPath = `${dir}.package-lock.json`;
  const packages = { '': { dependencies: deps } };
  for (const [dep, version] of Object.entries(deps)) {
    packages[`node_modules/${dep}`] = { version };
  }
  Object.assign(packages, overrides);
  writeFileSync(pkgPath, JSON.stringify({ dependencies: deps }));
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
    'requires locked @nestjs/platform-fastify@11.2.3',
  );
  console.log('SECURE FASTIFY STACK SELF-TEST PASS');
} finally {
  rmSync(temp, { recursive: true, force: true });
}
