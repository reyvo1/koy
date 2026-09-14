import { Body, Controller, Headers, Post } from '@nestjs/common';
import { ERROR_CODES } from '../common/errors/error-code';
import {
  DomainBadRequestException,
  DomainUnauthorizedException,
} from '../common/errors/domain-exceptions';
import { ConfigService } from '@nestjs/config';
import { TelemetryService } from './telemetry.service';
import { timingSafeEqual } from 'node:crypto';

@Controller('mqtt/webhook')
export class MqttTelemetryWebhookController {
  constructor(
    private telemetryService: TelemetryService,
    private configService: ConfigService,
  ) {}

  @Post('telemetry')
  async ingest(
    @Headers('x-webhook-secret') secret: string,
    @Body() body: unknown,
  ) {
    const configuredSecret = this.configService.get<string>(
      'MQTT_WEBHOOK_SECRET',
    );

    const actual = typeof secret === 'string' ? Buffer.from(secret, 'utf8') : null;
    const expected = configuredSecret
      ? Buffer.from(configuredSecret, 'utf8')
      : null;

    if (
      !actual ||
      !expected ||
      actual.length !== expected.length ||
      !timingSafeEqual(actual, expected)
    ) {
      throw new DomainUnauthorizedException(
        ERROR_CODES.MqttWebhookUnauthorized,
        'Invalid webhook secret',
      );
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new DomainBadRequestException(
        ERROR_CODES.MqttPayloadInvalid,
        'Invalid webhook body',
      );
    }

    const { topic, eventId, payload } = body as Record<string, unknown>;

    if (typeof topic !== 'string') {
      throw new DomainBadRequestException(
        ERROR_CODES.MqttTopicInvalid,
        'Invalid topic',
      );
    }

    const topicParts = topic.split('/');

    if (
      topicParts.length !== 5 ||
      topicParts[0] !== 'tenants' ||
      !topicParts[1] ||
      topicParts[2] !== 'devices' ||
      !topicParts[3] ||
      topicParts[4] !== 'telemetry'
    ) {
      throw new DomainBadRequestException(
        ERROR_CODES.MqttTopicInvalid,
        'Malformed topic',
      );
    }

    if (typeof eventId !== 'string' || !eventId.trim()) {
      throw new DomainBadRequestException(
        ERROR_CODES.TelemetryEventIdRequired,
        'Missing eventId',
      );
    }

    if (
      !payload ||
      typeof payload !== 'object' ||
      Array.isArray(payload) ||
      Object.keys(payload).length === 0
    ) {
      throw new DomainBadRequestException(
        ERROR_CODES.TelemetryPayloadInvalid,
        'Invalid payload',
      );
    }

    const tenantId = topicParts[1];
    const deviceId = topicParts[3];

    return this.telemetryService.ingest(tenantId, deviceId, eventId, payload);
  }
}
