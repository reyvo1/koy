import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Wave 11 — anomaly detection over authoritative telemetry.
 *
 * `analytics_findings` already had a kind, a severity, a confidence and a detector version, and four
 * services read it. Nothing wrote it, so the NOC view, platform observability, user provisioning and the
 * device technical history all rendered "no findings" regardless of what the devices reported. This is
 * the writer.
 *
 * The statistics are deliberately robust. A detector that builds its baseline from a mean and a standard
 * deviation cannot see a spike, because one extreme sample drags the mean toward itself and inflates the
 * deviation that was supposed to measure how far away the sample is. The median barely moves when one
 * value is extreme, and the median absolute deviation measures spread in the same resistant way, so the
 * spike is compared against a baseline the spike cannot corrupt.
 *
 * Everything here is derived from real rows in `telemetry`. There is no sampling, no generator and no
 * invented value: a finding exists only because a stored sample disagreed with its own neighbours, and it
 * points back at that row through `evidenceTelemetryId`.
 */
@Injectable()
export class TelemetryAnomalyDetector {
  private readonly log = new Logger(TelemetryAnomalyDetector.name);

  /**
   * Pinned, not derived from the build. A finding says which arithmetic produced it, so an operator
   * looking at a row from six weeks ago is looking at the same rule that produced it.
   */
  static readonly DETECTOR_VERSION = 'robust-zscore/1.0.0';

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Score one capability on one device and persist anything anomalous.
   *
   * `window` bounds the read. The telemetry table is the largest one in the system and an unbounded sweep
   * over it is the obvious way to take the database down.
   */
  async detect(options: {
    tenantId: string;
    deviceId: string;
    capabilityKey: string;
    deviationMultiplier?: number;
    minSamples?: number;
    window?: number;
    now?: Date;
  }): Promise<{
    evaluated: number;
    findings: number;
    /**
     * The rows this run actually created, in creation order. The counts alone cannot
     * drive a downstream fan-out: a caller that only knows "two findings appeared" has
     * no id to make a delivery idempotent, so the runtime coordinator would have to
     * re-query by time instead and could notify on someone else's row. The list is
     * additive -- every pre-existing reader keeps working.
     */
    createdFindings: TelemetryAnomalyDetectorCreatedFinding[];
  }> {
    const deviationMultiplier = options.deviationMultiplier ?? 3;
    const minSamples = options.minSamples ?? 8;
    const window = options.window ?? 500;
    const now = options.now ?? new Date();

    if (!options.tenantId) {
      throw new RangeError('tenantId is required: anomaly detection must never run unscoped');
    }
    if (!Number.isFinite(deviationMultiplier) || deviationMultiplier <= 0) {
      throw new RangeError('deviationMultiplier must be a positive number');
    }
    if (!Number.isFinite(minSamples) || minSamples <= 0) {
      throw new RangeError('minSamples must be a positive number');
    }
    if (!Number.isFinite(window) || window <= 0) {
      throw new RangeError('window must be a positive number');
    }

    const since = new Date(now.getTime() - window * 60 * 60 * 1000);

    const rows = await this.prisma.telemetry.findMany({
      where: {
        tenantId: options.tenantId,
        deviceId: options.deviceId,
        createdAt: { gte: since, lte: now },
      },
      orderBy: { createdAt: 'asc' },
      take: window,
      select: { id: true, createdAt: true, payload: true },
    });

    const samples: Sample[] = [];
    for (const row of rows) {
      const raw = readNumericPayload(row.payload, options.capabilityKey);
      if (raw !== undefined) {
        samples.push({ id: row.id, createdAt: row.createdAt, value: raw });
      }
    }

    // Too little history is not evidence of normality. Returning "nothing anomalous" here would be the
    // dangerous answer, so the caller is told the sample was simply too small to judge.
    if (samples.length < minSamples) {
      return { evaluated: samples.length, findings: 0, createdFindings: [] };
    }

    const values = samples.map((sample) => sample.value);
    const baseline = median(values);
    const spread = medianAbsoluteDeviation(values, baseline);

    // A flat series has no spread at all, so every deviation ratio is infinite. Treat a genuinely flat
    // series as having nothing anomalous rather than dividing by zero, and note that a sample which
    // differs from a perfectly constant series IS still worth flagging -- handled below.
    const anomalous = samples.filter((sample) =>
      isAnomalous(sample.value, baseline, spread, deviationMultiplier),
    );

    let created = 0;
    const createdFindings: TelemetryAnomalyDetectorCreatedFinding[] = [];
    for (const sample of anomalous) {
      // One finding per sample. Re-running over the same window must not add a second row for the same
      // evidence, or the NOC view fills with copies of a single event and operators learn to dismiss it.
      const existing = await this.prisma.analyticsFinding.findFirst({
        where: {
          tenantId: options.tenantId,
          deviceId: options.deviceId,
          capabilityKey: options.capabilityKey,
          evidenceTelemetryId: sample.id,
        },
        select: { id: true },
      });
      if (existing) {
        continue;
      }

      const deviation =
        spread > 0 ? Math.abs(sample.value - baseline) / spread : Math.abs(sample.value - baseline);

      const severity = severityFor(deviation, deviationMultiplier);
      const summary = `${options.capabilityKey} read ${sample.value} against a baseline of ${round(baseline)}`;
      const finding = await this.prisma.analyticsFinding.create({
        data: {
          tenantId: options.tenantId,
          deviceId: options.deviceId,
          capabilityKey: options.capabilityKey,
          kind: 'ANOMALY',
          severity,
          confidence: confidenceFor(deviation, deviationMultiplier),
          summary,
          detectorVersion: TelemetryAnomalyDetector.DETECTOR_VERSION,
          evidenceTelemetryId: sample.id,
        },
      });
      createdFindings.push({
        id: finding.id,
        severity,
        capabilityKey: options.capabilityKey,
        summary,
      });
      created += 1;
    }

    if (created > 0) {
      this.log.log(
        `${created} anomaly finding(s) on ${options.deviceId}/${options.capabilityKey} from ${samples.length} sample(s), baseline ${round(baseline)}, mad ${round(spread)}`,
      );
    }

    return { evaluated: samples.length, findings: created, createdFindings };
  }
}

