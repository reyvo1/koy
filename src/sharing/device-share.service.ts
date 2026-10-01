import { Injectable, Logger } from '@nestjs/common';
import { ShareGrantStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export const SHARE_LIMITS = {
  maxExpiryDays: 90,
  maxActiveGrantsPerDevice: 20,
} as const;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Module 18 Slice 18.1 — bounded, tenant-safe device sharing.
 * Owner (creator membership) grants VIEW or CONTROL on one device to one
 * membership with a mandatory expiry ≤ 90 days. Grants are revocable and
 * every mutation lands in the share audit log. Expired grants are evaluated
 * against the database clock at authorization time.
 */
@Injectable()
export class DeviceShareService {
  private readonly logger = new Logger(DeviceShareService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createGrant(input: {
    tenantId: string;
    deviceId: string;
    grantedToMembershipId: string;
    createdByMembershipId: string;
    permission: 'VIEW' | 'CONTROL';
    expiresAt: Date;
  }): Promise<{ id: string }> {
    this.assertUuid(input.tenantId);
    this.assertUuid(input.deviceId);
    this.assertUuid(input.grantedToMembershipId);

    const [{ databaseNow }] = (await this.prisma.$queryRaw`
      SELECT clock_timestamp() AS "databaseNow"
    `) as Array<{ databaseNow: Date }>;

    const maxExpiry = new Date(
      databaseNow.getTime() + SHARE_LIMITS.maxExpiryDays * 24 * 3600 * 1000,
    );
    if (
      !(input.expiresAt instanceof Date) ||
      input.expiresAt <= databaseNow ||
      input.expiresAt > maxExpiry
    ) {
      throw Object.assign(new Error('expiry out of bounds'), {
        code: 'SHARE_EXPIRY_INVALID',
      });
    }

    if (input.grantedToMembershipId === input.createdByMembershipId) {
      throw Object.assign(new Error('cannot share to self'), {
        code: 'SHARE_SELF_GRANT_INVALID',
      });
    }

    // Device must exist in tenant and creator must own it via membership check
    // performed by callers; here we verify device presence only.
    const device = await this.prisma.device.findFirst({
      where: { id: input.deviceId, tenantId: input.tenantId },
    });
    if (!device) {
      throw Object.assign(new Error('device not found'), {
        code: 'SHARE_DEVICE_NOT_FOUND',
      });
    }

    const activeCount = await this.prisma.deviceShareGrant.count({
      where: { deviceId: input.deviceId, status: 'ACTIVE' },
    });
    if (activeCount >= SHARE_LIMITS.maxActiveGrantsPerDevice) {
      throw Object.assign(new Error('too many active grants'), {
        code: 'SHARE_ACTIVE_LIMIT_EXCEEDED',
      });
    }

    const grant = await this.prisma.deviceShareGrant.create({
      data: {
        tenantId: input.tenantId,
        deviceId: input.deviceId,
        grantedToMembershipId: input.grantedToMembershipId,
        createdByMembershipId: input.createdByMembershipId,
        permission: input.permission,
        expiresAt: input.expiresAt,
      },
    });

    await this.audit(input.tenantId, grant.id, 'GRANTED', input.createdByMembershipId,
      `permission=${input.permission} expiresAt=${input.expiresAt.toISOString()}`);
    return { id: grant.id };
  }

  /** Authorization probe: ACTIVE + not expired + permission covers action. */
  async hasAccess(input: {
    tenantId: string;
    deviceId: string;
    membershipId: string;
    requiresControl: boolean;
  }): Promise<boolean> {
    const [{ databaseNow }] = (await this.prisma.$queryRaw`
      SELECT clock_timestamp() AS "databaseNow"
    `) as Array<{ databaseNow: Date }>;

    const grant = await this.prisma.deviceShareGrant.findFirst({
      where: {
        tenantId: input.tenantId,
        deviceId: input.deviceId,
        grantedToMembershipId: input.membershipId,
        status: ShareGrantStatus.ACTIVE,
        expiresAt: { gt: databaseNow },
        ...(input.requiresControl ? { permission: 'CONTROL' as const } : {}),
      },
    });
    return grant !== null;
  }

  async revokeGrant(input: {
    tenantId: string;
    grantId: string;
    actorMembershipId: string;
  }): Promise<void> {
    this.assertUuid(input.grantId);
    const update = await this.prisma.deviceShareGrant.updateMany({
      where: {
        id: input.grantId,
        tenantId: input.tenantId,
        status: ShareGrantStatus.ACTIVE,
      },
      data: { status: ShareGrantStatus.REVOKED, revokedAt: new Date() },
    });
    if (update.count !== 1) {
      throw Object.assign(new Error('grant not active'), {
        code: 'SHARE_GRANT_NOT_ACTIVE',
      });
    }
    await this.audit(input.tenantId, input.grantId, 'REVOKED', input.actorMembershipId, null);
  }

  /**
   * Read surface added with the Module 18 REST controller.
   *
   * Revoking a grant requires knowing its id, and an operator cannot see an id they have
   * no way to obtain. This is tenant-scoped and returns only what a tenant administrator
   * needs to decide: who holds access, at which permission, and until when. It deliberately
   * exposes no cross-tenant handle — the where clause pins `tenantId`, so a grant id from
   * another tenant is not readable, it is simply absent.
   */
  async listGrants(input: {
    tenantId: string;
    deviceId: string;
  }): Promise<
    Array<{
      id: string;
      grantedToMembershipId: string;
      permission: 'VIEW' | 'CONTROL';
      status: string;
      expiresAt: Date;
      revokedAt: Date | null;
      createdAt: Date;
    }>
  > {
    this.assertUuid(input.tenantId);
    this.assertUuid(input.deviceId);

    const device = await this.prisma.device.findFirst({
      where: { id: input.deviceId, tenantId: input.tenantId },
      select: { id: true },
    });
    if (!device) {
      throw Object.assign(new Error('device not found'), {
        code: 'SHARE_DEVICE_NOT_FOUND',
      });
    }

    return this.prisma.deviceShareGrant.findMany({
      where: { tenantId: input.tenantId, deviceId: input.deviceId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        grantedToMembershipId: true,
        permission: true,
        status: true,
        expiresAt: true,
        revokedAt: true,
        createdAt: true,
      },
    });
  }

  private async audit(
    tenantId: string,
    grantId: string,
    action: string,
    actorMembershipId: string,
    detail: string | null,
  ): Promise<void> {
    await this.prisma.shareAuditLog.create({
      data: { tenantId, grantId, action, actorMembershipId, detail },
    });
    this.logger.log({ event: 'share.audit', outcome: action, grantId });
  }

  private assertUuid(value: string): void {
    if (!UUID_PATTERN.test(value)) {
      throw Object.assign(new Error(`${value} is not a UUID`), {
        code: 'SHARE_IDENTITY_INVALID',
      });
    }
  }
}
