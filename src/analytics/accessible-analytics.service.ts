import { Injectable } from '@nestjs/common';
import { AnalyticsSeverity } from '@prisma/client';
import { DeviceService } from '../device/device.service';
import { PrismaService } from '../prisma/prisma.service';

const MAX_ALERT_DEVICES = 1000;
const MAX_ALERT_ITEMS = 100;

interface AccessibleAnalyticsContext {
  tenantId: string;
  membershipId: string;
  userId: string;
  role: string;
}

/**
 * End-user analytics alert read model.
 *
 * These rows are Module 16 WARNING/CRITICAL findings, not notification delivery
 * receipts. Device visibility is resolved first through the canonical
 * owner/share policy by DeviceService.findAll().
 */
@Injectable()
export class AccessibleAnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly devices: DeviceService,
  ) {}

  async listAlerts(context: AccessibleAnalyticsContext, requestedLimit = 50) {
    const limit = Math.max(1, Math.min(MAX_ALERT_ITEMS, requestedLimit));
    const accessible = await this.devices.findAll(context.tenantId, {
      userId: context.userId,
      membershipId: context.membershipId,
      role: context.role,
    });
    const boundedDevices = accessible.slice(0, MAX_ALERT_DEVICES);
    const ids = boundedDevices.map((device) => device.id);
    const names = new Map(boundedDevices.map((device) => [device.id, device.name]));

    const findings = ids.length === 0
      ? []
      : await this.prisma.analyticsFinding.findMany({
          where: {
            tenantId: context.tenantId,
            deviceId: { in: ids },
            severity: { in: [AnalyticsSeverity.WARNING, AnalyticsSeverity.CRITICAL] },
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: limit,
          select: {
            id: true,
            deviceId: true,
            capabilityKey: true,
            kind: true,
            severity: true,
            summary: true,
            confidence: true,
            detectorVersion: true,
            createdAt: true,
          },
        });

    return {
      source: 'ANALYTICS_FINDINGS' as const,
      notificationDeliveryHistory: false,
      deviceScopeTruncated: accessible.length > MAX_ALERT_DEVICES,
      maxDeviceScope: MAX_ALERT_DEVICES,
      limit,
      items: findings.map((finding) => ({
        ...finding,
        deviceName: names.get(finding.deviceId) ?? finding.deviceId,
      })),
    };
  }
}
