import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Wave 11 — energy intelligence.
 *
 * The Wave 10 rollups already carry `valueSum` and `sampleCount` per bucket, so a period total can be read
 * without touching the raw telemetry table at all. What is missing is anything an operator can act on: what
 * did this tenant consume, how does that compare with the period before, and which devices are behind it.
 *
 * Two constraints shape the whole slice.
 *
 * First, a power reading is not an energy reading. Watts are a rate; energy is a rate integrated over time,
 * and the rollups deliberately do not record the sampling interval. Multiplying an average wattage by a
 * wall-clock span would produce a confident, entirely invented number -- and energy figures are exactly the
 * kind of number that ends up on an invoice. So a capability is treated as energy only when its own
 * declared unit says so, and the service reports that it cannot do it otherwise rather than guessing a
 * conversion.
 *
 * Second, coverage has to be visible. A tenant total that silently omits the devices which reported nothing
 * reads as the tenant's complete consumption. The result therefore carries what it was computed from, so a
 * partial figure cannot be presented as a whole one.
 */
@Injectable()
export class EnergyIntelligenceService {
  private readonly log = new Logger(EnergyIntelligenceService.name);

  /**
   * Units that already denote energy. Anything else -- including watts and amps -- is a rate or a current,
   * and cannot be turned into energy without knowing how often the device sampled.
   */
  static readonly ENERGY_UNITS = new Set(['wh', 'kwh', 'mwh', 'joule', 'kj', 'mj']);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Total energy for one tenant over one period, beside the immediately preceding period of equal length.
   *
   * `to` is explicit rather than inferred from the clock so a report can be re-run for a past period and
   * produce the same numbers.
   */
  async summarise(options: {
    tenantId: string;
    from: Date;
    to: Date;
    perDevice?: boolean;
    maxRollups?: number;
  }): Promise<EnergySummary> {
    if (!options.tenantId) {
      throw new RangeError('tenantId is required: energy reporting must never run unscoped');
    }
    if (!(options.to.getTime() > options.from.getTime())) {
      throw new RangeError('the period end must be after its start');
    }
    if (!Number.isFinite(options.to.getTime()) || !Number.isFinite(options.from.getTime())) {
      throw new RangeError('the period boundaries must be real dates');
    }

    const perDevice = options.perDevice ?? true;
    const maxRollups = options.maxRollups ?? 50_000;

    const spanMs = options.to.getTime() - options.from.getTime();
    const previousTo = new Date(options.from.getTime());
    const previousFrom = new Date(options.from.getTime() - spanMs);

    // A capability only counts when the capability itself declares an energy unit. This is the whole reason
    // the rollups are joined to capabilities at all.
    // Scoped through the device, because `Capability` has no tenant of its own: a capability belongs to a
    // device, and the device carries the tenant. Scoping on the device relation is what keeps one tenant's
    // capabilities out of another tenant's energy total.
    const energyCapabilities = await this.prisma.capability.findMany({
      where: { device: { tenantId: options.tenantId } },
      select: { id: true, key: true, unit: true, deviceId: true },
      take: 5_000,
    });

    const energyKeysByDevice = new Map<string, Set<string>>();
    const rejected: string[] = [];

    for (const capability of energyCapabilities) {
      const unit = (capability.unit ?? '').trim().toLowerCase();
      if (!capability.unit || !EnergyIntelligenceService.ENERGY_UNITS.has(unit)) {
        // Recorded rather than dropped silently, so an operator asking why a device is missing from the
        // total gets an answer instead of a smaller number that looks complete.
        if (capability.unit && /w|amp/i.test(unit) && !EnergyIntelligenceService.ENERGY_UNITS.has(unit)) {
          rejected.push(`${capability.key} reports ${capability.unit}, a rate not an energy`);
        }
        continue;
      }
      const existing = energyKeysByDevice.get(capability.deviceId) ?? new Set<string>();
      existing.add(capability.key);
      energyKeysByDevice.set(capability.deviceId, existing);
    }

    if (energyKeysByDevice.size === 0) {
      return {
        tenantId: options.tenantId,
        period: { from: options.from, to: options.to },
        total: 0,
        unit: null,
        direction: 'flat',
        change: null,
        previousTotal: 0,
        contributingDevices: 0,
        rejectedCapabilities: rejected,
        perDevice: [],
        note:
          rejected.length > 0
            ? 'No capability in this tenant declares an energy unit; a rate cannot be converted without the sampling interval'
            : 'No energy capability found in this tenant',
      };
    }

    const deviceIds = [...energyKeysByDevice.keys()];
    const keys = [...new Set([...energyKeysByDevice.values()].flatMap((set) => [...set]))];

    const rows = await this.prisma.telemetryRollup.findMany({
      where: {
        tenantId: options.tenantId,
        deviceId: { in: deviceIds },
        capabilityKey: { in: keys },
        bucketStart: { gte: previousFrom, lt: options.to },
      },
      orderBy: { bucketStart: 'asc' },
      take: maxRollups,
      select: { deviceId: true, capabilityKey: true, bucketStart: true, bucketEnd: true, valueSum: true },
    });

    let total = 0;
    let previousTotal = 0;
    const byDevice = new Map<string, number>();

    for (const row of rows) {
      // The window is applied per period on the row itself rather than trusting the query, because a rollup
      // whose bucket straddles a boundary would otherwise contribute a partial amount that looks whole.
      // Each period is tested on its own: a bucket inside the previous period is not inside this one, and
      // checking the current period first and `continue`-ing would drop it from the comparison entirely.
      const insideCurrent = row.bucketStart >= options.from && row.bucketEnd <= options.to;
      const insidePrevious = row.bucketStart >= previousFrom && row.bucketEnd <= previousTo;

      if (insideCurrent) {
        total += row.valueSum;
        byDevice.set(row.deviceId, (byDevice.get(row.deviceId) ?? 0) + row.valueSum);
      }
      if (insidePrevious) {
        previousTotal += row.valueSum;
      }
    }

    // A percentage change against a zero or absent baseline is Infinity or NaN, both of which render as
    // garbage on a dashboard. The direction is still meaningful; the ratio is simply not available.
    const hasBaseline = previousTotal > 0 && Number.isFinite(previousTotal);
    const change = hasBaseline ? (total - previousTotal) / previousTotal : null;
    const direction = !hasBaseline
      ? 'flat'
      : change !== null && change > 0.05
        ? 'increase'
        : change !== null && change < -0.05
          ? 'decrease'
          : 'flat';

    const summary: EnergySummary = {
      tenantId: options.tenantId,
      period: { from: options.from, to: options.to },
      total: round(total),
      unit: 'energy',
      direction,
      change,
      previousTotal: round(previousTotal),
      contributingDevices: byDevice.size,
      rejectedCapabilities: rejected,
      perDevice: perDevice
        ? [...byDevice.entries()]
            .map(([deviceId, value]) => ({ deviceId, total: round(value) }))
            .sort((left, right) => right.total - left.total)
        : [],
      note:
        byDevice.size < deviceIds.length
          ? `${deviceIds.length - byDevice.size} of ${deviceIds.length} energy devices reported nothing in this period and are absent from the total`
          : null,
    };

    this.log.log(
      `energy for ${options.tenantId}: ${summary.total} (${direction}) across ${summary.contributingDevices} device(s)`,
    );
    return summary;
  }
}

export interface EnergySummary {
  tenantId: string;
  period: { from: Date; to: Date };
  total: number;
  unit: string | null;
  direction: 'increase' | 'decrease' | 'flat';
  /** Null when there is no usable baseline. Never Infinity or NaN. */
  change: number | null;
  previousTotal: number;
  contributingDevices: number;
  /** Capabilities excluded because they report a rate rather than an energy. */
  rejectedCapabilities: string[];
  perDevice: { deviceId: string; total: number }[];
  note: string | null;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}