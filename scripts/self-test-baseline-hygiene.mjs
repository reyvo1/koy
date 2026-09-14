#!/usr/bin/env node
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const cleaner = resolve(import.meta.dirname, 'clean-generated-build-artifacts.mjs');
const temp = mkdtempSync(join(tmpdir(), 'iot-baseline-hygiene-'));

function ensure(path) {
  mkdirSync(path, { recursive: true });
}

try {
  ensure(join(temp, 'dist'));
  ensure(join(temp, 'apps', 'admin-web', '.next'));
  ensure(join(temp, 'apps', 'user-web', '.next'));
  ensure(join(temp, 'apps', 'admin-web', 'src'));
  ensure(join(temp, 'src'));

  writeFileSync(join(temp, 'dist', 'main.js'), 'generated');
  writeFileSync(join(temp, 'apps', 'admin-web', '.next', 'BUILD_ID'), 'generated');
  writeFileSync(join(temp, 'apps', 'user-web', '.next', 'BUILD_ID'), 'generated');
  writeFileSync(join(temp, 'apps', 'admin-web', 'src', 'cache.tsbuildinfo'), 'generated');
  writeFileSync(join(temp, 'src', 'keep.ts'), 'source');
  writeFileSync(join(temp, 'README.md'), 'source');

  const result = spawnSync(process.execPath, [cleaner], {
    encoding: 'utf8',
    env: { ...process.env, BASELINE_HYGIENE_ROOT: temp },
  });
  const output = `${result.stdout}${result.stderr}`;
  if (result.status !== 0) throw new Error(output);

  const deleted = [
    join(temp, 'dist'),
    join(temp, 'apps', 'admin-web', '.next'),
    join(temp, 'apps', 'user-web', '.next'),
    join(temp, 'apps', 'admin-web', 'src', 'cache.tsbuildinfo'),
  ];
  for (const path of deleted) {
    if (existsSync(path)) throw new Error(`expected generated artifact to be removed: ${path}`);
  }

  const preserved = [
    join(temp, 'src', 'keep.ts'),
    join(temp, 'README.md'),
  ];
  for (const path of preserved) {
    if (!existsSync(path)) throw new Error(`source path was removed unexpectedly: ${path}`);
  }

  console.log('PASS  generated build outputs are removed');
  console.log('PASS  ordinary source files are preserved');
  console.log('BASELINE HYGIENE SELF-TEST PASS');
} finally {
  rmSync(temp, { recursive: true, force: true });
}
