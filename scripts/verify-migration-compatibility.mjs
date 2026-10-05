#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const argValue = (name) => argv.find((v) => v.startsWith(`--${name}=`))?.slice(name.length + 3);
const root = path.resolve(argValue('root') ?? path.resolve(import.meta.dirname, '..'));
const policyPath = path.resolve(root, argValue('policy') ?? 'ops/security/migration-compatibility-policy.json');
const migrationsRoot = path.resolve(root, argValue('migrations') ?? 'prisma/migrations');

const destructivePatterns = [
  ['DROP_TABLE', /\bDROP\s+TABLE\b/i],
  ['DROP_COLUMN', /\bDROP\s+COLUMN\b/i],
  ['DROP_CONSTRAINT', /\bDROP\s+CONSTRAINT\b/i],
  ['TRUNCATE', /\bTRUNCATE\b/i],
  ['DELETE_FROM', /\bDELETE\s+FROM\b/i],
  ['ALTER_COLUMN_TYPE', /\bALTER\s+COLUMN\b[^;]*\bTYPE\b/is],
  ['SET_NOT_NULL', /\bALTER\s+COLUMN\b[^;]*\bSET\s+NOT\s+NULL\b/is],
  ['RENAME', /\bRENAME\s+(?:COLUMN|TABLE|TO)\b/i],
];

function fail(message) {
  console.error(`FAIL  ${message}`);
  process.exit(1);
}
function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}
if (!existsSync(policyPath)) fail(`migration compatibility policy missing: ${policyPath}`);
if (!existsSync(migrationsRoot)) fail(`migration directory missing: ${migrationsRoot}`);
let policy;
try { policy = JSON.parse(readFileSync(policyPath, 'utf8')); } catch (error) { fail(`invalid migration compatibility policy JSON: ${error.message}`); }
if (policy.schemaVersion !== 1 || !Array.isArray(policy.approvedHistoricalMigrations) || typeof policy.historicalCutoffMigration !== 'string' || !policy.historicalCutoffMigration) fail('migration compatibility policy contract is invalid');
const historicalCutoffMigration = policy.historicalCutoffMigration;
const approved = new Map();
for (const item of policy.approvedHistoricalMigrations) {
  if (!item || typeof item.name !== 'string' || !/^[a-f0-9]{64}$/.test(item.sha256 ?? '') || typeof item.reason !== 'string' || item.reason.trim().length < 8) {
    fail('migration compatibility policy contains an invalid approval entry');
  }
  if (approved.has(item.name)) fail(`duplicate migration compatibility approval: ${item.name}`);
  approved.set(item.name, item);
}

const seenApproved = new Set();
const violations = [];
for (const entry of readdirSync(migrationsRoot, { withFileTypes: true }).filter((e) => e.isDirectory()).sort((a,b)=>a.name.localeCompare(b.name))) {
  const sqlPath = path.join(migrationsRoot, entry.name, 'migration.sql');
  if (!existsSync(sqlPath)) continue;
  const sql = readFileSync(sqlPath, 'utf8');
  const hits = destructivePatterns.filter(([, regex]) => regex.test(sql)).map(([name]) => name);
  if (hits.length === 0) continue;
  const allowance = approved.get(entry.name);
  if (entry.name > historicalCutoffMigration) {
    violations.push(`${entry.name}: destructive/backward-incompatible SQL is forbidden after historical cutoff ${historicalCutoffMigration}; use expand-contract (${hits.join(', ')})`);
    continue;
  }
  if (!allowance) {
    violations.push(`${entry.name}: destructive/backward-incompatible SQL requires reviewed expand-contract approval (${hits.join(', ')})`);
    continue;
  }
  const observed = sha256(sqlPath);
  if (observed !== allowance.sha256) {
    violations.push(`${entry.name}: approved historical migration hash changed (expected ${allowance.sha256}, got ${observed})`);
    continue;
  }
  seenApproved.add(entry.name);
}
for (const name of approved.keys()) {
  if (name > historicalCutoffMigration) violations.push(`${name}: policy may not whitelist destructive migrations after historical cutoff ${historicalCutoffMigration}`);
  if (!seenApproved.has(name)) violations.push(`${name}: policy approval is stale or migration no longer matches a destructive pattern`);
}
if (violations.length) fail(`migration rollback-compatibility gate rejected source:\n- ${violations.join('\n- ')}`);
console.log(`PASS  migration rollback-compatibility policy: ${approved.size} reviewed historical migration(s) through ${historicalCutoffMigration}; future destructive SQL is fail-closed.`);
