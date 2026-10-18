import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const read = (relative: string): string => readFileSync(resolve(root, relative), 'utf8');

/**
 * Wave 10, first slice: telemetry retention and rollups.
 *
 * `telemetry` is the highest-volume table in the system and, until this, had no lifecycle at all:
 * nothing was ever summarised and nothing was ever removed. Report archives have a retention window
 * but that is an expiry the row declares about itself -- it hides rows from readers and still leaves
 * every row in the table, which is not what a growing install needs.
 *
 * Rolling up before pruning is the whole point. Deleting raw telemetry past a window destroys the
 * history a chart needs unless the aggregates survive it, and rolling up after pruning is impossible.
 * So the order is part of the contract, not an implementation detail, and these tests pin it.
 */

const schema = read('prisma/schema.prisma');
const service = read('src/telemetry/telemetry-retention.service.ts');

describe('Wave 10 telemetry retention and rollups', () => {
  describe('schema', () => {
    it('stores rollups in their own table', () => {
      expect(schema).toContain('model TelemetryRollup');
      expect(schema).toMatch(/TelemetryRollup[\s\S]*@@map\("telemetry_rollups"\)/);
    });

    // Without the bucket identity unique, a second pass over the same window doubles every count
    // instead of replacing it, and the chart quietly reports twice the real samples.
    it('keys a rollup row by tenant, device, capability and bucket so re-running is idempotent', () => {
      expect(schema).toMatch(/@@unique\(\[tenantId, deviceId, capabilityKey, bucketStart\]\)/);
    });

    it('orders rollups by bucket for range reads', () => {
      expect(schema).toMatch(/@@index\(\[tenantId, deviceId, bucketStart\]\)/);
    });

    // min/max/last, not just sum: a chart that draws a line through a window needs the extremes to be
    // honest about what happened inside it, and an average alone hides a single spike.
    it('keeps the distribution and not only a total', () => {
      expect(schema).toContain('sampleCount');
      expect(schema).toContain('valueSum');
      expect(schema).toContain('valueMin');
      expect(schema).toContain('valueMax');
      expect(schema).toContain('valueLast');
    });
  });

  describe('retention service', () => {
    it('rolls up before it prunes, in that order', () => {
      const rollupIndex = service.indexOf('rollup(');
      const pruneIndex = service.indexOf('prune(');

      expect(rollupIndex).toBeGreaterThan(-1);
      expect(pruneIndex).toBeGreaterThan(-1);
      // The order is asserted on the call sites, not on the definition order in the file, so moving a
      // method cannot silently reverse the behaviour.
      expect(rollupIndex).toBeLessThan(pruneIndex);
    });

    it('refuses a non-positive retention window instead of deleting everything', () => {
      expect(service).toContain('retentionMs');
      expect(service).toMatch(/(<= 0|< 1|Number\.isFinite)/);
    });

    it('refuses a non-positive bucket width instead of aggregating into one bucket', () => {
      expect(service).toContain('bucketMs');
      expect(service).toMatch(/(<= 0|< 1|Number\.isFinite)/);
    });

    // A bucket must be a real interval. Landing on an arbitrary minute makes two runs disagree about
    // which bucket a sample belongs to, and the rollup stops being reproducible.
    // Asserted on the property, not on a JS idiom. The first version expected `Math.floor(... / bucketMs)`
    // because that is how the alignment was expected to be written; the implementation floors in SQL
    // instead, which puts the alignment in the database rather than in the process, and that is the
    // better shape for a table this large. The requirement is that the bucket edge comes from the epoch
    // rather than from the run time -- anchoring it to `now` would move every bucket on each pass.
    it('aligns buckets to the epoch rather than to the wall clock at run time', () => {
      expect(service).toMatch(/floor\(/i);
      expect(service).toMatch(/extract\(epoch/i);
    });

    it('never rolls up samples from outside the retention boundary into a live bucket', () => {
      // The prune and the rollup must agree on the cut-off. If the rollup takes everything and the
      // prune takes only the old rows, the buckets double-count every retained sample on each pass.
      // Asserted on the raw comparisons the database actually executes: the aggregate bound, the
      // batched removal bound, and the dry-run count all compare `createdAt` with the same converted
      // cut-off, and each wraps the bound value in parentheses so the driver binds it as a parameter
      // rather than the SQL being assembled from it. A count, not a `toContain`, so a second bound
      // that drops the parameter wrapper -- or a fourth comparison that appears without its own
      // conversion -- cannot pass unnoticed.
      expect(service).toMatch(/cutoff/);
      const rawCutoffComparisons = service.match(/"createdAt" *< *\(/g) ?? [];
      expect(rawCutoffComparisons.length).toBe(3);
    });

    it('coordinates concurrent runs with a per-tenant advisory lock and skips instead of queueing', () => {
      // Operator runs can be started from more than one host. The try-lock makes the second run
      // report `skipped` rather than race the first, and running it inside the transaction means the
      // lock cannot outlive the work it protects.
      expect(service).toContain('pg_try_advisory_xact_lock');
      expect(service).toContain('hashtextextended');
      expect(service).toMatch(/telemetry-retention:/);
      expect(service).toContain('$transaction');
    });

    it('removes in bounded batches under a wall-clock budget', () => {
      // The 1M-row scale probe measured the original single-statement removal at ~33s; an unbounded
      // statement holds its locks for as long as the backlog is large. Batches bound each statement,
      // and the budget stops a pass cleanly with `stoppedEarly` so the next run continues.
      expect(service).toContain('LIMIT ${batchSize}');
      expect(service).toContain('maxDurationMs');
      expect(service).toContain('stoppedEarly');
      expect(service).toMatch(/deleted < batchSize/);
    });

    it('supports dry-run evidence before a destructive pass', () => {
      // The storage strategy's retention boundary requires dry-run evidence before destructive
      // execution; this is that path, and it must not remove or write anything. What the pass *would*
      // write and remove is reported through `wouldWriteBuckets` and `wouldPrune`, because a dry run
      // that reports zeroes for both is not evidence of anything.
      expect(service).toContain('dryRun');
      expect(service).toContain('countPrunable');
      expect(service).toContain('wouldWriteBuckets');
      expect(service).toContain('wouldPrune');
    });

    it('derives the last value from the same aggregate instead of one lookup per bucket', () => {
      // The N+1 shape was one extra query per bucket; it also carried the bucket-bounds bug the probe
      // found. Ordering inside the aggregate removes both problems by construction: the last value
      // cannot disagree with the grouping that produced its bucket.
      expect(service).toContain('array_agg(');
      expect(service).toMatch(/ORDER BY t\."createdAt" DESC/);
      expect(service).not.toMatch(/last\[0\]/);
    });
  });
  describe('timezone', () => {
    // Found by deploying to a server whose PostgreSQL runs in Asia/Makassar. `createdAt` is a
    // `timestamp without time zone` holding UTC, but a bare `${cutoff}` is bound as timestamptz and
    // PostgreSQL converts it into the session zone first -- 11:00 UTC became 19:00 local, so a live
    // sample at 11:50 fell inside the window and was rolled up and pruned. The whole suite was green on
    // a machine running UTC, which is what made this invisible until it reached a real deployment.
    it('converts every raw bound value from timestamptz into naive UTC', () => {
      const conversions = service.match(/AT TIME ZONE 'UTC'/g) ?? [];
      // Four, and the composition changed with the hardening pass: the cut-off bound inside the
      // aggregate, the bucket epoch, the cut-off bound inside the batched removal, and the cut-off
      // bound inside the dry-run count. The two that used to convert the last-value lookup's bounds
      // disappeared with the per-bucket lookup itself; anything still binding a bare `${cutoff}` or
      // `${bucketEnd}` would have to add a conversion (or fail the bare-bound check below), so the
      // exact count stays the tripwire for that class of regression.
      expect(conversions.length).toBe(4);
    });

    it('compares the raw rows against a converted cut-off, never a bare one', () => {
      expect(service).not.toMatch(/"createdAt" < \$\{cutoff\}/);
      expect(service).not.toMatch(/"createdAt" < \$\{bucketEnd\}/);
    });
  });
});
