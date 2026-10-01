import { Injectable } from '@nestjs/common';
import { ERROR_CODES } from '../common/errors/error-code';
import {
  DomainNotFoundException,
  DomainUnauthorizedException,
} from '../common/errors/domain-exceptions';
import { PrismaService } from '../prisma/prisma.service';
import { DeviceStatus, DeviceType } from '@prisma/client';
import * as crypto from 'crypto';
import * as argon2 from 'argon2';

/**
 * Camera onboarding slice (Smart Hotel roadmap, CCTV phase 1).
 *
 * Contract boundaries honored (module-10-barcode-cctv-ui-compatibility-contract):
 * - The scanned code is a bounded onboarding token only; it never encodes
 *   tenant identity, vendor protocol, or credentials.
 * - No camera credentials, RTSP URLs, or vendor payloads pass through here.
 * - Tenant isolation is derived server-side from authenticated context.
 *
 * Flow:
 *  1. Admin registers a camera -> status PROVISIONING, gets a one-time
 *     provisioning token valid 1 hour. Token hash stored; token itself
 *     returned once and rendered as a QR code by the client.
 *  2. The camera gateway (or simulated device) scans the QR and calls the
 *     public pair endpoint with the token + a chosen device password.
 *  3. Pairing consumes the token atomically and activates the camera.
 */
@Injectable()
export class CameraOnboardingService {
  constructor(private prisma: PrismaService) {}

  async register(
    tenantId: string,
    data: { name: string; vendor: string; model?: string },
  ) {
    const device = await this.prisma.device.create({
      data: {
        name: data.name,
        type: DeviceType.CAMERA,
        status: DeviceStatus.PROVISIONING,
        tenantId,
      },
    });
    // Safe presentation metadata lives in capability key-space, not in a
    // vendor-specific model: vendor/model are recorded as read-only caps.
    // Capability has no scalar "value" column — a capability is a *declaration* of what
    // a device can report, not a reading. The registration input is metadata, so it is
    // persisted in the capability's constraints JSON under `value`. Previously the
    // collected `value` was silently dropped on the floor: the capability row was created
    // with no payload at all, so a registered camera could never tell anyone its vendor.
    const caps = [
      { key: 'camera.vendor', value: data.vendor },
      ...(data.model ? [{ key: 'camera.model', value: data.model }] : []),
    ];
    for (const cap of caps) {
      await this.prisma.capability.create({
        data: {
          deviceId: device.id,
          key: cap.key,
          semanticType: 'metadata',
          dataType: 'string',
          isReadable: true,
          isWritable: false,
          isReportable: false,
          constraints: { value: cap.value },
        },
      });
    }

    const token = crypto.randomBytes(24).toString('hex');
    const tokenHash = await argon2.hash(token);
    await this.prisma.device.update({
      where: { id: device.id },
      data: {
        provisioningTokenHash: tokenHash,
        provisioningTokenExpires: new Date(Date.now() + 3600000),
      },
    });

    return {
      deviceId: device.id,
      name: device.name,
      type: device.type,
      status: device.status,
      /** One-time secret shown as QR content: iotcam://pair/<deviceId>/<token> */
      pairingUri: `iotcam://pair/${device.id}/${token}`,
      expiresInSeconds: 3600,
    };
  }

  async pair(deviceId: string, token: string, password: string) {
    const device = await this.prisma.device.findUnique({
      where: { id: deviceId },
      include: { credential: true },
    });
    if (
      !device ||
      device.type !== DeviceType.CAMERA ||
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
      // Keep the one-time QR token truly single-use under concurrent pair
      // requests. Secret verification happens above; this conditional database
      // claim is the atomic consume step. A racing request sees count=0 and
      // cannot rotate the camera credential after another request has claimed it.
      const claim = await tx.device.updateMany({
        where: {
          id: deviceId,
          type: DeviceType.CAMERA,
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
        update: { passwordHash },
        create: { deviceId, passwordHash },
      });
    });
    return { message: 'Camera paired', deviceId, status: DeviceStatus.PAIRED };
  }

  async listCameras(tenantId: string) {
    // vendor/model are stored as read-only capabilities, so they are selected
    // alongside the device and flattened here. The CCTV screen needs them to
    // tell two identically-named cameras apart; without them the list is a
    // column of repeated names.
    const devices = await this.prisma.device.findMany({
      where: { tenantId, type: DeviceType.CAMERA },
      select: {
        id: true,
        name: true,
        status: true,
        lastHeartbeatAt: true,
        createdAt: true,
        capabilities: {
          where: { key: { in: ['camera.vendor', 'camera.model'] } },
          select: { key: true, constraints: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return devices.map(({ capabilities, ...device }) => {
      const meta: Record<string, string | null> = {};
      for (const c of capabilities) {
        const stored = (c.constraints as { value?: unknown } | null)?.value;
        meta[c.key] = typeof stored === 'string' ? stored : null;
      }
      return {
        ...device,
        vendor: meta['camera.vendor'] ?? null,
        model: meta['camera.model'] ?? null,
      };
    });
  }

  async findOneCamera(tenantId: string, deviceId: string) {
    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, tenantId, type: DeviceType.CAMERA },
      select: {
        id: true,
        name: true,
        status: true,
        lastHeartbeatAt: true,
        capabilities: {
          select: { key: true, dataType: true, isReadable: true },
        },
      },
    });
    if (!device)
      throw new DomainNotFoundException(
        ERROR_CODES.DeviceNotFound,
        'Camera not found',
      );
    return device;
  }
}