export interface TelemetryAnomalyDetectorCreatedFinding {
  readonly id: string;
  readonly severity: 'INFO' | 'WARNING' | 'CRITICAL';
  readonly capabilityKey: string;
  readonly summary: string;
}

interface Sample {
  id: string;
  createdAt: Date;
  value: number;
}

/**
 * Telemetry payloads are free-form JSON, so the key is looked up at the top level and only a real finite
 * number counts. A string that looks numeric is not a measurement, and neither is NaN.
 */
function readNumericPayload(payload: unknown, capabilityKey: string): number | undefined {
  if (typeof payload !== 'object' || payload === null) {
    return undefined;
  }
  const value = (payload as Record<string, unknown>)[capabilityKey];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }
  return value;
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

/**
 * The scale estimate that pairs with the median. It is expressed in the same units as the data, unlike the
 * standard deviation of the mean, so a deviation ratio here means "this many typical readings away".
 */
function medianAbsoluteDeviation(values: number[], baseline: number): number {
  return median(values.map((value) => Math.abs(value - baseline)));
}

/**
 * A perfectly constant series has zero spread, so any deviation from it is infinite and every later sample
 * would look equally surprising. A flat series is only anomalous when a sample actually moves; without one,
 * there is nothing to report.
 */
function isAnomalous(
  value: number,
  baseline: number,
  spread: number,
  deviationMultiplier: number,
): boolean {
  if (spread === 0) {
    return value !== baseline;
  }
  return Math.abs(value - baseline) / spread > deviationMultiplier;
}

function severityFor(
  deviation: number,
  deviationMultiplier: number,
): 'INFO' | 'WARNING' | 'CRITICAL' {
  if (deviation >= deviationMultiplier * 4) {
    return 'CRITICAL';
  }
  if (deviation >= deviationMultiplier * 2) {
    return 'WARNING';
  }
  return 'INFO';
}

/**
 * Confidence is the ratio actually observed, capped at 1. It is a bounded number derived from the data
 * rather than a constant, so two findings at different distances are not indistinguishable.
 */
function confidenceFor(deviation: number, deviationMultiplier: number): number {
  return Math.min(1, Number((deviation / (deviationMultiplier * 4)).toFixed(4)));
}

function round(value: number): number {
  return Number(value.toFixed(3));
}