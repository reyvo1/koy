import { readFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { IClientOptions } from 'mqtt';

export interface MqttPublisherSettings {
  brokerUrl: string;
  clientId: string;
  connectTimeoutMs: number;
  publishTimeoutMs: number;
  shutdownTimeoutMs: number;
  commandExpirySeconds: number;
  clientOptions: IClientOptions;
}

export function createMqttPublisherClientId(
  configuredPrefix: string,
  processId = process.pid,
  runtimeHostname = hostname(),
  uniqueSuffix = randomUUID().slice(0, 8),
): string {
  const normalizedHost = runtimeHostname
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);

  return `${configuredPrefix}-${normalizedHost || 'host'}-${processId}-${uniqueSuffix}`.slice(
    0,
    96,
  );
}

export function resolveMqttPublisherSettings(
  configService: ConfigService,
): MqttPublisherSettings | undefined {
  const brokerUrl = configService.get<string>('MQTT_BROKER_URL')?.trim();

  if (!brokerUrl) {
    return undefined;
  }

  const clientIdPrefix = configService.getOrThrow<string>(
    'MQTT_CLIENT_ID_PREFIX',
  );
  const caFile = configService.get<string>('MQTT_CA_FILE')?.trim();
  const clientId = createMqttPublisherClientId(clientIdPrefix);
  const connectTimeoutMs = configService.get<number>(
    'MQTT_CONNECT_TIMEOUT_MS',
    10_000,
  );
  const publishTimeoutMs = configService.get<number>(
    'MQTT_PUBLISH_TIMEOUT_MS',
    10_000,
  );
  const shutdownTimeoutMs = Math.max(publishTimeoutMs, connectTimeoutMs);
  const commandAckTimeoutMs = configService.get<number>(
    'COMMAND_ACK_TIMEOUT_MS',
    300_000,
  );

  return {
    brokerUrl,
    clientId,
    connectTimeoutMs,
    publishTimeoutMs,
    shutdownTimeoutMs,
    commandExpirySeconds: Math.max(1, Math.ceil(commandAckTimeoutMs / 1000)),
    clientOptions: {
      protocolVersion: 5,
      clean: true,
      clientId,
      username: configService.getOrThrow<string>('MQTT_USERNAME'),
      password: configService.getOrThrow<string>('MQTT_PASSWORD'),
      connectTimeout: connectTimeoutMs,
      reconnectPeriod: configService.get<number>(
        'MQTT_RECONNECT_PERIOD_MS',
        5_000,
      ),
      keepalive: configService.get<number>('MQTT_KEEPALIVE_SECONDS', 30),
      queueQoSZero: false,
      resubscribe: false,
      rejectUnauthorized: true,
      properties: {
        sessionExpiryInterval: 0,
      },
      ...(caFile ? { ca: readFileSync(caFile) } : {}),
    },
  };
}
