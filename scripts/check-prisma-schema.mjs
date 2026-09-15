#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SCHEMA_ONLY_DATABASE_URL =
  'postgresql://wave2_schema:wave2_schema@127.0.0.1:1/wave2_schema?schema=public';

export function resolveSchemaCheckDatabaseUrl(environment = process.env) {
  const configured = String(environment.DATABASE_URL ?? '').trim();
  if (configured.length > 0) {
    return { databaseUrl: configured, usedFallback: false };
  }

  return { databaseUrl: SCHEMA_ONLY_DATABASE_URL, usedFallback: true };
}

export function resolvePrismaCliEntryPoint() {
  const require = createRequire(import.meta.url);
  const prismaPackageJson = require.resolve('prisma/package.json');
  return resolve(dirname(prismaPackageJson), 'build', 'index.js');
}

export function runPrismaSchemaCheck({
  environment = process.env,
  cliEntryPoint = resolvePrismaCliEntryPoint(),
} = {}) {
  const { databaseUrl, usedFallback } =
    resolveSchemaCheckDatabaseUrl(environment);
  const childEnvironment = {
    ...environment,
    DATABASE_URL: databaseUrl,
  };

  for (const command of ['validate', 'generate']) {
    const result = spawnSync(process.execPath, [cliEntryPoint, command], {
      cwd: process.cwd(),
      env: childEnvironment,
      stdio: 'inherit',
      windowsHide: true,
    });

    if (result.error) {
      throw result.error;
    }

    if (result.status !== 0) {
      throw new Error(
        `Prisma ${command} failed with exit code ${result.status ?? 'unknown'}`,
      );
    }
  }

  console.log(
    usedFallback
      ? 'PASS  Prisma validate/generate used a schema-only local DATABASE_URL fallback; no live database evidence is claimed.'
      : 'PASS  Prisma validate/generate used the caller-provided DATABASE_URL.',
  );

  return { usedFallback };
}

const invokedAsScript =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedAsScript) {
  try {
    runPrismaSchemaCheck();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
