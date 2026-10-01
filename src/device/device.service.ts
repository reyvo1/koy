import { Injectable, Logger, Optional } from '@nestjs/common';
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
import { WebhookDispatchService } from '../webhook/webhook-runtime.service';

@Injectable()
export class DeviceService {
  private readonly logger = new Logger(DeviceService.name);

  /**
   * `@Optional()` so the four existing specs that build this service by hand still construct,
   * and required in the real module graph (`DeviceModule` imports `WebhookModule`).
   *
   * The absence is reported rather than passed over: a missing dispatch service means
   * `device.state_changed` never fires, and a subscriber whose events are never delivered is
   * indistinguishable from a receiver that is simply quiet. Silence here would be the same
   * defect the webhook runtime was built to remove.
   */
  constructor(
    private prisma: PrismaService,
    @Optional() private webhooks?: WebhookDispatchService,
  ) {}

  /**
   * The columns a device is allowed to carry out of this service.
   *
   * `findAll` and `findOne` used to call Prisma with no `select`, so every scalar column on
   * the model went straight into the HTTP response — including `provisioningTokenHash`, the
   * argon2 hash of the pairing secret. Anyone who could list devices received material for
   * guessing provisioning tokens, on a route whose only job is to show a list.
   *
   * This is an allowlist rather than a denylist on purpose. Excluding the columns known to be
   * secret would have left the next one added to the model shipping again without anyone
   * remembering to come back here; enumerating the safe ones means that decision has to be
   * made deliberately, and the diff shows it when it happens.
   */
  private static readonly PUBLIC_SELECT = {
    id: true,
    name: true,
    type: true,
    status: true,
    lastHeartbeatAt: true,
    createdAt: true,
    updatedAt: true,
  } as const;

  async findAll(
    tenantId: string,
    access?: { userId: string; membershipId: string; role: string },
  ) {
    if (!access || access.role === 'ADMIN' || access.role === 'PLATFORM_ADMIN') {
      return this.prisma.device.findMany({
        where: { tenantId },
        select: DeviceService.PUBLIC_SELECT,
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
      select: DeviceService.PUBLIC_SELECT,
    });
  }

  async findOne(tenantId: string, deviceId: string) {
    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, tenantId },
      select: DeviceService.PUBLIC_SELECT,
    });
    if (!device)
      throw new DomainNotFoundException(
        ERROR_CODES.DeviceNotFound,
        'Device not found',
      );
    return device;
  }

  async create(tenantId: string, data: { name: string; type: DeviceType }) {
    const device = await this.prisma.device.create({
      data: {
        name: data.name,
        type: data.type,
        tenantId,
      },
    });

    // `device.registered` was in `SUBSCRIBABLE_EVENTS` with no emitter anywhere, so a tenant
    // subscribing to it got a confirmed registration and never a delivery. The event is
    // emitted from the same place `device.state_changed` is, and for the same reason: the
    // create is the only moment a device begins to exist, so it is the only moment a
    // subscriber can learn it did.
    //
    // Not awaited into the request path, and not allowed to fail the create. `emitStateChanged`
    // is fire-and-forget for the same reason; a receiver that is down must not be able to
    // refuse a device registration.
    this.emitEvent(tenantId, 'device.registered', {
      deviceId: device.id,
      name: device.name,
      type: device.type,
      status: device.status,
      occurredAt: new Date().toISOString(),
    });

    return device;
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

  /**
   * Record a device heartbeat, and emit `device.state_changed` to any subscriber.
   *
   * This is the only place a device is observed alive, so it is the honest trigger for the
   * event: before it, `device.state_changed` was a name in a list the operator could subscribe
   * to and nothing that ever fired it, which is how a subscription becomes indistinguishable
   * from a dead one.
   *
   * The dispatch is deliberately not awaited into the caller's success path. A receiver that
   * hangs must not make a heartbeat fail — the heartbeat has already been recorded, and a
   * failed delivery is evidence in `webhook_deliveries` rather than an error here. Failures
   * are swallowed and logged because an unhandled rejection from an outbound HTTP call would
   * otherwise take down the process that was merely reporting a device's liveness.
   */
  async updateHeartbeat(tenantId: string, deviceId: string) {
    const device = await this.prisma.device.update({
      where: {
        id: deviceId,
        tenantId,
      },
      data: { lastHeartbeatAt: new Date(), status: DeviceStatus.ACTIVE },
    });

    // `emitStateChanged` no longer returns a promise: the dispatch is fired and its failure
    // logged inside `emitEvent`. Keeping a `.catch()` here would look like it were handling a
    // rejection that can no longer happen, and the one real failure — a dispatch service that
    // is not registered — would be reported by `emitEvent` alone, under a name that does not
    // say which device it was about.
    this.emitStateChanged(tenantId, device);

    return device;
  }

  private emitStateChanged(
    tenantId: string,
    device: { id: string; name: string; type: string; status: DeviceStatus },
  ): void {
    this.emitEvent(tenantId, 'device.state_changed', {
      deviceId: device.id,
      name: device.name,
      type: device.type,
      status: device.status,
      occurredAt: new Date().toISOString(),
    });
  }

  /**
   * Fire one domain event at every subscriber, and swallow a dispatch failure loudly.
   *
   * Shared by every emitter so the two properties that make an event trustworthy are stated
   * once: a missing `WebhookDispatchService` is reported rather than passed over, and a
   * receiver that is down is recorded but never propagated into the caller's request. An
   * emitter that inlined either decision would eventually get one of them wrong, and the
   * symptom would be an endpoint that silently never fires.
   */
  private emitEvent(tenantId: string, event: string, payload: unknown): void {
    if (!this.webhooks) {
      this.logger.warn({
        event: 'webhook.dispatch.unavailable',
        outcome: 'skipped',
        tenantId,
        // The domain event name travels as its own field rather than interpolated into
        // `event`. The structured logging contract requires a literal there, and it is
        // right to: `event` is the field a log aggregator groups and alerts on, and a value
        // assembled at runtime is one an alert rule cannot name. `webhookEvent` stays a
        // plain string with no such obligation.
        webhookEvent: event,
        reason: `WebhookDispatchService is not registered; ${event} is not delivered`,
      });
      return;
    }
    void this.webhooks.dispatch(tenantId, event, payload).catch((error) => {
      // A structured object, not an interpolated string: the structured logging contract
      // requires every application logger call to pass one, so a message that cannot be
      // filtered or aggregated fails the gate.
      this.logger.warn({
        event: 'webhook.dispatch.failed',
        outcome: 'failed',
        tenantId,
        webhookEvent: event,
        reason: error instanceof Error ? error.message : String(error),
      });
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
