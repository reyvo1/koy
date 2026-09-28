#!/usr/bin/env node

import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const fixture = mkdtempSync(path.join(os.tmpdir(), 'iot-baseline-manifest-'));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function run(mode) {
  return spawnSync(process.execPath, ['scripts/manage-baseline-manifest.mjs', mode], {
    cwd: fixture,
    encoding: 'utf8',
    windowsHide: true,
  });
}

try {
  mkdirSync(path.join(fixture, 'scripts'), { recursive: true });
  mkdirSync(path.join(fixture, 'apps/admin-web'), { recursive: true });
  cpSync(path.join(root, 'scripts/manage-baseline-manifest.mjs'), path.join(fixture, 'scripts/manage-baseline-manifest.mjs'));
  writeFileSync(path.join(fixture, 'package.json'), '{"name":"fixture"}\n');
  writeFileSync(path.join(fixture, 'apps/admin-web/source.ts'), 'export const value = 1;\n');
  writeFileSync(path.join(fixture, 'apps/admin-web/tsconfig.tsbuildinfo'), '{"fixture":true}\n');
  writeFileSync(path.join(fixture, 'apps/admin-web/next-env.d.ts'), 'generated next env variant A\n');
  writeFileSync(path.join(fixture, 'apps/admin-web/custom-types.d.ts'), 'declare const durableType: true;\n');

  let result = run('generate');
  assert(result.status === 0, `generate failed: ${result.stderr || result.stdout}`);
  const tree = readFileSync(path.join(fixture, 'repository-tree.txt'), 'utf8');
  assert(tree.includes('apps/admin-web/source.ts'), 'ordinary source file must remain sealed');
  assert(!tree.includes('tsconfig.tsbuildinfo'), '*.tsbuildinfo must be excluded from sealed source tree');
  assert(!tree.includes('next-env.d.ts'), 'Next.js generated next-env.d.ts must be excluded from sealed source tree');
  assert(tree.includes('custom-types.d.ts'), 'ordinary authored .d.ts files must remain sealed');

  writeFileSync(path.join(fixture, 'apps/admin-web/next-env.d.ts'), 'generated next env variant B\n');
  result = run('verify');
  assert(result.status === 0, `verify must tolerate regenerated next-env.d.ts: ${result.stderr || result.stdout}`);
  console.log('PASS  baseline manifest ignores regenerated Next.js next-env.d.ts but seals authored .d.ts files');

  writeFileSync(
    path.join(fixture, 'apps/admin-web/tsconfig.tsbuildinfo'),
    'generated tsbuildinfo variant B\n',
  );
  result = run('verify');
  assert(result.status === 0, `verify must tolerate regenerated tsbuildinfo: ${result.stderr || result.stdout}`);
  console.log('PASS  baseline manifest ignores regenerated *.tsbuildinfo files at arbitrary source depth');

  // Prove repository-tree ordering is deterministic and does not depend on host locale.
  // The mixed case names intentionally sort differently under localeCompare() on some hosts.
  writeFileSync(path.join(fixture, 'apps/admin-web/README.ts'), 'export const upper = true;\n');
  writeFileSync(path.join(fixture, 'apps/admin-web/agent.ts'), 'export const lower = true;\n');
  result = run('generate');
  assert(result.status === 0, `deterministic ordering generate failed: ${result.stderr || result.stdout}`);
  const orderedTree = readFileSync(path.join(fixture, 'repository-tree.txt'), 'utf8')
    .split(/\r?\n/)
    .filter(Boolean);
  const codePointSortedTree = [...orderedTree].sort();
  assert(
    JSON.stringify(orderedTree) === JSON.stringify(codePointSortedTree),
    'repository-tree ordering must use deterministic code-point order, not host locale collation',
  );
  console.log('PASS  baseline manifest tree ordering is deterministic across host locales');

  // Prove source sealing is invariant across equivalent LF/CRLF text checkouts.
  const sourcePath = path.join(fixture, 'apps/admin-web/source.ts');
  const cmdPath = path.join(fixture, 'tools/operator.cmd');
  mkdirSync(path.dirname(cmdPath), { recursive: true });

  writeFileSync(sourcePath, 'export const value = 1;\n');
  writeFileSync(cmdPath, '@echo off\r\necho ok\r\n');
  result = run('generate');
  assert(result.status === 0, `portable generate failed: ${result.stderr || result.stdout}`);
  const manifestLf = readFileSync(path.join(fixture, 'BASELINE-MANIFEST.sha256'), 'utf8');

  writeFileSync(sourcePath, 'export const value = 1;\r\n');
  writeFileSync(cmdPath, '@echo off\necho ok\n');
  result = run('generate');
  assert(result.status === 0, `portable CRLF generate failed: ${result.stderr || result.stdout}`);
  const manifestCrlf = readFileSync(path.join(fixture, 'BASELINE-MANIFEST.sha256'), 'utf8');

  assert(
    manifestLf === manifestCrlf,
    'equivalent LF/CRLF checkouts must produce identical sealed-source manifests',
  );
  console.log('PASS  baseline manifest is portable across equivalent LF/CRLF text checkouts');

  writeFileSync(sourcePath, 'export const value = 2;\r\n');
  result = run('verify');
  assert(result.status !== 0, 'real source-content drift must still fail');
  console.log('PASS  baseline manifest still rejects real text-content drift');

  writeFileSync(sourcePath, 'export const value = 1;\n');
  writeFileSync(cmdPath, '@echo off\r\necho ok\r\n');
  result = run('generate');
  assert(result.status === 0, `fixture restore failed: ${result.stderr || result.stdout}`);

  writeFileSync(path.join(fixture, 'apps/admin-web/untracked-source.ts'), 'export const drift = true;\n');
  result = run('verify');
  assert(result.status !== 0, 'verify must still reject an ordinary untracked source file');
  assert((result.stderr + result.stdout).includes('untracked-source.ts'), 'drift failure must identify the ordinary untracked file');
  console.log('PASS  baseline manifest still rejects ordinary untracked source drift');
  rmSync(path.join(fixture, 'apps/admin-web/untracked-source.ts'), { force: true });
  result = run('verify');
  assert(result.status === 0, `verify must pass again after the drift is removed: ${result.stderr || result.stdout}`);

  // Wave 3 regression: the ESP-IDF build tree and the QEMU boot runner both write
  // large native artifacts into packages/esp32-sdk/test-app/build. The firmware CI job
  // must not leave them behind as unsealed source, because the independent rescue job
  // re-runs `baseline:manifest:verify` against a checkout that shares that path.
  const espBuild = path.join(fixture, 'packages/esp32-sdk/test-app/build');
  mkdirSync(espBuild, { recursive: true });
  writeFileSync(path.join(espBuild, 'flasher_args.json'), '{"flash_files":{}}\n');
  writeFileSync(path.join(espBuild, 'iot_sdk_wave3_test_app.bin'), Buffer.from([0xe9, 0x01, 0x02]));
  writeFileSync(path.join(espBuild, 'wave3-qemu-esp32.bin'), Buffer.alloc(4096, 0xff));
  writeFileSync(path.join(espBuild, 'wave3-qemu-esp32-efuse.bin'), Buffer.alloc(124, 0x00));
  mkdirSync(path.join(espBuild, 'config'), { recursive: true });
  writeFileSync(path.join(espBuild, 'config/sdkconfig.h'), '#define CONFIG_IDF_TARGET "esp32"\n');
  mkdirSync(path.join(espBuild, 'esp-idf', 'log'), { recursive: true });
  writeFileSync(path.join(espBuild, 'esp-idf/log/idf_py_stderr_output_x'), 'toolchain log\n');

  result = run('verify');
  assert(result.status === 0, `verify must ignore the ESP-IDF build output tree: ${result.stderr || result.stdout}`);
  console.log('PASS  baseline manifest ignores the ESP-IDF build output tree');

  result = run('generate');
  assert(result.status === 0, `generate must ignore the ESP-IDF build output tree: ${result.stderr || result.stdout}`);
  const rebuiltTree = readFileSync(path.join(fixture, 'repository-tree.txt'), 'utf8');
  assert(!rebuiltTree.includes('test-app/build'), 'ESP-IDF build output must never enter the sealed source tree');
  assert(rebuiltTree.includes('packages/esp32-sdk/test-app') === false || rebuiltTree.includes('source.ts'),
    'sealing unrelated project source must still work alongside the excluded build tree');
  console.log('PASS  baseline manifest never seals ESP-IDF build or QEMU boot artifacts');

  // The exclusion must not over-reach: a hand-authored directory named build is
  // indistinguishable by name alone, so the contract is explicit and tested rather
  // than accidental. Removing the exclusion must make these files drift.
  const withoutExclusion = readFileSync(path.join(fixture, 'scripts/manage-baseline-manifest.mjs'), 'utf8')
    .replace("const excludedDirectoryNames = new Set(['build']);", 'const excludedDirectoryNames = new Set([]);');
  assert(withoutExclusion !== readFileSync(path.join(fixture, 'scripts/manage-baseline-manifest.mjs'), 'utf8'),
    'build exclusion must be present in the manifest manager');
  writeFileSync(path.join(fixture, 'scripts/manage-baseline-manifest.mjs'), withoutExclusion);
  result = run('verify');
  assert(result.status !== 0, 'removing the build exclusion must reintroduce the Wave 3 seal failure');
  assert((result.stderr + result.stdout).includes('wave3-qemu-esp32.bin'),
    'the build-exclusion regression must fail on the QEMU boot artifact specifically');
  console.log('PASS  baseline manifest build exclusion is load-bearing, not incidental');
} finally {
  rmSync(fixture, { recursive: true, force: true });
}
