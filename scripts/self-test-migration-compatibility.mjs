#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = path.resolve(import.meta.dirname, '..');
const verifier = path.join(repoRoot, 'scripts/verify-migration-compatibility.mjs');
const temp = mkdtempSync(path.join(os.tmpdir(), 'iot-migration-compat-'));
const migrations = path.join(temp, 'prisma/migrations');
const policyPath = path.join(temp, 'ops/security/migration-compatibility-policy.json');
function write(relative, content) { const file = path.join(temp, relative); mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, content); return file; }
function digest(file) { return createHash('sha256').update(readFileSync(file)).digest('hex'); }
function run() { return spawnSync(process.execPath, [verifier, `--root=${temp}`], { encoding:'utf8' }); }
function expect(ok, message, result) { if (!ok) throw new Error(`${message}\n${result?.stdout ?? ''}${result?.stderr ?? ''}`); }
try {
  write('prisma/migrations/001_safe/migration.sql', 'ALTER TABLE "devices" ADD COLUMN "label" TEXT;\n');
  write('ops/security/migration-compatibility-policy.json', JSON.stringify({ schemaVersion:1, historicalCutoffMigration:'002_risky', approvedHistoricalMigrations:[] }, null, 2));
  let result = run();
  expect(result.status === 0, 'safe additive migration was rejected', result);

  const risky = write('prisma/migrations/002_risky/migration.sql', 'ALTER TABLE "devices" DROP COLUMN "label";\n');
  result = run();
  expect(result.status !== 0 && `${result.stdout}${result.stderr}`.includes('002_risky'), 'unapproved destructive migration was not rejected', result);

  write('ops/security/migration-compatibility-policy.json', JSON.stringify({ schemaVersion:1, historicalCutoffMigration:'002_risky', approvedHistoricalMigrations:[{name:'002_risky',sha256:digest(risky),reason:'fixture reviewed historical destructive migration'}] }, null, 2));
  result = run();
  expect(result.status === 0, 'hash-pinned reviewed destructive migration was rejected', result);

  writeFileSync(risky, 'ALTER TABLE "devices" DROP COLUMN "label";\n-- tampered\n');
  result = run();
  expect(result.status !== 0 && `${result.stdout}${result.stderr}`.includes('hash changed'), 'tampered approved migration was not rejected', result);

  writeFileSync(risky, 'ALTER TABLE "devices" DROP COLUMN "label";\n');
  const future = write('prisma/migrations/003_future_contract/migration.sql', 'ALTER TABLE "devices" DROP COLUMN "future_field";\n');
  write('ops/security/migration-compatibility-policy.json', JSON.stringify({ schemaVersion:1, historicalCutoffMigration:'002_risky', approvedHistoricalMigrations:[{name:'002_risky',sha256:digest(risky),reason:'fixture reviewed historical destructive migration'},{name:'003_future_contract',sha256:digest(future),reason:'attempted future destructive whitelist must not bypass expand-contract'}] }, null, 2));
  result = run();
  expect(result.status !== 0 && `${result.stdout}${result.stderr}`.includes('forbidden after historical cutoff'), 'future destructive migration was bypassed by editing the policy whitelist', result);

  console.log('PASS  additive migrations pass without exception.');
  console.log('PASS  new destructive migrations fail closed.');
  console.log('PASS  reviewed historical destructive migrations require an exact SHA-256.');
  console.log('PASS  tampering a reviewed destructive migration is rejected.');
  console.log('PASS  future destructive migrations cannot be whitelisted past the historical cutoff.');
} finally { rmSync(temp, { recursive:true, force:true }); }
