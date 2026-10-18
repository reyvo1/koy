import { Injectable, Logger, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MetricsService } from '../metrics/metrics.service';

/**
 * Wave 10 — telemetry retention with rollups.
 *
 * `telemetry` is the highest-volume table here and, until this, had no lifecycle: nothing was
 * summarised and nothing was removed, so an install only ever grew. Report archives already declare a
 * retention window, but that is an expiry the row states about itself -- readers stop seeing it and the
 * row stays, which is not what a growing table needs.
 *
 * The order is the whole point. A window is summarised first and removed second, so the history
 * survives in rolled-up form. Removing first would destroy it, and summarising after the fact is
 * impossible because the rows are gone. Both steps share one `cutoff`, so the buckets that are written
 * are exactly the windows whose raw rows disappear -- if the two used different boundaries, every
 * retained sample would be counted again on each pass and the chart would over-report.
 *
 * Aggregation runs in the database. Rolling a large window up by loading rows into the process would
 * move the entire hot table through memory, which is the opposite of the point of retention.
 *
 * Hardening pass 2026-10-18, after the database audit and a 1M-row local scale probe:
 * - the whole run executes in one transaction under a per-tenant advisory lock, so a second instance
 *   skips and reports instead of racing (the probe ran two passes; production runs are operator-driven
 *   from more than one host);
 * - removal runs in bounded batches with a wall-clock budget, so a large backlog cannot hold locks
 *   for an unbounded window; a run that hits the budget stops cleanly and reports `stoppedEarly`;
 * - `dryRun` reports what a pass would write and remove without writing anything;
 * - the last value per bucket is computed inside the single aggregate query (`array_agg ... ORDER BY`)
 *   instead of one extra lookup per bucket, which was N+1 on a table this large;
 * - runs emit bounded-cardinality metrics (no tenant or device labels).
 */
const DEFAULT_BATCH_SIZE = 5_000;
const DEFAULT_MAX_DURATION_MS = 300_000;
const ROLLUP_WRITE_CHUNK = 5_000;

export interface RollupAndPruneOptions {
  tenantId: string;
  now?: Date;
  retentionMs: number;
  bucketMs: number;
  batchSize?: number;
  maxDurationMs?: number;
  dryRun?: boolean;
}

export interface RollupAndPruneResult {
  cutoff: Date;
  bucketsWritten: number;
  rowsPruned: number;
  skipped: boolean;
  stoppedEarly: boolean;
  dryRun: boolean;
  durationMs: number;
  /** Rows a dry run would remove; `null` outside dry-run mode. */
  wouldPrune: number | null;
  /** Buckets a dry run would write; `null` outside dry-run mode. */
  wouldWriteBuckets: number | null;
}

@Injectable()
export class TelemetryRetentionService {
  private readonly log = new Logger(TelemetryRetentionService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly metrics?: MetricsService,
  ) {}

