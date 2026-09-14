import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ERROR_CODES } from '../common/errors/error-code';
import { DomainUnauthorizedException } from '../common/errors/domain-exceptions';
import { MqttService } from './mqtt.service';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';

@Controller('mqtt')
export class MqttWebhookController {
  constructor(
    private mqttService: MqttService,
    private configService: ConfigService,
  ) {}

  private secureEqual(left?: string, right?: string): boolean {
    if (!left || !right) {
      return false;
    }

    const leftBytes = Buffer.from(left, 'utf8');
    const rightBytes = Buffer.from(right, 'utf8');
    return (
      leftBytes.length === rightBytes.length &&
      timingSafeEqual(leftBytes, rightBytes)
    );
  }

  private validateSecret(secret?: string) {
    const configuredSecret = this.configService.get<string>(
      'MQTT_WEBHOOK_SECRET',
    );
    if (!configuredSecret || !this.secureEqual(secret, configuredSecret)) {
      throw new DomainUnauthorizedException(
        ERROR_CODES.MqttWebhookUnauthorized,
        'Invalid webhook secret',
      );
    }
  }

  private authenticatePublisher(
    username: string,
    password: string,
  ): boolean | undefined {
    const configuredUsername = this.configService
      .get<string>('MQTT_USERNAME')
      ?.trim();
    const configuredPassword = this.configService.get<string>('MQTT_PASSWORD');

    if (!configuredUsername || username !== configuredUsername) {
      return undefined;
    }

    if (!configuredPassword) {
      return false;
    }

    return this.secureEqual(password, configuredPassword);
  }

  @Post('auth')
  @HttpCode(HttpStatus.OK)
  async auth(
    @Headers('x-webhook-secret') secret: string,
    @Body() body: { username: string; password: string },
  ) {
    this.validateSecret(secret);

    if (
      !body ||
      typeof body.username !== 'string' ||
      body.username.trim().length === 0 ||
      typeof body.password !== 'string' ||
      body.password.length === 0
    ) {
      return { result: 'deny' };
    }

    const publisherAuthenticated = this.authenticatePublisher(
      body.username,
      body.password,
    );
    if (publisherAuthenticated !== undefined) {
      if (!publisherAuthenticated) {
        return { result: 'deny' };
      }

      return {
        result: 'allow',
        is_superuser: false,
        acl: [
          {
            permission: 'allow',
            action: 'publish',
            topic: 'tenants/+/devices/+/commands',
          },
          { permission: 'deny', action: 'all', topic: '#' },
        ],
      };
    }

    const identity = await this.mqttService.authenticateForBroker(
      body.username,
      body.password,
    );

    if (!identity.authenticated || !identity.tenantId) {
      return { result: 'deny' };
    }

    const topicPrefix = `tenants/${identity.tenantId}/devices/${body.username}`;

    // EMQX 5.8+ can consume ACL rules directly from the HTTP
    // authentication response. Keeping the ACL device-bound here removes a
    // second HTTP round-trip for every publish/subscribe while the /mqtt/acl
    // endpoint remains available for compatibility and independent checks.
    return {
      result: 'allow',
      is_superuser: false,
      acl: [
        {
          permission: 'allow',
          action: 'publish',
          topic: `eq ${topicPrefix}/telemetry`,
        },
        {
          permission: 'allow',
          action: 'publish',
          topic: `eq ${topicPrefix}/commands/ack`,
        },
        {
          permission: 'allow',
          action: 'subscribe',
          topic: `eq ${topicPrefix}/commands`,
        },
        { permission: 'deny', action: 'all', topic: '#' },
      ],
    };
  }

  @Post('acl')
  @HttpCode(HttpStatus.OK)
  async acl(
    @Headers('x-webhook-secret') secret: string,
    @Body()
    body: { username: string; topic: string; action: 'publish' | 'subscribe' },
  ) {
    this.validateSecret(secret);
    const isAuthorized = await this.mqttService.authorize(
      body.username,
      body.topic,
      body.action,
    );
    return isAuthorized ? { result: 'allow' } : { result: 'deny' };
  }

  @Post('ack')
  @HttpCode(HttpStatus.OK)
  async ack(
    @Headers('x-webhook-secret') secret: string,
    @Body() body: { topic: string; payload: any },
  ) {
    this.validateSecret(secret);
    return this.mqttService.handleAck(body.topic, body.payload);
  }
}
