import { Injectable } from '@nestjs/common';
import { DeviceStatus, DeviceType } from '@prisma/client';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { DomainNotFoundException } from '../common/errors/domain-exceptions';
import { ERROR_CODES } from '../common/errors/error-code';

const MAX_LIST_TAKE = 200;
const TOKEN_TTL_MS = 60 * 60 * 1000;

interface ProvisionDeviceInput {
  tenantId: string;
  name: string;
  type: (typeof DeviceType)[keyof typeof DeviceType];
}

/**
 * Generic device provisioning (claim-code flow), mirroring the camera
 * onboarding contract: admin registers a device, receives a one-time
 * provisioning token shown only once; the device claims it to pair.
 */
@Injectable()
export class AdminDeviceProvisioningService {
  constructor(private readonly prisma: PrismaService) {}

  async provisionDevice(input: ProvisionDeviceInput) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: input.tenantId },
      select: { id: true },
    });
    if (!tenant) {
      throw new DomainNotFoundException(
        ERROR_CODES.NotFound,
        'Tenant not found',
      );
    }

    const token = crypto.randomBytes(24).toString('hex');
    const tokenHash = await argon2.hash(token);
    const device = await this.prisma.device.create({
      data: {
        name: input.name.trim(),
        type: input.type,
        status: DeviceStatus.PROVISIONING,
        tenantId: input.tenantId,
        provisioningTokenHash: tokenHash,
        provisioningTokenExpires: new Date(Date.now() + TOKEN_TTL_MS),
      },
      select: { id: true, name: true, type: true, status: true, createdAt: true },
    });

    return {
      device: {
        id: device.id,
        name: device.name,
        type: device.type,
        status: device.status,
        createdAt: device.createdAt.toISOString(),
      },
      provisioningToken: token,
      pairingCode: `${device.id}:${token}`,
      expiresInSeconds: TOKEN_TTL_MS / 1000,
      note: 'Token hanya ditampilkan sekali. Perangkat mengklaim token ini untuk pairing.',
    };
  }

  async listDevices(tenantId?: string) {
    const devices = await this.prisma.device.findMany({
      where: tenantId ? { tenantId } : undefined,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: MAX_LIST_TAKE,
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
        lastHeartbeatAt: true,
        createdAt: true,
        provisioningTokenExpires: true,
        tenant: { select: { name: true } },
      },
    });

    const now = Date.now();
    return {
      total: devices.length,
      items: devices.map((device) => ({
        id: device.id,
        name: device.name,
        type: device.type,
        status: device.status,
        tenantName: device.tenant.name,
        lastHeartbeatAt: device.lastHeartbeatAt?.toISOString() ?? null,
        claimPending:
          device.status === DeviceStatus.PROVISIONING &&
          device.provisioningTokenExpires !== null &&
          device.provisioningTokenExpires.getTime() > now,
        createdAt: device.createdAt.toISOString(),
      })),
    };
  }
}
