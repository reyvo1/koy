import { Injectable, Logger } from '@nestjs/common';
import { EdgeGatewayStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Wave 12 — edge gateway identity and attribution (ADR-010).
 *
 * Two boundaries do the work here.
 *
 * A gateway speaks only for an explicit allowlist. Not "every device in its region": region membership
 * changes for commissioning reasons that have nothing to do with whether a relay should be trusted to speak
 * for a new device, and an allowlist that widens by itself is not an allowlist.
 *
 * Attribution is recorded, not inferred. Telemetry keeps a null delivering gateway when the device reported
 * for itself, which is true of every row that predates this slice. Filling it in retroactively would invent
 * a delivery path nobody observed.
 */
@Injectable()
export class EdgeGatewayService {
  private readonly log = new Logger(EdgeGatewayService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Gateways in a tenant. A caller that does not name a tenant gets nothing, not every tenant's gateways. */
  async list(tenantId: string, limit = 200): Promise<GatewaySummary[]> {
    if (!tenantId) {
      throw new RangeError('tenantId is required: a gateway list must never run unscoped');
    }

    const gateways = await this.prisma.edgeGateway.findMany({
      where: { tenantId },
      orderBy: { gatewayCode: 'asc' },
      take: limit,
      select: {
        id: true,
        gatewayCode: true,
        displayName: true,
        gatewayStatus: true,
        lastSeenAt: true,
        regionId: true,
      },
    });
    return gateways;
  }

  /**
   * Add a device to a gateway's allowlist.
   *
   * The device lookup is tenant-scoped, so a gateway cannot be given a device the caller does not own even
   * if it knows the id.
   */
  async allowDevice(options: {
    tenantId: string;
    gatewayId: string;
    deviceId: string;
    now?: Date;
  }): Promise<GatewayDeviceRegistration> {
    if (!options.tenantId) {
      throw new RangeError('tenantId is required: gateway registration must never run unscoped');
    }
    if (!options.gatewayId) {
      throw new RangeError('gatewayId is required: a gateway device list needs a gateway');
    }
    if (!options.deviceId) {
      throw new RangeError('deviceId is required: a gateway device list needs a device');
    }

    const gateway = await this.prisma.edgeGateway.findFirst({
      where: { id: options.gatewayId, tenantId: options.tenantId },
      select: { id: true },
    });
    if (!gateway) {
      throw new RangeError(`gateway ${options.gatewayId} does not exist in this tenant`);
    }

    const device = await this.prisma.device.findFirst({
      where: { id: options.deviceId, tenantId: options.tenantId },
      select: { id: true },
    });
    if (!device) {
      throw new RangeError(`device ${options.deviceId} does not exist in this tenant`);
    }

    // Idempotent by (gatewayId, deviceId): registering twice is not an error, and does not create a second
    // row that would then have to be reasoned about.
    await this.prisma.edgeGatewayDevice.upsert({
      where: {
        gatewayId_deviceId: { gatewayId: options.gatewayId, deviceId: options.deviceId },
      },
      create: { gatewayId: options.gatewayId, deviceId: options.deviceId },
      update: {},
    });

    return {
      gatewayId: options.gatewayId,
      deviceId: options.deviceId,
      registeredAt: options.now ?? new Date(),
    };
  }

  /**
   * Decide whether a gateway may deliver telemetry for a device, and return the attribution to record.
   *
   * `null` is a real answer here, not a fallback: it means the device reported for itself and the caller
   * should leave `deliveredByGatewayId` null. That is what every pre-ADR-010 row says.
   */
  async resolveDelivery(options: {
    tenantId: string;
    gatewayId?: string | null;
    deviceId: string;
  }): Promise<DeliveryAttribution> {
    if (!options.tenantId) {
      throw new RangeError('tenantId is required: telemetry delivery must never be resolved unscoped');
    }
    if (!options.deviceId) {
      throw new RangeError('deviceId is required: telemetry delivery needs a device');
    }

    const device = await this.prisma.device.findFirst({
      where: { id: options.deviceId, tenantId: options.tenantId },
      select: { id: true },
    });
    if (!device) {
      throw new RangeError(`device ${options.deviceId} does not exist in this tenant`);
    }

    // No gateway named: the device reported for itself. Attributed to nobody, on purpose.
    if (!options.gatewayId) {
      return { deliveredByGatewayId: null, selfReported: true };
    }

    const gateway = await this.prisma.edgeGateway.findFirst({
      where: { id: options.gatewayId, tenantId: options.tenantId },
      select: {
        id: true,
        gatewayStatus: true,
        // Scoped to this tenant's gateway, so another tenant's allowlist can never authorise this delivery.
        devices: {
          where: { deviceId: options.deviceId },
          take: 1,
          select: { deviceId: true },
        },
      },
    });
    if (!gateway) {
      throw new RangeError(`gateway ${options.gatewayId} does not exist in this tenant`);
    }
    if (gateway.gatewayStatus === EdgeGatewayStatus.DISABLED) {
      throw new RangeError(`gateway ${options.gatewayId} is disabled and cannot deliver telemetry`);
    }
    if (gateway.devices.length === 0) {
      throw new RangeError(
        `gateway ${options.gatewayId} is not registered for device ${options.deviceId} and cannot speak for it`,
      );
    }

    return { deliveredByGatewayId: gateway.id, selfReported: false };
  }

  /**
   * Record that a gateway has checked in.
   *
   * This is the only path that moves a gateway out of UNKNOWN, so the status means "this gateway reported"
   * rather than "someone marked it up". The clock is supplied so the transition can be reproduced.
   */
  async recordHeartbeat(options: {
    tenantId: string;
    gatewayId: string;
    now?: Date;
  }): Promise<{ gatewayId: string; gatewayStatus: EdgeGatewayStatus; lastSeenAt: Date }> {
    if (!options.tenantId) {
      throw new RangeError('tenantId is required: a gateway heartbeat must never run unscoped');
    }
    if (!options.gatewayId) {
      throw new RangeError('gatewayId is required: a heartbeat needs a gateway');
    }

    const now = options.now ?? new Date();

    // Tenant-scoped and DISABLED-filtered: a disabled gateway cannot come back online by sending a heartbeat.
    const updated = await this.prisma.edgeGateway.updateMany({
      where: { id: options.gatewayId, tenantId: options.tenantId, gatewayStatus: { not: EdgeGatewayStatus.DISABLED } },
      data: { gatewayStatus: EdgeGatewayStatus.ONLINE, lastSeenAt: now },
    });
    if (updated.count === 0) {
      throw new RangeError(`gateway ${options.gatewayId} does not exist in this tenant, or is disabled`);
    }

    this.log.log(`gateway ${options.gatewayId} reported at ${now.toISOString()}`);
    return { gatewayId: options.gatewayId, gatewayStatus: EdgeGatewayStatus.ONLINE, lastSeenAt: now };
  }
}

export interface GatewaySummary {
  id: string;
  gatewayCode: string;
  displayName: string;
  gatewayStatus: EdgeGatewayStatus;
  lastSeenAt: Date | null;
  regionId: string | null;
}

export interface GatewayDeviceRegistration {
  gatewayId: string;
  deviceId: string;
  registeredAt: Date;
}

export interface DeliveryAttribution {
  /** null means the device reported for itself -- a real answer, not a missing one. */
  deliveredByGatewayId: string | null;
  selfReported: boolean;
}

export type TelemetryWriteWithAttribution = Prisma.TelemetryUncheckedCreateInput;