#!/usr/bin/env node
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  SCHEMA_ONLY_DATABASE_URL,
  resolveSchemaCheckDatabaseUrl,
  runPrismaSchemaCheck,
} from './check-prisma-schema.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(`FAIL  ${message}`);
  console.log(`PASS  ${message}`);
}

const missing = resolveSchemaCheckDatabaseUrl({});
assert(
  missing.usedFallback && missing.databaseUrl === SCHEMA_ONLY_DATABASE_URL,
  'Prisma schema check supplies a deterministic non-production fallback when DATABASE_URL is absent',
);

const explicitUrl = 'postgresql://real_user:real_password@db.internal:5432/iot';
const explicit = resolveSchemaCheckDatabaseUrl({ DATABASE_URL: explicitUrl });
assert(
  !explicit.usedFallback && explicit.databaseUrl === explicitUrl,
  'Prisma schema check preserves a caller-provided DATABASE_URL for CI/runtime environments',
);

const blank = resolveSchemaCheckDatabaseUrl({ DATABASE_URL: '   ' });
assert(
  blank.usedFallback && blank.databaseUrl === SCHEMA_ONLY_DATABASE_URL,
  'blank DATABASE_URL cannot bypass the schema-only fallback',
);

const directory = mkdtempSync(join(tmpdir(), 'wave2-prisma-check-'));
const fakeCli = join(directory, 'fake-prisma.mjs');
const observationFile = join(directory, 'observations.jsonl');
writeFileSync(
  fakeCli,
  `import { appendFileSync } from 'node:fs';\nappendFileSync(process.env.WAVE2_PRISMA_OBSERVATION_FILE, JSON.stringify({command: process.argv[2], databaseUrl: process.env.DATABASE_URL}) + '\\n');\n`,
  'utf8',
);

try {
  const result = runPrismaSchemaCheck({
    environment: {
      ...process.env,
      DATABASE_URL: '',
      WAVE2_PRISMA_OBSERVATION_FILE: observationFile,
    },
    cliEntryPoint: fakeCli,
  });
  assert(result.usedFallback, 'schema check marks fallback usage explicitly');

  const observations = (await import('node:fs')).readFileSync(observationFile, 'utf8')
    .trim()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line));
  assert(
    observations.length === 2 &&
      observations[0]?.command === 'validate' &&
      observations[1]?.command === 'generate',
    'Prisma schema check executes validate then generate exactly once',
  );
  assert(
    observations.every((entry) => entry.databaseUrl === SCHEMA_ONLY_DATABASE_URL),
    'fallback DATABASE_URL is scoped into both Prisma subprocesses',
  );
} finally {
  rmSync(directory, { recursive: true, force: true });
}

console.log('WAVE 2 PRISMA SCHEMA-CHECK SELF-TEST PASS');
