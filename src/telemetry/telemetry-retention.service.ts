import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Wave 10 — telemetry retention with rollups.
 *
 * `telemetry` is the highest-volume table here and, until this, had no lifecycle: nothing was
 * summarised and nothing was removed, so an install only ever grew. Report archives already declare a
 * retention window, but that is an expiry the row states about itself -- readers stop seeing it and the
 * row stays, which is not what a growing table needs.
 *
 * The order is the whole point. A window is rolled up first and pruned second, so the history survives
 * in summarised form. Pruning first would destroy it, and rolling up after the fact is impossible
 * because the rows are gone. Both steps share one `cutoff`, so the buckets that are written are exactly
 * the windows whose raw rows disappear -- if the two used different boundaries, every retained sample
 * would be counted again on each pass and the chart would over-report.
 *
 * Aggregation runs in the database. Rolling a large window up by loading rows into the process would
 * move the entire hot table through memory, which is the opposite of the point of retention.
 */
@Injectable()
export class TelemetryRetentionService {
  private readonly log = new Logger(TelemetryRetentionService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Roll up every window that is about to be pruned, then prune it.
   *
   * Returns what happened rather than a boolean, so a caller can prove the two steps agreed instead of
   * inferring it from a green exit code.
   */
  async rollupAndPrune(options: {
    tenantId: string;
    now?: Date;
    retentionMs: number;
    bucketMs: number;
  }): Promise<{ cutoff: Date; bucketsWritten: number; rowsPruned: number }> {
    const now = options.now ?? new Date();
    const { retentionMs, bucketMs, tenantId } = options;

    // Required rather than optional, and that is the point. An unscoped retention run is an unbounded
    // DELETE against the largest table in the system, and the live probe found exactly that: one
    // tenant's run removed another tenant's rows along with its own. Every other write path here is
    // tenant-scoped for the same reason, and retention is the one that would be hardest to notice.
    if (!tenantId) {
      throw new RangeError('tenantId is required: retention must never run unscoped');
    }

    // Both windows are validated before any write. A zero or negative retention would otherwise read
    // as "delete everything", and a zero bucket width would collapse the whole history into one row --
    // neither is something to discover after the data is gone.
    if (!Number.isFinite(retentionMs) || retentionMs <= 0) {
      throw new RangeError('retentionMs must be a positive number of milliseconds');
    }
    if (!Number.isFinite(bucketMs) || bucketMs <= 0) {
      throw new RangeError('bucketMs must be a positive number of milliseconds');
    }

    const cutoff = new Date(now.getTime() - retentionMs);

    const bucketsWritten = await this.rollup(tenantId, cutoff, bucketMs);
    const rowsPruned = await this.prune(tenantId, cutoff);

    this.log.log(
      `telemetry retention: cut-off ${cutoff.toISOString()}, ${bucketsWritten} rollup bucket(s) written, ${rowsPruned} raw row(s) pruned`,
    );

    return { cutoff, bucketsWritten, rowsPruned };
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
  private async rollup(tenantId: string, cutoff: Date, bucketMs: number): Promise<number> {
    // Tagged template, so every value is bound as a parameter. Interleaving the bucket width into a
    // plain string is what the first version did, and Prisma rejects it outright -- which is the good
    // outcome, because a bucket width assembled by string concatenation is a SQL injection surface.
    const rows = await this.prisma.$queryRaw<RollupAggregate[]>`
      SELECT
        t."tenantId"       AS "tenantId",
        t."deviceId"       AS "deviceId",
        entry.key          AS "capabilityKey",
        to_timestamp(
          floor(extract(epoch FROM t."createdAt") * 1000 / ${bucketMs}::bigint)
            * ${bucketMs}::bigint / 1000
        )                  AS "bucketStart",
        count(*)::int      AS "sampleCount",
        -- Cast before aggregating, not after. jsonb_each_text yields text, and PostgreSQL has no
        -- sum(text); casting the aggregate afterwards fails with "function sum(text) does not exist".
        -- Found by the live probe, not by any mock: a unit test with a fake Prisma cannot tell that.
        sum(entry.value::double precision)   AS "valueSum",
        min(entry.value::double precision)   AS "valueMin",
        max(entry.value::double precision)   AS "valueMax"
      FROM "telemetry" t
      CROSS JOIN LATERAL jsonb_each_text(t."payload") AS entry(key, value)
      WHERE t."tenantId" = ${tenantId}
        AND t."createdAt" < ${cutoff}
        AND entry.value ~ '^-?[0-9]+(\\.[0-9]+)?([eE][-+]?[0-9]+)?$'
      GROUP BY t."tenantId", t."deviceId", entry.key, "bucketStart"
    `;

    if (rows.length === 0) {
      return 0;
    }

    // Replaced rather than merged. A pass that added to whatever was there would double every count
    // the second time it ran over the same window, and there is no way for a reader to tell that from
    // a genuine increase.
    await this.prisma.telemetryRollup.deleteMany({
      where: {
        tenantId,
        deviceId: { in: [...new Set(rows.map((row) => row.deviceId))] },
        bucketStart: { lt: cutoff },
      },
    });

    for (const row of rows) {
      const bucketStart = new Date(row.bucketStart);
      const bucketEnd = new Date(bucketStart.getTime() + bucketMs);

      // The newest numeric sample inside the bucket. "Last" means last in time, so the ordering is on
      // createdAt rather than on insertion order, which the table does not promise to preserve.
      const last = await this.prisma.$queryRaw<{ value: number }[]>`
        SELECT entry.value::double precision AS value
        FROM "telemetry" t
        CROSS JOIN LATERAL jsonb_each_text(t."payload") AS entry(key, value)
        WHERE t."tenantId" = ${row.tenantId}
          AND t."deviceId" = ${row.deviceId}
          AND entry.key = ${row.capabilityKey}
          AND t."createdAt" < ${bucketEnd}
          AND t."createdAt" >= ${bucketStart}
          AND entry.value ~ '^-?[0-9]+(\\.[0-9]+)?([eE][-+]?[0-9]+)?$'
        ORDER BY t."createdAt" DESC
        LIMIT 1
      `;

      await this.prisma.telemetryRollup.create({
        data: {
          // bucketEnd, not the cut-off: this is the upper bound of the bucket being summarised.
          tenantId: row.tenantId,
          deviceId: row.deviceId,
          capabilityKey: row.capabilityKey,
          bucketStart,
          bucketEnd,
          sampleCount: row.sampleCount,
          valueSum: row.valueSum,
          valueMin: row.valueMin,
          valueMax: row.valueMax,
          valueLast: last[0]?.value ?? row.valueMax,
        },
      });
    }

    return rows.length;
  }

  /** Remove the raw rows that were just summarised. */
  private async prune(tenantId: string, cutoff: Date): Promise<number> {
    const result = await this.prisma.telemetry.deleteMany({
      where: { tenantId, createdAt: { lt: cutoff } },
    });

    return result.count;
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
}
