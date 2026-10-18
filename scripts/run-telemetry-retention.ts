#!/usr/bin/env node
/**
 * Operator entry point for Wave 10 telemetry retention.
 *
 * The service is deliberately not scheduled: nothing in the process runs retention on its own. This
 * script is the operator-invoked path the Telemetry Storage Strategy requires, and it is shaped so the
 * evidence comes before the deletion:
 *
 *   npm run retention:run -- --tenant <id> --dry-run          # what would happen
 *   npm run retention:run -- --tenant <id>                    # destructive pass, batched and budgeted
 *
 * Exit codes: 0 = ran (or dry-run reported), 1 = failed, 2 = usage or environment error,
 * 3 = skipped because another run holds the tenant's advisory lock.
 *
 * The live proof used by CI is still `npm run retention:probe`; this script is for real operator runs
 * and calls the same service, so the two cannot drift in behaviour.
 */
import { PrismaClient } from '@prisma/client';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TelemetryRetentionService } from '../src/telemetry/telemetry-retention.service';
import { PrismaService } from '../src/prisma/prisma.service';

function resolveDatabaseUrl(envFile: string): string | undefined {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const absolute = resolve(process.cwd(), envFile);
  if (!existsSync(absolute)) return undefined;
  for (const line of readFileSync(absolute, 'utf8').split('\n')) {
    const match = /^\s*DATABASE_URL\s*=\s*(.*)\s*$/.exec(line);
    if (match) return match[1].replace(/^["']|["']$/g, '');
  }
  return undefined;
}

const BUCKET_MS: Record<string, number> = {
  '15m': 15 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
};

interface CliOptions {
  tenantId: string;
  retentionMs: number;
  bucketMs: number;
  batchSize: number;
  maxDurationMs: number;
  dryRun: boolean;
}

function usage(message: string): never {
  console.error(`RETENTION RUN ERROR: ${message}`);
  console.error(
    'Usage: npm run retention:run -- --tenant <id> [--retention-days 30] [--bucket 15m|1h|1d] ' +
      '[--batch-size 5000] [--max-duration-seconds 300] [--dry-run]',
  );
  process.exit(2);
}

function parseOptions(argv: string[]): CliOptions {
  const values = new Map<string, string>();
  let dryRun = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (!argument.startsWith('--')) {
      usage(`unexpected argument "${argument}"`);
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      usage(`"${argument}" expects a value`);
    }
    values.set(argument, value);
    index += 1;
  }

  const allowed = new Set([
    '--tenant',
    '--retention-days',
    '--bucket',
    '--batch-size',
    '--max-duration-seconds',
  ]);
  for (const key of values.keys()) {
    if (!allowed.has(key)) {
      usage(`unknown option "${key}"`);
    }
  }

  // Never unscoped. The service refuses a missing tenant too; this is the operator-facing half of the
  // same rule, so the mistake dies at the command line rather than at the database.
  const tenantId = values.get('--tenant');
  if (!tenantId) {
    usage('--tenant is required; retention must never run unscoped');
  }

  const retentionDays = Number(values.get('--retention-days') ?? '30');
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) {
    usage('--retention-days must be a positive number');
  }

  const bucket = values.get('--bucket') ?? '15m';
  const bucketMs = BUCKET_MS[bucket];
  if (bucketMs === undefined) {
    usage('--bucket must be one of 15m, 1h, 1d');
  }

  const batchSize = Number(values.get('--batch-size') ?? '5000');
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    usage('--batch-size must be a positive integer');
  }

  const maxDurationSeconds = Number(values.get('--max-duration-seconds') ?? '300');
  if (!Number.isFinite(maxDurationSeconds) || maxDurationSeconds < 1) {
    usage('--max-duration-seconds must be a positive number');
  }

  return {
    tenantId,
    retentionMs: Math.round(retentionDays * 24 * 60 * 60 * 1000),
    bucketMs,
    batchSize,
    maxDurationMs: Math.round(maxDurationSeconds * 1000),
    dryRun,
  };
}

const databaseUrl = resolveDatabaseUrl('.env');
if (!databaseUrl) {
  console.error(
    'RETENTION RUN ERROR: no DATABASE_URL. Export it, or generate a .env first (see rescue:env:init).',
  );
  process.exit(2);
}

const options = parseOptions(process.argv.slice(2));
const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const service = new TelemetryRetentionService(prisma as unknown as PrismaService);

service
  .rollupAndPrune(options)
  .then((result) => {
    console.log(
      `[retention-run-json] ${JSON.stringify({
        ...result,
        cutoff: result.cutoff.toISOString(),
        retentionDays: options.retentionMs / (24 * 60 * 60 * 1000),
        bucketMs: options.bucketMs,
        batchSize: options.batchSize,
        maxDurationMs: options.maxDurationMs,
      })}`,
    );

    if (result.skipped) {
      console.warn(
        'RETENTION RUN SKIPPED: another run holds this tenant\'s advisory lock; nothing was written or removed.',
      );
      process.exitCode = 3;
      return;
    }

    if (result.dryRun) {
      console.log(
        `DRY RUN: would write ${result.wouldWriteBuckets ?? 0} rollup bucket(s) and remove ${result.wouldPrune ?? 0} raw row(s).`,
      );
      return;
    }

    console.log(
      `RETENTION RUN DONE: ${result.bucketsWritten} rollup bucket(s) written, ${result.rowsPruned} raw row(s) removed in ${result.durationMs}ms${result.stoppedEarly ? ' (budget reached; re-run to continue)' : ''}.`,
    );
  })
  .catch((error) => {
    console.error('RETENTION RUN ERROR:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
