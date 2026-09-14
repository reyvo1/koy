import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { ERROR_CODES } from '../common/errors/error-code';
import {
  DomainBadRequestException,
  DomainNotFoundException,
} from '../common/errors/domain-exceptions';
import { CommandStatus, DeviceCommand, Prisma } from '@prisma/client';
import { toStructuredLogError } from '../common/logging/log-error';
import { MetricsService } from '../metrics/metrics.service';
import { MqttService } from '../mqtt/mqtt.service';
import { PrismaService } from '../prisma/prisma.service';
import { CapabilityValidator } from './capability.validator';

@Injectable()
export class CommandService {
  private readonly logger = new Logger(CommandService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => MqttService))
    private readonly mqttService: MqttService,
    private readonly capabilityValidator: CapabilityValidator,
    @Optional() private readonly metrics?: MetricsService,
  ) {}

  async publish(
    tenantId: string,
    deviceId: string,
    payload: any,
    idempotencyKey?: string,
  ) {
    if (
      !payload ||
      typeof payload !== 'object' ||
      Array.isArray(payload) ||
      Object.keys(payload).length === 0
    ) {
      throw new DomainBadRequestException(
        ERROR_CODES.CommandPayloadInvalid,
        'Invalid payload',
      );
    }

    const normalizedIdempotencyKey = idempotencyKey?.trim();

    if (idempotencyKey !== undefined && !normalizedIdempotencyKey) {
      throw new DomainBadRequestException(
        ERROR_CODES.CommandIdempotencyKeyInvalid,
        'Invalid idempotency key',
      );
    }

    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, tenantId },
      include: { capabilities: true },
    });

    if (!device || device.status === 'REVOKED') {
      throw new DomainNotFoundException(
        ERROR_CODES.CommandDeviceUnavailable,
        'Device not found or revoked',
      );
    }

    if (normalizedIdempotencyKey) {
      const existing = await this.prisma.deviceCommand.findUnique({
        where: {
          deviceId_idempotencyKey: {
            deviceId,
            idempotencyKey: normalizedIdempotencyKey,
          },
        },
      });

      if (existing) {
        if (
          existing.tenantId !== tenantId ||
          !this.isSamePayload(existing.payload, payload)
        ) {
          throw new DomainBadRequestException(
            ERROR_CODES.CommandIdempotencyConflict,
            'Idempotency key conflict',
          );
        }

        this.metrics?.recordCommandLifecycle('idempotent_replay');
        return existing;
      }
    }

    for (const key of Object.keys(payload)) {
      const capability = device.capabilities.find(
        (capability) => capability.key === key,
      );

      if (!capability) {
        throw new DomainBadRequestException(
          ERROR_CODES.CommandCapabilityNotDefined,
          `Capability ${key} not defined for device`,
        );
      }

      if (!capability.isWritable) {
        throw new DomainBadRequestException(
          ERROR_CODES.CommandCapabilityNotWritable,
          `Capability ${key} is not writable`,
        );
      }

      this.capabilityValidator.validateValue(payload[key], capability);
    }

    let command;

    try {
      command = await this.prisma.deviceCommand.create({
        data: {
          tenantId,
          deviceId,
          payload,
          idempotencyKey: normalizedIdempotencyKey,
          status: CommandStatus.PENDING,
        },
      });
      this.metrics?.recordCommandLifecycle('created');
    } catch (error) {
      if (
        normalizedIdempotencyKey &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await this.prisma.deviceCommand.findUnique({
          where: {
            deviceId_idempotencyKey: {
              deviceId,
              idempotencyKey: normalizedIdempotencyKey,
            },
          },
        });

        if (!existing) {
          throw error;
        }

        if (
          existing.tenantId !== tenantId ||
          !this.isSamePayload(existing.payload, payload)
        ) {
          throw new DomainBadRequestException(
            ERROR_CODES.CommandIdempotencyConflict,
            'Idempotency key conflict',
          );
        }

        this.metrics?.recordCommandLifecycle('idempotent_replay');
        return existing;
      }

      throw error;
    }

    const topic = `tenants/${tenantId}/devices/${deviceId}/commands`;

    try {
      await this.mqttService.publish(topic, {
        commandId: command.correlationId,
        payload,
      });
      this.metrics?.recordCommandLifecycle('sent');
    } catch (error) {
      this.metrics?.recordCommandLifecycle('publish_failed');

      this.logger.error({
        event: 'command.publish.failed',
        tenantId,
        deviceId,
        commandId: command.id,
        correlationId: command.correlationId,
        outcome: 'failed',
        error: toStructuredLogError(error),
      });

      // A broker publish that did not confirm is treated as failed. The state
      // transition is conditional so a concurrent terminal device result can
      // never be overwritten by failure bookkeeping.
      try {
        await this.prisma.deviceCommand.updateMany({
          where: { id: command.id, status: CommandStatus.PENDING },
          data: { status: CommandStatus.FAILED },
        });
      } catch (persistError) {
        this.logger.error({
          event: 'command.publish.failure_state_persist_failed',
          tenantId,
          deviceId,
          commandId: command.id,
          correlationId: command.correlationId,
          outcome: 'degraded',
          error: toStructuredLogError(persistError),
        });
      }

      throw new DomainBadRequestException(
        ERROR_CODES.CommandPublishFailed,
        'Failed to publish command',
      );
    }

    // The broker has confirmed QoS-1 publication at this point. Persist SENT
    // only if the row is still PENDING: a fast device ACK may already have
    // moved it to ACKNOWLEDGED/FAILED, and terminal state must never regress
    // back to SENT. If persistence itself is unavailable after broker
    // confirmation, return the durable/created PENDING view instead of
    // fabricating FAILED; ACK handling is explicitly allowed to settle PENDING.
    const sentAt = new Date();
    try {
      const transition = await this.prisma.deviceCommand.updateMany({
        where: { id: command.id, status: CommandStatus.PENDING },
        data: {
          status: CommandStatus.SENT,
          sentAt,
        },
      });

      if (transition.count === 1) {
        this.logger.log({
          event: 'command.publish.succeeded',
          tenantId,
          deviceId,
          commandId: command.id,
          correlationId: command.correlationId,
          outcome: 'succeeded',
        });
        return {
          ...command,
          status: CommandStatus.SENT,
          sentAt,
        };
      }

      const durable = await this.prisma.deviceCommand.findUnique({
        where: { id: command.id },
      });
      this.metrics?.recordCommandLifecycle('sent_state_raced');
      this.logger.debug({
        event: 'command.publish.sent_state_raced',
        tenantId,
        deviceId,
        commandId: command.id,
        correlationId: command.correlationId,
        outcome: 'preserved',
        durableStatus: durable?.status,
      });
      this.logger.log({
        event: 'command.publish.succeeded',
        tenantId,
        deviceId,
        commandId: command.id,
        correlationId: command.correlationId,
        outcome: 'succeeded',
      });
      return durable ?? command;
    } catch (error) {
      this.metrics?.recordCommandLifecycle('sent_persistence_failed');
      this.logger.error({
        event: 'command.publish.sent_state_persist_failed',
        tenantId,
        deviceId,
        commandId: command.id,
        correlationId: command.correlationId,
        outcome: 'degraded',
        error: toStructuredLogError(error),
      });
      this.logger.log({
        event: 'command.publish.succeeded',
        tenantId,
        deviceId,
        commandId: command.id,
        correlationId: command.correlationId,
        outcome: 'succeeded',
      });
      return command;
    }
  }

  async findTenantDeviceCommandByIdempotencyKey(
    tenantId: string,
    deviceId: string,
    idempotencyKey: string,
  ): Promise<DeviceCommand | null> {
    const normalizedIdempotencyKey = idempotencyKey.trim();
    if (!normalizedIdempotencyKey) {
      throw new DomainBadRequestException(
        ERROR_CODES.CommandIdempotencyKeyInvalid,
        'Invalid idempotency key',
      );
    }

    const command = await this.prisma.deviceCommand.findUnique({
      where: {
        deviceId_idempotencyKey: {
          deviceId,
          idempotencyKey: normalizedIdempotencyKey,
        },
      },
    });

    if (!command || command.tenantId !== tenantId) {
      return null;
    }

    return command;
  }

  async getByCorrelationId(
    tenantId: string,
    deviceId: string,
    correlationId: string,
  ) {
    const normalizedCorrelationId = correlationId.trim();
    if (!normalizedCorrelationId) {
      throw new DomainBadRequestException(
        ERROR_CODES.CommandAcknowledgementInvalid,
        'Invalid command id',
      );
    }

    const command = await this.prisma.deviceCommand.findUnique({
      where: { correlationId: normalizedCorrelationId },
    });

    if (
      !command ||
      command.tenantId !== tenantId ||
      command.deviceId !== deviceId
    ) {
      throw new DomainNotFoundException(
        ERROR_CODES.CommandNotFound,
        'Command not found',
      );
    }

    return command;
  }

  async getHistory(
    tenantId: string,
    deviceId: string,
    limit?: any,
    offset?: any,
  ) {
    const { safeLimit, safeOffset } = this.getSafePagination(limit, offset);

    return this.prisma.deviceCommand.findMany({
      where: { tenantId, deviceId },
      orderBy: { createdAt: 'desc' },
      take: safeLimit,
      skip: safeOffset,
    });
  }

  async markTimedOut(thresholdDate: Date) {
    const result = await this.prisma.deviceCommand.updateMany({
      where: {
        status: CommandStatus.SENT,
        sentAt: { lt: thresholdDate },
      },
      data: {
        status: CommandStatus.TIMED_OUT,
      },
    });

    if (result.count > 0) {
      this.metrics?.recordCommandLifecycle('timed_out', result.count);
    }

    return result;
  }

  async countStalePending(thresholdDate: Date) {
    return this.prisma.deviceCommand.count({
      where: {
        status: CommandStatus.PENDING,
        createdAt: { lt: thresholdDate },
      },
    });
  }

  async acknowledge(
    tenantId: string,
    deviceId: string,
    commandId: string,
    deviceResult: 'ACK' | 'FAILED' = 'ACK',
  ) {
    const command = await this.prisma.deviceCommand.findUnique({
      where: {
        correlationId: commandId,
      },
    });

    if (
      !command ||
      command.tenantId !== tenantId ||
      command.deviceId !== deviceId
    ) {
      return this.rejectAcknowledgement(
        tenantId,
        deviceId,
        commandId,
        undefined,
        'command_not_found_or_wrong_device',
      );
    }

    const nextStatus =
      deviceResult === 'FAILED' ? CommandStatus.FAILED : CommandStatus.ACKNOWLEDGED;

    if (command.status === nextStatus) {
      this.metrics?.recordCommandLifecycle('acknowledgement_replayed');
      this.logger.debug({
        event: 'command.acknowledge.replayed',
        tenantId,
        deviceId,
        commandId: command.id,
        correlationId: commandId,
        outcome: 'replayed',
      });
      return this.acknowledgementResponse(nextStatus);
    }

    if (
      command.status !== CommandStatus.PENDING &&
      command.status !== CommandStatus.SENT
    ) {
      return this.rejectAcknowledgement(
        tenantId,
        deviceId,
        commandId,
        command.id,
        'command_status_conflict',
      );
    }

    const result = await this.prisma.deviceCommand.updateMany({
      where: {
        id: command.id,
        status: { in: [CommandStatus.PENDING, CommandStatus.SENT] },
      },
      data: {
        status: nextStatus,
        acknowledgedAt: new Date(),
      },
    });

    if (result.count === 0) {
      // QoS 1 and webhook retries can race the first acknowledgement. Re-read
      // once and accept the replay only when the durable terminal state agrees
      // with the device result; conflicting transitions remain fail-closed.
      const durable = await this.prisma.deviceCommand.findUnique({
        where: { correlationId: commandId },
      });
      if (
        durable &&
        durable.tenantId === tenantId &&
        durable.deviceId === deviceId &&
        durable.status === nextStatus
      ) {
        this.metrics?.recordCommandLifecycle('acknowledgement_replayed');
        this.logger.debug({
          event: 'command.acknowledge.replayed',
          tenantId,
          deviceId,
          commandId: durable.id,
          correlationId: commandId,
          outcome: 'replayed',
        });
        return this.acknowledgementResponse(nextStatus);
      }

      return this.rejectAcknowledgement(
        tenantId,
        deviceId,
        commandId,
        command.id,
        'concurrent_status_change',
      );
    }

    this.metrics?.recordCommandLifecycle('acknowledged');

    this.logger.log({
      event: 'command.acknowledge.succeeded',
      tenantId,
      deviceId,
      commandId: command.id,
      correlationId: commandId,
      outcome: deviceResult === 'FAILED' ? 'device_failed' : 'succeeded',
    });

    return this.acknowledgementResponse(nextStatus);
  }

  private acknowledgementResponse(status: CommandStatus) {
    return {
      message:
        status === CommandStatus.FAILED
          ? 'Command failed on device'
          : 'Command acknowledged',
      status,
    };
  }

  private rejectAcknowledgement(
    tenantId: string,
    deviceId: string,
    correlationId: string,
    commandId: string | undefined,
    reason: string,
  ): never {
    this.metrics?.recordCommandLifecycle('acknowledgement_rejected');
    this.logger.warn({
      event: 'command.acknowledge.rejected',
      tenantId,
      deviceId,
      commandId,
      correlationId,
      outcome: 'rejected',
      reason,
    });
    throw new DomainBadRequestException(
      ERROR_CODES.CommandAcknowledgementInvalid,
      'Invalid acknowledgement',
    );
  }

  private getSafePagination(limit: any, offset: any) {
    const parsedLimit = Number(limit);
    const parsedOffset = Number(offset);

    let safeLimit = 10;

    if (Number.isInteger(parsedLimit)) {
      if (parsedLimit >= 1 && parsedLimit <= 100) {
        safeLimit = parsedLimit;
      } else if (parsedLimit > 100) {
        safeLimit = 100;
      }
    }

    let safeOffset = 0;

    if (Number.isInteger(parsedOffset) && parsedOffset >= 0) {
      safeOffset = parsedOffset;
    }

    return {
      safeLimit,
      safeOffset,
    };
  }

  private isSamePayload(existing: unknown, incoming: unknown): boolean {
    return (
      JSON.stringify(this.normalizeValue(existing)) ===
      JSON.stringify(this.normalizeValue(incoming))
    );
  }

  private normalizeValue(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.normalizeValue(item));
    }

    if (value !== null && typeof value === 'object') {
      return Object.keys(value)
        .sort()
        .reduce<Record<string, unknown>>((normalized, key) => {
          normalized[key] = this.normalizeValue(
            (value as Record<string, unknown>)[key],
          );

          return normalized;
        }, {});
    }

    return value;
  }
}
