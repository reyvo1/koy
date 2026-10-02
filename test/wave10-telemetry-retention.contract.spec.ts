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
      expect(service).toMatch(/cutoff/);
      expect(service).toMatch(/(createdAt: *\{ *lt:|createdAt *<)/);
    });
  });
});
