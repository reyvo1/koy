import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { ERROR_CODES } from '../common/errors/error-code';
import { DomainBadRequestException } from '../common/errors/domain-exceptions';
import { DeviceStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { CommandService } from '../device/command.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  MQTT_PUBLISHER_TRANSPORT,
  MqttPublisherTransport,
} from './mqtt-publisher.transport';


export interface MqttBrokerIdentity {
  authenticated: boolean;
  tenantId?: string;
}

@Injectable()
export class MqttService {
  private readonly logger = new Logger(MqttService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => CommandService))
    private readonly commandService: CommandService,
    @Inject(MQTT_PUBLISHER_TRANSPORT)
    private readonly publisherTransport: MqttPublisherTransport,
  ) {}

  getTransportReadiness(): { ready: boolean; reason?: string } {
    return this.publisherTransport.getReadiness();
  }

  async publish(topic: string, message: any): Promise<void> {
    this.logger.log({
      event: 'mqtt.publish.requested',
      topic,
      outcome: 'accepted',
    });

    await this.publisherTransport.publish(topic, message);
  }

  async handleAck(topic: string, payload: any) {
    const topicParts = topic.split('/');

    if (
      topicParts.length !== 6 ||
      topicParts[0] !== 'tenants' ||
      topicParts[2] !== 'devices' ||
      topicParts[4] !== 'commands' ||
      topicParts[5] !== 'ack'
    ) {
      this.logAckRejected('malformed_topic');
      throw new DomainBadRequestException(
        ERROR_CODES.MqttTopicInvalid,
        'Malformed ack topic',
      );
    }

    const tenantId = topicParts[1];
    const deviceId = topicParts[3];

    if (tenantId === '' || deviceId === '') {
      this.logAckRejected('missing_topic_identity');
      throw new DomainBadRequestException(
        ERROR_CODES.MqttTopicInvalid,
        'Malformed ack topic',
      );
    }

    if (
      !payload ||
      typeof payload !== 'object' ||
      Array.isArray(payload) ||
      Object.keys(payload).length === 0
    ) {
      this.logAckRejected('invalid_payload', tenantId, deviceId);
      throw new DomainBadRequestException(
        ERROR_CODES.MqttPayloadInvalid,
        'Invalid payload',
      );
    }

    const { commandId, status } = payload;

    if (typeof commandId !== 'string' || commandId.trim().length === 0) {
      this.logAckRejected('invalid_command_id', tenantId, deviceId);
      throw new DomainBadRequestException(
        ERROR_CODES.MqttCommandIdInvalid,
        'Invalid commandId',
      );
    }

    if (status !== undefined && status !== 'ACK' && status !== 'FAILED') {
      this.logAckRejected('invalid_status', tenantId, deviceId);
      throw new DomainBadRequestException(
        ERROR_CODES.MqttPayloadInvalid,
        'Invalid acknowledgement status',
      );
    }

    this.logger.log({
      event: 'mqtt.ack.received',
      tenantId,
      deviceId,
      correlationId: commandId,
      outcome: status === 'FAILED' ? 'failed' : 'accepted',
    });

    if (status === 'FAILED') {
      return this.commandService.acknowledge(
        tenantId,
        deviceId,
        commandId,
        'FAILED',
      );
    }
    return this.commandService.acknowledge(tenantId, deviceId, commandId);
  }

  async authenticate(deviceId: string, secret: string): Promise<boolean> {
    const identity = await this.authenticateForBroker(deviceId, secret);
    return identity.authenticated;
  }

  async authenticateForBroker(
    deviceId: string,
    secret: string,
  ): Promise<MqttBrokerIdentity> {
    const device = await this.prisma.device.findUnique({
      where: { id: deviceId },
      include: { credential: true },
    });

    if (!device) {
      this.logAuthenticationDenied(deviceId, 'device_not_found');
      return { authenticated: false };
    }

    if (device.status === DeviceStatus.REVOKED) {
      this.logAuthenticationDenied(deviceId, 'device_revoked', device.tenantId);
      return { authenticated: false };
    }

    if (!device.credential) {
      this.logAuthenticationDenied(
        deviceId,
        'credential_not_configured',
        device.tenantId,
      );
      return { authenticated: false };
    }

    const authenticated = await argon2.verify(
      device.credential.passwordHash,
      secret,
    );

    if (!authenticated) {
      this.logAuthenticationDenied(
        deviceId,
        'credential_mismatch',
        device.tenantId,
      );
      return { authenticated: false };
    }

    this.logger.debug({
      event: 'mqtt.auth.succeeded',
      tenantId: device.tenantId,
      deviceId,
      outcome: 'succeeded',
    });

    return { authenticated: true, tenantId: device.tenantId };
  }

  async authorize(
    deviceId: string,
    topic: string,
    action: 'publish' | 'subscribe',
  ): Promise<boolean> {
    const device = await this.prisma.device.findUnique({
      where: { id: deviceId },
    });

    if (!device) {
      this.logAuthorizationDenied(deviceId, topic, action, 'device_not_found');
      return false;
    }

    if (device.status === DeviceStatus.REVOKED) {
      this.logAuthorizationDenied(
        deviceId,
        topic,
        action,
        'device_revoked',
        device.tenantId,
      );
      return false;
    }

    const expectedPrefix = `tenants/${device.tenantId}/devices/${deviceId}`;
    const isAllowed =
      (action === 'publish' &&
        (topic === `${expectedPrefix}/telemetry` ||
          topic === `${expectedPrefix}/commands/ack`)) ||
      (action === 'subscribe' && topic === `${expectedPrefix}/commands`);

    if (isAllowed) {
      this.logger.debug({
        event: 'mqtt.acl.allowed',
        tenantId: device.tenantId,
        deviceId,
        topic,
        action,
        outcome: 'allowed',
      });

      return true;
    }

    this.logAuthorizationDenied(
      deviceId,
      topic,
      action,
      'topic_not_allowed',
      device.tenantId,
    );

    return false;
  }

  private logAckRejected(
    reason: string,
    tenantId?: string,
    deviceId?: string,
  ): void {
    this.logger.warn({
      event: 'mqtt.ack.rejected',
      tenantId,
      deviceId,
      outcome: 'rejected',
      reason,
    });
  }

  private logAuthenticationDenied(
    deviceId: string,
    reason: string,
    tenantId?: string,
  ): void {
    this.logger.warn({
      event: 'mqtt.auth.denied',
      tenantId,
      deviceId,
      outcome: 'denied',
      reason,
    });
  }

  private logAuthorizationDenied(
    deviceId: string,
    topic: string,
    action: 'publish' | 'subscribe',
    reason: string,
    tenantId?: string,
  ): void {
    this.logger.warn({
      event: 'mqtt.acl.denied',
      tenantId,
      deviceId,
      topic,
      action,
      outcome: 'denied',
      reason,
    });
  }
}
