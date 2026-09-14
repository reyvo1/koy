import { Injectable } from '@nestjs/common';
import { CommandStatus, DeviceStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ADMIN_OPERATIONAL_SUMMARY_STALE_THRESHOLD_SECONDS,
  AdminOperationalSummary,
} from './admin-operational-summary.types';

const DEVICE_STATUSES = Object.values(DeviceStatus);
const COMMAND_STATUSES = Object.values(CommandStatus);

@Injectable()
export class AdminOperationalSummaryService {
  constructor(private readonly prisma: PrismaService) {}

  async summarize(
    tenantId: string,
    now: Date = new Date(),
  ): Promise<AdminOperationalSummary> {
    const staleBefore = new Date(
      now.getTime() - ADMIN_OPERATIONAL_SUMMARY_STALE_THRESHOLD_SECONDS * 1000,
    );

    const [
      deviceStatusRows,
      staleHeartbeat,
      neverReportedHeartbeat,
      readableCapabilities,
      reportableCapabilities,
      writableCapabilities,
      latestTelemetry,
      commandStatusRows,
    ] = await Promise.all([
      this.prisma.device.groupBy({
        by: ['status'],
        where: { tenantId },
        _count: { _all: true },
      }),
      this.prisma.device.count({
        where: {
          tenantId,
          status: { not: DeviceStatus.REVOKED },
          lastHeartbeatAt: { lt: staleBefore },
        },
      }),
      this.prisma.device.count({
        where: {
          tenantId,
          status: { not: DeviceStatus.REVOKED },
          lastHeartbeatAt: null,
        },
      }),
      this.prisma.capability.count({
        where: { device: { tenantId }, isReadable: true },
      }),
      this.prisma.capability.count({
        where: { device: { tenantId }, isReportable: true },
      }),
      this.prisma.capability.count({
        where: { device: { tenantId }, isWritable: true },
      }),
      this.prisma.telemetry.findFirst({
        where: { tenantId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { createdAt: true },
      }),
      this.prisma.deviceCommand.groupBy({
        by: ['status'],
        where: { tenantId },
        _count: { _all: true },
      }),
    ]);

    const devicesByStatus = this.createDeviceStatusCounts();
    for (const row of deviceStatusRows) {
      devicesByStatus[row.status] = row._count._all;
    }

    const commandsByStatus = this.createCommandStatusCounts();
    for (const row of commandStatusRows) {
      commandsByStatus[row.status] = row._count._all;
    }

    return {
      generatedAt: now.toISOString(),
      staleThresholdSeconds: ADMIN_OPERATIONAL_SUMMARY_STALE_THRESHOLD_SECONDS,
      devices: {
        total: this.total(devicesByStatus),
        byStatus: devicesByStatus,
        staleHeartbeat,
        neverReportedHeartbeat,
      },
      capabilities: {
        readable: readableCapabilities,
        reportable: reportableCapabilities,
        writable: writableCapabilities,
      },
      telemetry: {
        latestObservedAt: latestTelemetry?.createdAt.toISOString() ?? null,
      },
      commands: {
        total: this.total(commandsByStatus),
        byStatus: commandsByStatus,
      },
    };
  }

  private createDeviceStatusCounts(): Record<DeviceStatus, number> {
    return Object.fromEntries(
      DEVICE_STATUSES.map((status) => [status, 0]),
    ) as Record<DeviceStatus, number>;
  }

  private createCommandStatusCounts(): Record<CommandStatus, number> {
    return Object.fromEntries(
      COMMAND_STATUSES.map((status) => [status, 0]),
    ) as Record<CommandStatus, number>;
  }

  private total<T extends string>(counts: Record<T, number>): number {
    return Object.values<number>(counts).reduce(
      (total, count) => total + count,
      0,
    );
  }
}
