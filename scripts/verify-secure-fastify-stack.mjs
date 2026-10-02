#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const packagePath = resolve(process.env.SECURE_STACK_PACKAGE_PATH || resolve(root, 'package.json'));
const lockPath = resolve(process.env.SECURE_STACK_LOCK_PATH || resolve(root, 'package-lock.json'));
const pkg = JSON.parse(readFileSync(packagePath, 'utf8'));
const lock = JSON.parse(readFileSync(lockPath, 'utf8'));

// Minimum versions, not exact pins. An exact pin is a trap: it fails the moment a security fix lands, which
// trains everyone to work around the gate, and it offers no protection beyond the version it names. A floor
// states the requirement directly -- "at or above the version that fixes the advisory" -- and keeps holding
// when the dependency moves forward.
//
// Floors track the advisories, not habit:
//   GHSA-9c5c-9qcx-q35q  path-scoped middleware bypass via absolute-form request targets
//                        (@nestjs/platform-fastify < 11.2.4)
//   GHSA-p68q-wchp-6fh7  authentication bypass via malformed URLs          (fastify < 5.12.2)
//   GHSA-4mh8-r7rc-xpvc  DoS via unhandled HTTP/2 trailer exception         (fastify < 5.12.5)
//   GHSA-667r-xxjv-c9mm  request body replacement via async validation collision (fastify < 5.12.2)
const required = new Map([
  ['@nestjs/common', '11.2.3'],
  ['@nestjs/core', '11.2.3'],
  ['@nestjs/platform-fastify', '11.2.4'],
  ['fastify', '5.12.5'],
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

/** Strips a semver range so `^11.2.7` is compared as 11.2.7. */
function concrete(spec) {
  const match = /(\d+)\.(\d+)\.(\d+)/.exec(String(spec ?? ''));
  if (!match) throw new Error(`Cannot read a concrete version from: ${spec}`);
  return `${match[1]}.${match[2]}.${match[3]}`;
}

for (const [name, floor] of required) {
  const declared = pkg.dependencies?.[name];
  if (!declared) {
    throw new Error(`Secure stack requires ${name}@>=${floor}; package.json does not declare it`);
  }
  // The DECLARATION is floored too. Pinning an exact vulnerable string in package.json would satisfy an
  // exact-match check and reinstate the advisory, which is the failure mode this gate exists to prevent.
  if (compare(concrete(declared), floor) < 0) {
    throw new Error(`Secure stack requires ${name}@>=${floor}; package.json declares ${declared}`);
  }
  const locked = lock.packages?.[`node_modules/${name}`]?.version;
  if (!locked || compare(locked, floor) < 0) {
    throw new Error(`Secure stack requires locked ${name}@>=${floor}; package-lock has ${locked ?? 'missing'}`);
  }
}

// platform-fastify depends on its own fastify, so flooring only the direct dependency can leave a second,
// vulnerable copy nested inside it. The override is what forces the whole tree onto one version.
if (pkg.overrides?.fastify !== '$fastify') {
  throw new Error(
    'Secure stack requires overrides.fastify="$fastify" so the nested fastify under @nestjs/platform-fastify ' +
      `cannot resolve to a vulnerable copy; found ${pkg.overrides?.fastify ?? 'nothing'}`,
  );
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
