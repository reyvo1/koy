import { Injectable } from '@nestjs/common';
import { ShareGrantPermission, ShareGrantStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface DeviceAccessContext {
  tenantId: string;
  membershipId: string;
  userId: string;
  role: string;
}

export interface DeviceAccessDecision {
  deviceId: string;
  canView: boolean;
  canControl: boolean;
  source: 'ADMIN' | 'OWNER' | 'CONTROL_SHARE' | 'VIEW_SHARE' | 'NONE';
}

const ADMIN_ROLES = new Set(['ADMIN', 'PLATFORM_ADMIN']);
const MAX_DEVICE_ACCESS_BATCH = 2000;

/**
 * Central device authorization evaluator.
 *
 * This is intentionally separate from the HTTP guard so non-controller flows
 * such as dashboard resolution can apply the exact same owner/share rules.
 * The service only evaluates access; callers still decide whether denial is a
 * 403, a safe filtered result, or an unavailable widget.
 */
@Injectable()
export class DeviceAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveMany(
    context: DeviceAccessContext,
    deviceIds: readonly string[],
  ): Promise<Map<string, DeviceAccessDecision>> {
    const ids = [...new Set(deviceIds.filter((id) => typeof id === 'string' && id.trim() !== ''))];
    if (ids.length === 0) return new Map();
    if (ids.length > MAX_DEVICE_ACCESS_BATCH) {
      throw new Error('Device access batch exceeds safety limit');
    }

    if (ADMIN_ROLES.has(context.role)) {
      const devices = await this.prisma.device.findMany({
        where: { tenantId: context.tenantId, id: { in: ids } },
        select: { id: true },
      });
      return new Map(
        devices.map((device) => [
          device.id,
          {
            deviceId: device.id,
            canView: true,
            canControl: true,
            source: 'ADMIN' as const,
          },
        ]),
      );
    }

    const [{ databaseNow }] = (await this.prisma.$queryRaw`
      SELECT clock_timestamp() AS "databaseNow"
    `) as Array<{ databaseNow: Date }>;

    const devices = await this.prisma.device.findMany({
      where: { tenantId: context.tenantId, id: { in: ids } },
      select: {
        id: true,
        ownerId: true,
        shareGrants: {
          where: {
            tenantId: context.tenantId,
            grantedToMembershipId: context.membershipId,
            status: ShareGrantStatus.ACTIVE,
            expiresAt: { gt: databaseNow },
          },
          select: { permission: true },
        },
      },
    });

    const entries: Array<[string, DeviceAccessDecision]> = devices.map(
      (device): [string, DeviceAccessDecision] => {
        if (device.ownerId === context.userId) {
          return [
            device.id,
            {
              deviceId: device.id,
              canView: true,
              canControl: true,
              source: 'OWNER',
            },
          ];
        }

        const hasControl = device.shareGrants.some(
          (grant) => grant.permission === ShareGrantPermission.CONTROL,
        );
        if (hasControl) {
          return [
            device.id,
            {
              deviceId: device.id,
              canView: true,
              canControl: true,
              source: 'CONTROL_SHARE',
            },
          ];
        }

        const hasView = device.shareGrants.length > 0;
        return [
          device.id,
          {
            deviceId: device.id,
            canView: hasView,
            canControl: false,
            source: hasView ? 'VIEW_SHARE' : 'NONE',
          },
        ];
      },
    );

    return new Map<string, DeviceAccessDecision>(entries);
  }

  async resolveOne(
    context: DeviceAccessContext,
    deviceId: string,
  ): Promise<DeviceAccessDecision | null> {
    return (await this.resolveMany(context, [deviceId])).get(deviceId) ?? null;
  }
}
