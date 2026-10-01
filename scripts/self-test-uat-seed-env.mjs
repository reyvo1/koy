#!/usr/bin/env node
/**
 * The UAT seed must be able to find its database on a clean CI runner.
 *
 * The CI acceptance job generates its configuration with `rescue:env:init --output=.env` and every
 * other step passes that file explicitly with `--env=.env`. The seed step did not, and Prisma resolves
 * DATABASE_URL from the process environment only, so the job died with
 *
 *   error: Environment variable not found: DATABASE_URL. --> schema.prisma:7
 *
 * and never reached the media, camera and location probes it existed to enable. That message points
 * at schema.prisma, which is why the first reading of it looks like a Prisma problem and not like a
 * missing `--env`.
 *
 * This asserts the resolution order directly, without Prisma and without touching the repository
 * `.env` -- a self-test must never rewrite the developer's local configuration.
 */
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseEnv } from './manage-rescue-local-runtime.mjs';

const root = resolve(import.meta.dirname, '..');
const seedSource = await import('node:fs').then((fs) =>
  fs.readFileSync(resolve(root, 'scripts/seed-uat-baseline.mjs'), 'utf8'),
);

// If the resolution logic changes, this probe has to be re-read rather than silently passing on a
// function it no longer describes. A self-test that keeps passing against code it no longer matches
// is the failure mode this whole repository keeps hitting.
const resolutionBody = /function resolveDatabaseUrl\(envFile\) \{\n\s+if \(process\.env\.DATABASE_URL\) return process\.env\.DATABASE_URL;\n\s+return parseEnv\(envFile\)\.DATABASE_URL;\n\}/;
if (!resolutionBody.test(seedSource)) {
  throw new Error(
    'seed-uat-baseline.mjs no longer resolves DATABASE_URL the way this self-test expects; update both together',
  );
}
if (!/resolveDatabaseUrl\('\.env'\)/.test(seedSource)) {
  throw new Error('seed-uat-baseline.mjs does not consult a .env file for DATABASE_URL');
}
// Asserted on the condition, not on the presence of the word. A substring check here passed while
// the guard was `if (false)`, because the string still appeared inside this assertion's own text --
// a false green found by mutation, which is the only way one is ever found.
if (!/if \(!databaseUrl\) \{/.test(seedSource)) {
  throw new Error(
    'seed-uat-baseline.mjs must branch on a missing databaseUrl and name the cause itself; ' +
      'Prisma only reports schema.prisma, which points at the wrong file',
  );
}

function resolveDatabaseUrl(envFile) {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  return parseEnv(envFile).DATABASE_URL;
}

const dir = mkdtempSync(join(tmpdir(), 'seed-env-'));
const envFile = join(dir, '.env');
const saved = process.env.DATABASE_URL;
const cases = [];

try {
  writeFileSync(envFile, 'DATABASE_URL=postgresql://file/from-env\n');

  process.env.DATABASE_URL = 'postgresql://ambient/override';
  cases.push([
    'an exported DATABASE_URL wins over the file, because an explicit override is deliberate',
    resolveDatabaseUrl(envFile) === 'postgresql://ambient/override',
  ]);

  // Cleared explicitly rather than restored to whatever it happened to be. An earlier version restored
  // the ambient value here, so the remaining three cases assumed DATABASE_URL was unset -- true on a
  // bare runner, false on a developer machine with it exported, and the self-test failed there. A
  // self-test has to hold on a host it was not written on, which is the same reason the CI fixture bug
  // went unnoticed for so long.
  delete process.env.DATABASE_URL;

  // The shape that actually failed in CI: nothing in the environment, only the generated file.
  cases.push([
    'the generated .env supplies DATABASE_URL when the environment has none',
    resolveDatabaseUrl(envFile) === 'postgresql://file/from-env',
  ]);

  cases.push([
    'no environment and no file yields undefined, which is what produces the real error message',
    resolveDatabaseUrl(join(dir, 'absent.env')) === undefined,
  ]);

  writeFileSync(envFile, 'JWT_SECRET="quoted-secret"\nDATABASE_URL=postgresql://u:p@h:5432/iot\n');
  cases.push([
    'quoted values from the generated file are unquoted before use',
    resolveDatabaseUrl(envFile) === 'postgresql://u:p@h:5432/iot',
  ]);
} finally {
  if (saved === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = saved;
  rmSync(dir, { recursive: true, force: true });
}

let failed = 0;
for (const [name, ok] of cases) {
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
}

if (failed > 0) {
  console.error(`SEED ENV RESOLUTION SELF-TEST FAILED (${failed}/${cases.length})`);
  process.exit(1);
}
console.log('SEED ENV RESOLUTION SELF-TEST PASS');
