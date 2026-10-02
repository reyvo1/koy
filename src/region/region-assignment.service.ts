import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Wave 12 — region assignment.
 *
 * `Region` is a real seeded entity (ADR-009). This is the only way a device comes to sit in one, and every
 * refusal here corresponds to a boundary that ADR records.
 *
 * The two that matter most:
 *
 * Assignment refuses rather than defaulting. An inactive region or an unknown one throws instead of
 * quietly succeeding, because a device silently placed in a decommissioned region produces readings that
 * look correctly attributed and are not.
 *
 * Assignment requires a reason and requires a tenant. Wave 11 added anomaly findings, health scores,
 * maintenance risk and energy intelligence, all computed over time. A region that could change without a
 * reason would make every one of those time series unattributable, which is why a reason is required rather
 * than merely recorded.
 */
@Injectable()
export class RegionAssignmentService {
  private readonly log = new Logger(RegionAssignmentService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** The regions a tenant may currently place devices in. Inactive regions are deliberately absent. */
  async listAssignable(limit = 200): Promise<RegionSummary[]> {
    const regions = await this.prisma.region.findMany({
      where: { isActive: true },
      orderBy: { regionCode: 'asc' },
      take: limit,
      select: { id: true, regionCode: true, displayName: true, timezone: true },
    });
    return regions;
  }

  /**
   * Place a device in a region.
   *
   * `now` is supplied by the caller so the assignment can be reproduced, and so a test can state the moment
   * of a move rather than "some time during the run".
   */
  async assign(options: {
    tenantId: string;
    deviceId: string;
    regionId: string;
    reason: string;
    now?: Date;
  }): Promise<RegionAssignmentResult> {
    if (!options.tenantId) {
      throw new RangeError('tenantId is required: region assignment must never run unscoped');
    }
    if (!options.deviceId) {
      throw new RangeError('deviceId is required: region assignment needs a device');
    }
    if (!options.regionId) {
      throw new RangeError('regionId is required: region assignment needs a region');
    }
    if (!options.reason || !options.reason.trim()) {
      // A move nobody can explain leaves the historical time series unattributable, which is the whole
      // reason this boundary exists.
      throw new RangeError('a reason is required: an unexplained region change cannot be audited');
    }

    const now = options.now ?? new Date();

    const region = await this.prisma.region.findFirst({
      where: { id: options.regionId },
      select: { id: true, regionCode: true, timezone: true, isActive: true },
    });
    if (!region) {
      throw new RangeError(`region ${options.regionId} does not exist`);
    }
    if (!region.isActive) {
      throw new RangeError(`region ${region.regionCode} is not active and cannot accept devices`);
    }

    // Tenant-scoped, so a tenant cannot place or move a device it does not own even if it learns the id.
    const device = await this.prisma.device.findFirst({
      where: { id: options.deviceId, tenantId: options.tenantId },
      select: { id: true, regionId: true },
    });
    if (!device) {
      throw new RangeError(`device ${options.deviceId} does not exist in this tenant`);
    }

    const previousRegionId = device.regionId;

    await this.prisma.device.update({
      where: { id: options.deviceId },
      data: { regionId: options.regionId },
    });

    this.log.log(
      `${options.deviceId} -> ${region.regionCode} (from ${previousRegionId ?? 'unplaced'}) at ${now.toISOString()}: ${options.reason}`,
    );

    return {
      deviceId: options.deviceId,
      tenantId: options.tenantId,
      previousRegionId,
      regionId: options.regionId,
      regionCode: region.regionCode,
      assignedAt: now,
      reason: options.reason.trim(),
    };
  }

  /** Where a device currently sits, or an explicit statement that it is unplaced. */
  async current(tenantId: string, deviceId: string): Promise<{
    region: RegionSummary | null;
    unplaced: boolean;
  }> {
    if (!tenantId) {
      throw new RangeError('tenantId is required: region lookup must never run unscoped');
    }
    if (!deviceId) {
      throw new RangeError('deviceId is required: region lookup needs a device');
    }

    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, tenantId },
      select: {
        region: { select: { id: true, regionCode: true, displayName: true, timezone: true } },
      },
    });
    if (!device) {
      throw new RangeError(`device ${deviceId} does not exist in this tenant`);
    }

    return { region: device.region, unplaced: device.region === null };
  }
}

export interface RegionSummary {
  id: string;
  regionCode: string;
  displayName: string;
  timezone: string;
}

export interface RegionAssignmentResult {
  deviceId: string;
  tenantId: string;
  previousRegionId: string | null;
  regionId: string;
  regionCode: string;
  assignedAt: Date;
  reason: string;
}