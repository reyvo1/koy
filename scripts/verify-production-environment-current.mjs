#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const argv = process.argv.slice(2);
const arg = (name) => argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const evidencePath = path.resolve(arg('evidence') ?? 'production-environment-evidence.json');
const runtimeEnvPath = path.resolve(arg('env') ?? '/etc/iot-platform/iot-platform.env');
const backupEnvPath = path.resolve(arg('backup-env') ?? '/etc/iot-platform/iot-platform-backup.env');
const fixtureMode = process.env.PRODUCTION_PREFLIGHT_SELF_TEST === '1';
const procOvercommitPath = fixtureMode && arg('proc-overcommit') ? path.resolve(arg('proc-overcommit')) : '/proc/sys/vm/overcommit_memory';

function fail(message, detail = '') {
  console.error(`BLOCKED  ${message}`);
  if (detail) console.error(detail);
  process.exit(1);
}
function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}
function requireFile(file, label) {
  if (!existsSync(file) || !statSync(file).isFile()) fail(`${label} is missing: ${file}`);
}
function requireProtected(file, expectedOwner) {
  const mode = (statSync(file).mode & 0o777).toString(8).padStart(4, '0');
  if (mode !== '0640') fail(`${file} must have mode 0640; got ${mode}`);
  if (!fixtureMode) {
    const result = spawnSync('stat', ['-c', '%U:%G', file], { encoding: 'utf8' });
    if (result.status !== 0) fail(`could not determine owner for ${file}`);
    if (result.stdout.trim() !== expectedOwner) fail(`${file} must be owned by ${expectedOwner}; got ${result.stdout.trim()}`);
  }
}

requireFile(evidencePath, 'production environment evidence');
requireFile(runtimeEnvPath, 'runtime environment');
requireFile(backupEnvPath, 'backup environment');

const structural = spawnSync(
  process.execPath,
  [path.resolve(import.meta.dirname, 'verify-production-environment-evidence.mjs'), `--file=${evidencePath}`],
  { encoding: 'utf8', windowsHide: true },
);
if (structural.status !== 0) {
  fail('production environment evidence contract verification failed', `${structural.stdout ?? ''}${structural.stderr ?? ''}`.trim());
}

let evidence;
try {
  evidence = JSON.parse(readFileSync(evidencePath, 'utf8'));
} catch (error) {
  fail(`production environment evidence is not valid JSON: ${error.message}`);
}

if (!fixtureMode && process.version.split('.')[0] !== 'v22') fail(`Node.js 22 is required; got ${process.version}`);
if (!existsSync(procOvercommitPath) || readFileSync(procOvercommitPath, 'utf8').trim() !== '1') {
  fail('vm.overcommit_memory must still equal 1 at deployment time');
}
requireProtected(runtimeEnvPath, 'root:iot-platform');
requireProtected(backupEnvPath, 'root:postgres');
if (sha256(runtimeEnvPath) !== evidence.runtimeEnvSha256) fail('runtime environment changed after production preflight approval');
if (sha256(backupEnvPath) !== evidence.backupEnvSha256) fail('backup environment changed after production preflight approval');

console.log('PASS  current production environment still matches approved preflight evidence.');
