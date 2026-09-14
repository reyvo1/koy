#!/usr/bin/env node
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const verifierText = readFileSync(
  resolve(import.meta.dirname, 'verify-fastify-v5-compat.mjs'),
  'utf8',
);
const temp = mkdtempSync(join(tmpdir(), 'iot-fastify-v5-compat-'));

function runCase(label, source, expectedCode, expectedText) {
  const root = join(temp, label.replace(/[^a-z0-9]+/gi, '-'));
  mkdirSync(join(root, 'scripts'), { recursive: true });
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(join(root, 'scripts', 'verify-fastify-v5-compat.mjs'), verifierText);
  writeFileSync(join(root, 'src', 'sample.ts'), source);

  const result = spawnSync(
    process.execPath,
    [join(root, 'scripts', 'verify-fastify-v5-compat.mjs')],
    { encoding: 'utf8' },
  );
  const output = `${result.stdout}${result.stderr}`;
  if (result.status !== expectedCode || !output.includes(expectedText)) {
    throw new Error(`${label} failed: status=${result.status} output=${output}`);
  }
  console.log(`PASS  ${label}`);
}

try {
  runCase(
    'routeOptions Fastify v5 API passes',
    'const route = request.routeOptions?.url;\\n',
    0,
    'no removed Fastify v4',
  );
  runCase(
    'routerPath Fastify v4 API is rejected',
    'const route = request.routerPath;\\n',
    1,
    'request.routerPath',
  );
  runCase(
    'request.connection Fastify v4 API is rejected',
    'const ip = request.connection.remoteAddress;\\n',
    1,
    'request.connection',
  );
  console.log('FASTIFY V5 COMPAT SELF-TEST PASS');
} finally {
  rmSync(temp, { recursive: true, force: true });
}
