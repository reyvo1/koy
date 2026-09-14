import { Injectable } from '@nestjs/common';
import { ERROR_CODES } from '../common/errors/error-code';
import {
  DomainNotFoundException,
  DomainServiceUnavailableException,
  DomainUnauthorizedException,
} from '../common/errors/domain-exceptions';
import { PrismaService } from '../prisma/prisma.service';
import { DeviceStatus, DeviceType } from '@prisma/client';
import * as crypto from 'crypto';
import * as argon2 from 'argon2';

@Injectable()
export class DeviceService {
  constructor(private prisma: PrismaService) {}

  async findAll(
    tenantId: string,
    access?: { userId: string; membershipId: string; role: string },
  ) {
    if (!access || access.role === 'ADMIN' || access.role === 'PLATFORM_ADMIN') {
      return this.prisma.device.findMany({
        where: { tenantId },
      });
    }

    const [{ databaseNow }] = (await this.prisma.$queryRaw`
      SELECT clock_timestamp() AS "databaseNow"
    `) as Array<{ databaseNow: Date }>;

    return this.prisma.device.findMany({
      where: {
        tenantId,
        OR: [
          { ownerId: access.userId },
          {
            shareGrants: {
              some: {
                tenantId,
                grantedToMembershipId: access.membershipId,
                status: 'ACTIVE',
                expiresAt: { gt: databaseNow },
              },
            },
          },
        ],
      },
    });
  }

  async findOne(tenantId: string, deviceId: string) {
    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, tenantId },
    });
    if (!device)
      throw new DomainNotFoundException(
        ERROR_CODES.DeviceNotFound,
        'Device not found',
      );
    return device;
  }

  async create(tenantId: string, data: { name: string; type: DeviceType }) {
    return this.prisma.device.create({
      data: {
        name: data.name,
        type: data.type,
        tenantId,
      },
    });
  }

  async provision(tenantId: string, deviceId: string) {
    const device = await this.findOne(tenantId, deviceId);
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = await argon2.hash(token);
    await this.prisma.device.update({
      where: { id: device.id },
      data: {
        provisioningTokenHash: tokenHash,
        provisioningTokenExpires: new Date(Date.now() + 3600000),
      },
    });
    return {
      provisioningToken: token,
      pairingCode: `${device.id}:${token}`,
    };
  }

  async pair(deviceId: string, token: string, password: string) {
    const mqttUri = process.env.MQTT_BROKER_URL?.trim();
    if (!mqttUri) {
      throw new DomainServiceUnavailableException(
        ERROR_CODES.ServiceUnavailable,
        'MQTT broker is not configured',
      );
    }

    const device = await this.prisma.device.findUnique({
      where: { id: deviceId },
      include: { credential: true },
    });
    if (
      !device ||
      device.status === DeviceStatus.REVOKED ||
      !device.provisioningTokenHash ||
      !device.provisioningTokenExpires ||
      device.provisioningTokenExpires < new Date() ||
      !(await argon2.verify(device.provisioningTokenHash, token))
    ) {
      throw new DomainUnauthorizedException(
        ERROR_CODES.DeviceProvisioningTokenInvalid,
        'Invalid or expired provisioning token',
      );
    }

    const passwordHash = await argon2.hash(password);
    const expectedTokenHash = device.provisioningTokenHash;
    const claimNow = new Date();

    await this.prisma.$transaction(async (tx) => {
      // Consume the one-time token with a conditional claim. The token check
      // above proves knowledge of the secret; this database predicate makes
      // that proof single-use under concurrent pair requests. If another
      // request has already cleared/rotated the token, this update affects 0
      // rows and the whole transaction fails without touching credentials.
      const claim = await tx.device.updateMany({
        where: {
          id: deviceId,
          status: { not: DeviceStatus.REVOKED },
          provisioningTokenHash: expectedTokenHash,
          provisioningTokenExpires: { gte: claimNow },
        },
        data: {
          status: DeviceStatus.PAIRED,
          provisioningTokenHash: null,
          provisioningTokenExpires: null,
        },
      });

      if (claim.count !== 1) {
        throw new DomainUnauthorizedException(
          ERROR_CODES.DeviceProvisioningTokenInvalid,
          'Invalid or expired provisioning token',
        );
      }

      await tx.deviceCredential.upsert({
        where: { deviceId },
        create: { deviceId, passwordHash },
        update: { passwordHash },
      });
    });
    return {
      message: 'Device paired',
      deviceId: device.id,
      tenantId: device.tenantId,
      mqttUri,
      mqttUsername: device.id,
    };
  }

  async updateHeartbeat(tenantId: string, deviceId: string) {
    return this.prisma.device.update({
      where: {
        id: deviceId,
        tenantId,
      },
      data: { lastHeartbeatAt: new Date(), status: DeviceStatus.ACTIVE },
    });
  }

  async rotateCredential(
    tenantId: string,
    deviceId: string,
    oldSecret: string,
    newSecret: string,
  ) {
    const device = await this.prisma.device.findUnique({
      where: { id: deviceId },
      include: { credential: true },
    });
    if (
      !device ||
      !device.credential ||
      device.status === DeviceStatus.REVOKED ||
      !(await argon2.verify(device.credential.passwordHash, oldSecret))
    ) {
      throw new DomainUnauthorizedException(
        ERROR_CODES.DeviceCredentialsInvalid,
        'Invalid device credentials',
      );
    }
    const newPasswordHash = await argon2.hash(newSecret);
    await this.prisma.deviceCredential.update({
      where: { deviceId: device.id },
      data: { passwordHash: newPasswordHash },
    });
    return { message: 'Credential rotated' };
  }

  async revoke(tenantId: string, deviceId: string) {
    const device = await this.findOne(tenantId, deviceId);
    await this.prisma.device.update({
      where: { id: device.id },
      data: { status: DeviceStatus.REVOKED },
    });
    return { message: 'Device revoked' };
  }

  async assignOwner(tenantId: string, deviceId: string, userId: string) {
    const device = await this.findOne(tenantId, deviceId);
    const membership = await this.prisma.membership.findUnique({
      where: { userId_tenantId: { userId, tenantId } },
    });
    if (!membership || membership.status !== 'ACTIVE')
      throw new DomainNotFoundException(
        ERROR_CODES.TenantUserNotFound,
        'User not found in tenant',
      );

    await this.prisma.device.update({
      where: { id: device.id },
      data: { ownerId: userId },
    });
    return { message: 'Owner assigned' };
  }

  async checkHealth(
    tenantId: string,
    deviceId: string,
    now: Date = new Date(),
  ) {
    const device = await this.findOne(tenantId, deviceId);
    if (!device.lastHeartbeatAt) return { status: 'UNKNOWN' };
    const diff = now.getTime() - device.lastHeartbeatAt.getTime();
    return { status: diff > 300000 ? 'UNHEALTHY' : 'HEALTHY' }; // 5 mins
  }
}
