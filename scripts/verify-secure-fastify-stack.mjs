#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const packagePath = resolve(process.env.SECURE_STACK_PACKAGE_PATH || resolve(root, 'package.json'));
const lockPath = resolve(process.env.SECURE_STACK_LOCK_PATH || resolve(root, 'package-lock.json'));
const pkg = JSON.parse(readFileSync(packagePath, 'utf8'));
const lock = JSON.parse(readFileSync(lockPath, 'utf8'));

const required = new Map([
  ['@nestjs/common', '11.2.3'],
  ['@nestjs/core', '11.2.3'],
  ['@nestjs/platform-fastify', '11.2.3'],
  ['fastify', '5.10.0'],
  ['@fastify/cors', '11.3.0'],
  ['@fastify/static', '10.1.2'],
]);

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

for (const [name, expected] of required) {
  const declared = pkg.dependencies?.[name];
  if (declared !== expected) {
    throw new Error(`Secure stack requires exact ${name}@${expected}; package.json has ${declared ?? 'missing'}`);
  }
  const locked = lock.packages?.[`node_modules/${name}`]?.version;
  if (locked !== expected) {
    throw new Error(`Secure stack requires locked ${name}@${expected}; package-lock has ${locked ?? 'missing'}`);
  }
}

for (const [entry, metadata] of Object.entries(lock.packages ?? {})) {
  if (!entry.endsWith('/@fastify/middie') && entry !== 'node_modules/@fastify/middie') continue;
  const version = metadata?.version;
  if (!version || compare(version, '9.3.3') < 0) {
    throw new Error(`Vulnerable @fastify/middie remains in lockfile at ${entry}: ${version ?? 'unknown'}`);
  }
}

const platform = lock.packages?.['node_modules/@nestjs/platform-fastify'];
if (compare(platform?.version, '11.1.16') < 0) {
  throw new Error(`@nestjs/platform-fastify must be >=11.1.16; found ${platform?.version ?? 'missing'}`);
}

console.log('PASS  secure NestJS/Fastify dependency boundary is locked');
