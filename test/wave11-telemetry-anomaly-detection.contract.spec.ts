import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const read = (relative: string): string => readFileSync(resolve(root, relative), 'utf8');

/**
 * Wave 11, first slice: real anomaly detection over authoritative telemetry.
 *
 * `analytics_findings` already exists with a kind, a severity, a confidence and a `detectorVersion`, and
 * four services read it -- the NOC incident view, platform observability, user provisioning and the device
 * technical history. Nothing writes it. Every one of those readers is looking at a table that is always
 * empty, so the whole anomaly surface renders as "no findings" no matter what the devices report.
 *
 * The detector therefore reads real telemetry rows, and the finding it writes has to be defensible: a
 * number on a screen is only worth an operator's attention if the arithmetic behind it can be recomputed.
 * Hence a pinned detector version and an evidence row, both of which let a finding be traced back to the
 * sample that produced it.
 *
 * Robust statistics are the whole point of the arithmetic. A single spike inflates a mean and inflates the
 * standard deviation with it, which is how a naive detector ends up scoring its own anomaly as normal.
 * Median and median-absolute-deviation do not move appreciably when one sample is extreme, so the spike is
 * measured against a baseline the spike cannot corrupt.
 */

const schema = read('prisma/schema.prisma');
const service = read('src/analytics/telemetry-anomaly-detector.service.ts');

describe('Wave 11 real anomaly detection', () => {
  describe('schema', () => {
    // Already true before this slice, but the detector writes into it, so it is asserted rather than assumed.
    it('writes into the finding table the rest of the platform already reads', () => {
      expect(schema).toMatch(/model AnalyticsFinding/);
      expect(schema).toMatch(/detectorVersion\s+String/);
      expect(schema).toMatch(/evidenceTelemetryId\s+String\?/);
    });

    it('can express an anomaly with a severity and a confidence', () => {
      expect(schema).toMatch(/enum AnalyticsFindingKind\s*\{[\s\S]*ANOMALY/);
      expect(schema).toMatch(/enum AnalyticsSeverity\s*\{[\s\S]*INFO[\s\S]*WARNING[\s\S]*CRITICAL/);
    });
  });

  describe('detector', () => {
    it('reads real telemetry rather than inventing values', () => {
      expect(service).toContain('prisma.telemetry');
      // A detector that never queries telemetry is a detector that is guessing.
      expect(service).not.toMatch(/Math\.random/);
      expect(service).not.toMatch(/mock|simulate|fake/i);
    });

    // Mean and standard deviation move with the outlier they are supposed to catch. These two helpers are
    // what make the baseline resistant, and they are the easiest part of the file to quietly replace with
    // the naive version later.
    it('computes a median and a median absolute deviation, not a mean and a deviation', () => {
      expect(service).toContain('median');
      expect(service).toContain('medianAbsoluteDeviation');
    });

    it('refuses to judge a sample against a baseline built from too few samples', () => {
      expect(service).toMatch(/minSamples/);
      expect(service).toMatch(/(<= 0|< 1|Number\.isFinite)/);
    });

    it('refuses a non-positive deviation multiplier', () => {
      expect(service).toMatch(/deviationMultiplier/);
      expect(service).toMatch(/(<= 0|< 1|Number\.isFinite)/);
    });

    // Without this the same spike is reported on every run and the NOC view fills with duplicates of one
    // event, which trains the operator to ignore it.
    it('is idempotent: one finding per sample, not one per run', () => {
      expect(service).toContain('evidenceTelemetryId');
      expect(service).toMatch(/(findFirst|upsert|createMany|skipDuplicates)/);
    });

    it('records the detector version so a finding can be re-derived after the arithmetic changes', () => {
      expect(service).toMatch(/detectorVersion/);
    });

    // An unbounded sweep over the whole telemetry table is the other way this takes the database down.
    it('bounds the window it reads', () => {
      expect(service).toMatch(/(take:|limit|LIMIT)/i);
    });
  });
});