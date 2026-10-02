import { Injectable, Logger } from '@nestjs/common';
import { AnalyticsSeverity, DeviceStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Wave 12 — cross-region operations reporting (ADR-012).
 *
 * This reports over findings that already exist. It does not move traffic, fail over, or route anything:
 * those are decisions about acting, and they each need their own ADR.
 *
 * The one thing this is careful about is incompleteness. Since ADR-009, every device may have a null
 * regionId, and that null is honest -- the device has never been placed. Grouping findings by region and
 * presenting the totals would quietly drop those devices, so a reader would see a fleet smaller than the one
 * that exists. So the rollup carries an explicit `unplacedDeviceCount`, and `complete` is false whenever it
 * is anything but zero. A partial region total is reported as partial.
 *
 * Severity counts are kept as counts, not a score. There is no meaningful average of CRITICAL and INFO, and
 * a number that looks like a health percentage invites reading it as one.
 */
@Injectable()
export class CrossRegionOperationsService {
  private readonly log = new Logger(CrossRegionOperationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Findings grouped by region, for one tenant over a window.
   *
   * `now` is supplied so the window is reproducible and so a test can state "the last 24 hours" rather than
   * "since sometime before the run".
   */
  async summarise(options: {
    tenantId: string;
    sinceHours?: number;
    limit?: number;
    now?: Date;
  }): Promise<RegionalRollup> {
    if (!options.tenantId) {
      throw new RangeError('tenantId is required: a regional rollup must never run unscoped');
    }

    const now = options.now ?? new Date();
    const since = new Date(now.getTime() - (options.sinceHours ?? 24) * 60 * 60_000);
    const limit = options.limit ?? 50;

    const findings = await this.prisma.analyticsFinding.findMany({
      where: { tenantId: options.tenantId, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        deviceId: true,
        severity: true,
      },
    });

    // AnalyticsFinding has only a scalar deviceId -- no `device` relation -- so the regions have to be looked
    // up separately. Tenant-scoped: a device id from one tenant must not resolve to another tenant's region.
    const deviceIds = [...new Set(findings.map((finding) => finding.deviceId))];
    const devices = deviceIds.length
      ? await this.prisma.device.findMany({
          where: { tenantId: options.tenantId, id: { in: deviceIds } },
          take: deviceIds.length,
          select: { id: true, regionId: true },
        })
      : [];
    const regionIdByDevice = new Map(devices.map((device) => [device.id, device.regionId]));

    // Regions this platform actually has, so a row carries its own code and timezone rather than leaving the
    // reader to join it themselves.
    const regions = await this.prisma.region.findMany({
      where: { isActive: true },
      orderBy: { regionCode: 'asc' },
      take: 100,
      select: { id: true, regionCode: true, displayName: true, timezone: true },
    });
    const regionById = new Map(regions.map((region) => [region.id, region]));

    const byRegion = new Map<string, RegionAccumulator>();
    const unplacedDeviceIds = new Set<string>();

    for (const finding of findings) {
      const regionId = regionIdByDevice.get(finding.deviceId);

      // A missing regionId and a regionId that is not active are the same outcome here: the device is not in
      // any region this platform operates, so it is counted as unplaced rather than folded into a total.
      // The distinction between the two causes is reported by unplacedDevices(), which says which it is,
      // because the fix differs. This branch used to be two identical branches, and removing either one was
      // undetectable by mutation testing -- a sign the split carried no information.
      const region = regionId ? regionById.get(regionId) : undefined;
      if (!region) {
        unplacedDeviceIds.add(finding.deviceId);
        continue;
      }

      const accumulator =
        byRegion.get(regionId) ??
        ({
          regionId,
          regionCode: region.regionCode,
          displayName: region.displayName,
          timezone: region.timezone,
          findingCount: 0,
          affectedDeviceIds: new Set<string>(),
          bySeverity: { INFO: 0, WARNING: 0, CRITICAL: 0 },
        } as RegionAccumulator);

      accumulator.findingCount += 1;
      accumulator.affectedDeviceIds.add(finding.deviceId);
      accumulator.bySeverity[finding.severity as keyof typeof accumulator.bySeverity] += 1;
      byRegion.set(regionId, accumulator);
    }

    const regionRows = [...byRegion.values()]
      .map((accumulator) => ({
        regionId: accumulator.regionId,
        regionCode: accumulator.regionCode,
        displayName: accumulator.displayName,
        timezone: accumulator.timezone,
        findingCount: accumulator.findingCount,
        affectedDeviceCount: accumulator.affectedDeviceIds.size,
        bySeverity: accumulator.bySeverity,
      }))
      .sort((a, b) => b.findingCount - a.findingCount);

    const unplacedDeviceCount = unplacedDeviceIds.size;
    const complete = unplacedDeviceCount === 0;

    this.log.log(
      `regional rollup for ${options.tenantId}: ${regionRows.length} region(s), ` +
        `${unplacedDeviceCount} unplaced device(s)${complete ? '' : ' -- totals are incomplete'}`,
    );

    return {
      since,
      generatedAt: now,
      regions: regionRows,
      unplacedDeviceCount,
      // An incomplete rollup says so. A reader who sees only the region rows would otherwise read a fleet
      // smaller than the one that exists.
      complete,
      note: complete
        ? null
        : `${unplacedDeviceCount} device(s) have findings but are not in any active region, so the region totals above do not cover the whole fleet`,
      regionsWithoutFindings: regions
        .filter((region) => !byRegion.has(region.id))
        .map((region) => ({
          regionId: region.id,
          regionCode: region.regionCode,
          displayName: region.displayName,
          timezone: region.timezone,
        })),
    };
  }

  /**
   * Devices in a tenant that carry a finding but sit in no active region.
   *
   * This exists so the unplaced count is actionable rather than a number on a dashboard: an operator needs
   * to know WHICH devices to place, and the ADR-009 assignment path needs that list to be worth anything.
   */
  async unplacedDevices(options: { tenantId: string; sinceHours?: number; limit?: number; now?: Date }): Promise<
    UnplacedDevice[]
  > {
    if (!options.tenantId) {
      throw new RangeError('tenantId is required: the unplaced device list must never run unscoped');
    }

    const now = options.now ?? new Date();
    const since = new Date(now.getTime() - (options.sinceHours ?? 24) * 60 * 60_000);

    // Which devices actually have a finding in this window. Without this the list is every unplaced device in
    // the tenant, which is not actionable -- the point is the ones generating findings nobody can place.
    const findingsInWindow = await this.prisma.analyticsFinding.findMany({
      where: { tenantId: options.tenantId, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: 1000,
      select: { deviceId: true },
    });
    const flagged = new Set(findingsInWindow.map((finding) => finding.deviceId));

    const devices = await this.prisma.device.findMany({
      where: { tenantId: options.tenantId, id: { in: [...flagged] } },
      orderBy: { createdAt: 'desc' },
      take: options.limit ?? 100,
      select: {
        id: true,
        name: true,
        regionId: true,
        status: true,
        // lastHeartbeatAt is null when the device has never reported. It is reported as-is, because a
        // device that has never spoken is not an unobserved healthy device.
        lastHeartbeatAt: true,
      },
    });

    const active = await this.prisma.region.findMany({
      where: { isActive: true },
      take: 100,
      select: { id: true },
    });
    const activeIds = new Set(active.map((region) => region.id));

    return devices
      .filter((device) => !device.regionId || !activeIds.has(device.regionId))
      .map((device) => ({
        deviceId: device.id,
        name: device.name,
        status: device.status,
        lastHeartbeatAt: device.lastHeartbeatAt,
        // Distinguish "never placed in a region" from "placed in a region we no longer operate", because the
        // fix for each is different: assign, or re-activate.
        reason: device.regionId
          ? 'points at a region that is not active'
          : 'was never assigned to a region',
        unobserved: device.lastHeartbeatAt === null,
      }));
  }
}

interface RegionAccumulator {
  regionId: string;
  regionCode: string;
  displayName: string;
  timezone: string;
  findingCount: number;
  affectedDeviceIds: Set<string>;
  bySeverity: Record<AnalyticsSeverity, number>;
}

export interface RegionalRollup {
  since: Date;
  generatedAt: Date;
  regions: Array<{
    regionId: string;
    regionCode: string;
    displayName: string;
    timezone: string;
    findingCount: number;
    affectedDeviceCount: number;
    bySeverity: Record<AnalyticsSeverity, number>;
  }>;
  unplacedDeviceCount: number;
  complete: boolean;
  note: string | null;
  /** Regions this platform operates that had no findings. Absent from `regions` above, listed here so an
   *  operator can tell "no problems" apart from "not covered". */
  regionsWithoutFindings: Array<{
    regionId: string;
    regionCode: string;
    displayName: string;
    timezone: string;
  }>;
}

export interface UnplacedDevice {
  deviceId: string;
  name: string;
  status: DeviceStatus;
  lastHeartbeatAt: Date | null;
  reason: string;
  /** True when the device has never reported at all, so its status is a cached belief and not an observation. */
  unobserved: boolean;
}