  /**
   * Roll up every window that is about to be pruned, then prune it.
   *
   * Returns what happened rather than a boolean, so a caller can prove the two steps agreed instead of
   * inferring it from a green exit code.
   */
  async rollupAndPrune(
    options: RollupAndPruneOptions,
  ): Promise<RollupAndPruneResult> {
    const now = options.now ?? new Date();
    const { retentionMs, bucketMs, tenantId } = options;
    const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
    const maxDurationMs = options.maxDurationMs ?? DEFAULT_MAX_DURATION_MS;
    const dryRun = options.dryRun === true;

    // Required rather than optional, and that is the point. An unscoped retention run is an unbounded
    // DELETE against the largest table in the system, and the live probe found exactly that: one
    // tenant's run removed another tenant's rows along with its own. Every other write path here is
    // tenant-scoped for the same reason, and retention is the one that would be hardest to notice.
    if (!tenantId) {
      throw new RangeError('tenantId is required: retention must never run unscoped');
    }

    // Every window is validated before any write. A zero or negative retention would otherwise read
    // as "delete everything", and a zero bucket width would collapse the whole history into one row --
    // neither is something to discover after the data is gone.
    if (!Number.isFinite(retentionMs) || retentionMs <= 0) {
      throw new RangeError('retentionMs must be a positive number of milliseconds');
    }
    if (!Number.isFinite(bucketMs) || bucketMs <= 0) {
      throw new RangeError('bucketMs must be a positive number of milliseconds');
    }
    if (!Number.isInteger(batchSize) || batchSize < 1) {
      throw new RangeError('batchSize must be a positive integer');
    }
    if (!Number.isFinite(maxDurationMs) || maxDurationMs < 1) {
      throw new RangeError('maxDurationMs must be a positive number of milliseconds');
    }

    const cutoff = new Date(now.getTime() - retentionMs);
    const startedAt = Date.now();
    const lockKey = `telemetry-retention:${tenantId}`;

    this.log.log(
      `telemetry retention: start tenant=${tenantId} cut-off ${cutoff.toISOString()} dryRun=${dryRun} batchSize=${batchSize} budgetMs=${maxDurationMs}`,
    );

    try {
      // One transaction, so the advisory lock covers the whole run: summary, removal, commit. The
      // transaction timeout carries head-room over the removal budget, because a run that stops on
      // its own budget must still be allowed to commit what it did.
      const outcome = await this.prisma.$transaction(
        async (tx) => {
          // Try-lock, not the blocking form: a second instance should skip and say so, not queue
          // behind a run that may take minutes. Released automatically at commit or rollback.
          const lock = await tx.$queryRaw<Array<{ locked: boolean }>>`
            SELECT pg_try_advisory_xact_lock(hashtextextended(${lockKey}, 0)) AS "locked"
          `;

          if (lock[0]?.locked !== true) {
            return {
              skipped: true,
              bucketsWritten: 0,
              rowsPruned: 0,
              stoppedEarly: false,
              wouldPrune: null as number | null,
              wouldWriteBuckets: null as number | null,
            };
          }

          const rollup = await this.rollup(tx, tenantId, cutoff, bucketMs, dryRun);

          if (dryRun) {
            const wouldPrune = await this.countPrunable(tx, tenantId, cutoff);
            return {
              skipped: false,
              bucketsWritten: 0,
              rowsPruned: 0,
              stoppedEarly: false,
              wouldPrune,
              wouldWriteBuckets: rollup.bucketsFound,
            };
          }

          const removal = await this.prune(
            tx,
            tenantId,
            cutoff,
            batchSize,
            maxDurationMs,
            startedAt,
          );

          return {
            skipped: false,
            bucketsWritten: rollup.bucketsFound,
            rowsPruned: removal.rowsPruned,
            stoppedEarly: removal.stoppedEarly,
            wouldPrune: null as number | null,
            wouldWriteBuckets: null as number | null,
          };
        },
        { timeout: maxDurationMs + 60_000, maxWait: 15_000 },
      );

      const durationMs = Date.now() - startedAt;
      const metricOutcome = outcome.skipped
        ? 'skipped'
        : dryRun
          ? 'dry_run'
          : 'succeeded';

      this.metrics?.recordTelemetryRetention(
        metricOutcome,
        durationMs / 1000,
        outcome.rowsPruned,
        outcome.bucketsWritten,
        outcome.stoppedEarly,
      );

      if (outcome.skipped) {
        this.log.warn(
          `telemetry retention: skipped tenant=${tenantId} after ${durationMs}ms -- another run holds the advisory lock`,
        );
      } else if (dryRun) {
        this.log.log(
          `telemetry retention: dry run tenant=${tenantId} in ${durationMs}ms, would write ${outcome.wouldWriteBuckets ?? 0} rollup bucket(s) and remove ${outcome.wouldPrune ?? 0} raw row(s)`,
        );
      } else {
        this.log.log(
          `telemetry retention: cut-off ${cutoff.toISOString()}, ${outcome.bucketsWritten} rollup bucket(s) written, ${outcome.rowsPruned} raw row(s) pruned in ${durationMs}ms${outcome.stoppedEarly ? ' (budget reached; re-run to continue)' : ''}`,
        );
      }

      return {
        cutoff,
        bucketsWritten: outcome.bucketsWritten,
        rowsPruned: outcome.rowsPruned,
        skipped: outcome.skipped,
        stoppedEarly: outcome.stoppedEarly,
        dryRun,
        durationMs,
        wouldPrune: outcome.wouldPrune,
        wouldWriteBuckets: outcome.wouldWriteBuckets,
      };
    } catch (error) {
      this.metrics?.recordTelemetryRetention(
        'failed',
        (Date.now() - startedAt) / 1000,
      );
      this.log.error(
        `telemetry retention: failed tenant=${tenantId} after ${Date.now() - startedAt}ms -- ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Aggregate the expiring windows into one row per tenant/device/key/bucket.
   *
   * Buckets are aligned to the epoch rather than to `now`, so the same window always lands in the same
   * bucket no matter when the job runs. Aligning to the run time would make two passes over identical
   * data disagree about bucket membership.
   *
   * Only numeric payload entries are aggregated, and `sampleCount` counts the rows that actually
   * contributed a number, so a payload mixing `{"temp": 25, "label": "ok"}` is counted once rather than
   * twice. A non-numeric payload is not an error: telemetry is free-form and states are legitimate.
   */
  private async rollup(
    tx: Prisma.TransactionClient,
    tenantId: string,
    cutoff: Date,
    bucketMs: number,
    dryRun: boolean,
  ): Promise<{ bucketsFound: number }> {
    // Tagged template, so every value is bound as a parameter. Interleaving the bucket width into a
    // plain string is what the first version did, and Prisma rejects it outright -- which is the good
    // outcome, because a bucket width assembled by string concatenation is a SQL injection surface.
    const rows = await tx.$queryRaw<RollupAggregate[]>`
      SELECT
        t."tenantId"       AS "tenantId",
        t."deviceId"       AS "deviceId",
        entry.key          AS "capabilityKey",
        to_timestamp(
          floor(extract(epoch FROM t."createdAt" AT TIME ZONE 'UTC') * 1000 / ${bucketMs}::bigint)
            * ${bucketMs}::bigint / 1000
        )                  AS "bucketStart",
        count(*)::int      AS "sampleCount",
        -- Cast before aggregating, not after. jsonb_each_text yields text, and PostgreSQL has no
        -- sum(text); casting the aggregate afterwards fails with "function sum(text) does not exist".
        -- Found by the live probe, not by any mock: a unit test with a fake Prisma cannot tell that.
        sum(entry.value::double precision)   AS "valueSum",
        min(entry.value::double precision)   AS "valueMin",
        max(entry.value::double precision)   AS "valueMax",
        -- The newest numeric sample inside the bucket, from the same aggregate. "Last" means last in
        -- time, so the ordering is on the row timestamp rather than on insertion order, which the
        -- table does not promise to preserve. A first version looked this up one bucket at a time and
        -- bounded the lookup by the cut-off instead of by the bucket end, so every bucket reported the
        -- newest value before the cut-off -- found by the live probe with three buckets in the window.
        -- One aggregate, one ordering: the bucket count no longer multiplies the work, and the last
        -- value cannot disagree with the grouping that produced it.
        (array_agg(entry.value::double precision ORDER BY t."createdAt" DESC))[1] AS "valueLast"
      FROM "telemetry" t
      CROSS JOIN LATERAL jsonb_each_text(t."payload") AS entry(key, value)
      WHERE t."tenantId" = ${tenantId}
        AND t."createdAt" < (${cutoff}::timestamptz AT TIME ZONE 'UTC')
        AND entry.value ~ '^-?[0-9]+(\\.[0-9]+)?([eE][-+]?[0-9]+)?$'
      GROUP BY t."tenantId", t."deviceId", entry.key, "bucketStart"
    `;

    if (rows.length === 0) {
      return { bucketsFound: 0 };
    }

    if (dryRun) {
      return { bucketsFound: rows.length };
    }

    // Replaced rather than merged. A pass that added to whatever was there would double every count
    // the second time it ran over the same window, and there is no way for a reader to tell that from
    // a genuine increase.
    await tx.telemetryRollup.deleteMany({
      where: {
        tenantId,
        deviceId: { in: [...new Set(rows.map((row) => row.deviceId))] },
        bucketStart: { lt: cutoff },
      },
    });

    const data = rows.map((row) => {
      const bucketStart = new Date(row.bucketStart);
      return {
        tenantId: row.tenantId,
        deviceId: row.deviceId,
        capabilityKey: row.capabilityKey,
        // bucketEnd, not the cut-off: this is the upper bound of the bucket being summarised.
        bucketStart,
        bucketEnd: new Date(bucketStart.getTime() + bucketMs),
        sampleCount: row.sampleCount,
        valueSum: row.valueSum,
        valueMin: row.valueMin,
        valueMax: row.valueMax,
        valueLast: row.valueLast,
      };
    });

    // Chunked so one enormous statement cannot be the thing that holds the transaction open. The
    // aggregate already bounds the row count by device/key/bucket, but a large fleet times a long
    // window can still produce a large write in one pass.
    for (let index = 0; index < data.length; index += ROLLUP_WRITE_CHUNK) {
      await tx.telemetryRollup.createMany({
        data: data.slice(index, index + ROLLUP_WRITE_CHUNK),
      });
    }

    return { bucketsFound: rows.length };
  }

  /**
   * Remove the raw rows that were just summarised.
   *
   * Batched on purpose. The first version issued one unbounded delete and the 1M-row scale probe
   * measured it at ~33s in a single statement; on a larger backlog that grows without limit and holds
   * its locks for the whole time. Batches bound each statement, the loop stops early when the budget
   * is reached, and the run stays re-runnable -- the next pass picks up what is left.
   */
  private async prune(
    tx: Prisma.TransactionClient,
    tenantId: string,
    cutoff: Date,
    batchSize: number,
    maxDurationMs: number,
    startedAt: number,
  ): Promise<{ rowsPruned: number; stoppedEarly: boolean }> {
    let rowsPruned = 0;

    while (true) {
      const deleted = await tx.$executeRaw`
        DELETE FROM "telemetry"
        WHERE "id" IN (
          SELECT "id" FROM "telemetry"
          WHERE "tenantId" = ${tenantId}
            AND "createdAt" < (${cutoff}::timestamptz AT TIME ZONE 'UTC')
          LIMIT ${batchSize}
        )
      `;

      rowsPruned += deleted;

      if (deleted < batchSize) {
        return { rowsPruned, stoppedEarly: false };
      }

      if (Date.now() - startedAt >= maxDurationMs) {
        return { rowsPruned, stoppedEarly: true };
      }
    }
  }

  /** How many raw rows a destructive pass would remove. Read-only. */
  private async countPrunable(
    tx: Prisma.TransactionClient,
    tenantId: string,
    cutoff: Date,
  ): Promise<number> {
    const rows = await tx.$queryRaw<Array<{ count: bigint | number }>>`
      SELECT count(*)::bigint AS "count"
      FROM "telemetry"
      WHERE "tenantId" = ${tenantId}
        AND "createdAt" < (${cutoff}::timestamptz AT TIME ZONE 'UTC')
    `;

    return Number(rows[0]?.count ?? 0);
  }
}

interface RollupAggregate {
  tenantId: string;
  deviceId: string;
  capabilityKey: string;
  bucketStart: Date;
  sampleCount: number;
  valueSum: number;
  valueMin: number;
  valueMax: number;
  valueLast: number;
}
