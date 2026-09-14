import {
  Inject,
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { connect, MqttClient } from 'mqtt';
import { MetricsService } from '../metrics/metrics.service';
import { resolveMqttPublisherSettings } from './mqtt-publisher.config';
import {
  MqttPublisherReadiness,
  MqttPublisherReadinessReason,
  MqttPublisherTransport,
} from './mqtt-publisher.transport';

export type MqttClientFactory = (
  brokerUrl: string,
  options: Parameters<typeof connect>[1],
) => MqttClient;

export const MQTT_CLIENT_FACTORY = Symbol('MQTT_CLIENT_FACTORY');

const COMMAND_TOPIC_PATTERN = /^tenants\/[^/]+\/devices\/[^/]+\/commands$/;

type PublisherState =
  | 'unconfigured'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error'
  | 'stopping';

@Injectable()
export class MqttJsPublisherAdapter
  implements MqttPublisherTransport, OnModuleInit, OnApplicationShutdown
{
  private readonly logger = new Logger(MqttJsPublisherAdapter.name);
  private readonly settings;
  private readonly inFlightPublishes = new Set<Promise<void>>();
  private client?: MqttClient;
  private state: PublisherState = 'unconfigured';
  private shutdownPromise?: Promise<void>;

  constructor(
    configService: ConfigService,
    @Inject(MQTT_CLIENT_FACTORY)
    private readonly clientFactory: MqttClientFactory,
    @Optional() private readonly metrics?: MetricsService,
  ) {
    this.settings = resolveMqttPublisherSettings(configService);
  }

  onModuleInit(): void {
    if (!this.settings || this.client) {
      return;
    }

    this.transition('connecting');
    this.logger.log({
      event: 'mqtt.publisher.connecting',
      outcome: 'started',
    });

    const client = this.clientFactory(
      this.settings.brokerUrl,
      this.settings.clientOptions,
    );
    this.client = client;

    client.on('connect', () => {
      this.transition('connected');
      this.logger.log({
        event: 'mqtt.publisher.connected',
        outcome: 'succeeded',
      });
    });
    client.on('reconnect', () => {
      if (this.state !== 'stopping') {
        this.transition('connecting');
        this.metrics?.recordMqttPublisherReconnect();
        this.logger.warn({
          event: 'mqtt.publisher.reconnect_scheduled',
          outcome: 'scheduled',
        });
      }
    });
    client.on('offline', () => this.markDisconnected('offline'));
    client.on('close', () => this.markDisconnected('close'));
    client.on('error', (error) => {
      if (this.state === 'stopping') {
        return;
      }

      this.transition('error');
      this.logger.error({
        event: 'mqtt.publisher.error',
        outcome: 'failed',
        error: {
          name: error.name,
          code: (error as NodeJS.ErrnoException).code,
        },
      });
    });
  }

  getReadiness(): MqttPublisherReadiness {
    if (this.state === 'connected' && this.client?.connected) {
      return { ready: true };
    }

    return {
      ready: false,
      reason: this.readinessReason(),
    };
  }

  async publish(topic: string, message: unknown): Promise<void> {
    if (
      !COMMAND_TOPIC_PATTERN.test(topic) ||
      topic.includes('+') ||
      topic.includes('#')
    ) {
      this.metrics?.recordMqttPublisherPublish('rejected', 0);
      throw new Error('MQTT command topic is invalid');
    }

    if (
      !this.settings ||
      !this.client ||
      !this.client.connected ||
      this.state !== 'connected'
    ) {
      this.metrics?.recordMqttPublisherPublish('rejected', 0);
      throw new Error('MQTT publisher is not connected');
    }

    const startedAt = process.hrtime.bigint();
    const payload = JSON.stringify(message);
    const publishPromise = this.publishWithTimeout(topic, payload);
    this.inFlightPublishes.add(publishPromise);

    try {
      await publishPromise;
      const durationSeconds = this.elapsedSeconds(startedAt);
      this.metrics?.recordMqttPublisherPublish('confirmed', durationSeconds);
      this.logger.log({
        event: 'mqtt.publisher.publish_confirmed',
        outcome: 'confirmed',
        durationMs: Math.round(durationSeconds * 1000),
      });
    } catch (error) {
      const durationSeconds = this.elapsedSeconds(startedAt);
      const outcome =
        error instanceof Error && error.message === 'MQTT publish timed out'
          ? 'timeout'
          : 'failed';
      this.metrics?.recordMqttPublisherPublish(outcome, durationSeconds);
      this.logger.error({
        event: 'mqtt.publisher.publish_failed',
        outcome,
        error: {
          name: error instanceof Error ? error.name : 'Error',
        },
      });
      throw error;
    } finally {
      this.inFlightPublishes.delete(publishPromise);
    }
  }

  async shutdown(): Promise<void> {
    if (!this.shutdownPromise) {
      this.shutdownPromise = this.performShutdown();
    }

    return this.shutdownPromise;
  }

  async onApplicationShutdown(): Promise<void> {
    await this.shutdown();
  }

  private async publishWithTimeout(
    topic: string,
    payload: string,
  ): Promise<void> {
    const client = this.client!;
    const publish = client
      .publishAsync(topic, payload, {
        qos: 1,
        retain: false,
        properties: {
          messageExpiryInterval: this.settings!.commandExpirySeconds,
        },
      })
      .then(() => undefined);

    await this.withTimeout(
      publish,
      this.settings!.publishTimeoutMs,
      'MQTT publish timed out',
    );
  }

  private async performShutdown(): Promise<void> {
    if (this.state === 'stopping') {
      return;
    }

    this.transition('stopping');

    const pendingPublishes = [...this.inFlightPublishes];
    if (pendingPublishes.length > 0 && this.settings) {
      await this.withTimeout(
        Promise.allSettled(pendingPublishes).then(() => undefined),
        this.settings.shutdownTimeoutMs,
        'MQTT publisher drain timed out',
      ).catch(() => undefined);
    }

    const client = this.client;
    this.client = undefined;

    if (client) {
      try {
        await this.withTimeout(
          client.endAsync(false),
          this.settings?.shutdownTimeoutMs ?? 10_000,
          'MQTT publisher shutdown timed out',
        );
      } catch {
        await client.endAsync(true).catch(() => undefined);
      }
    }

    this.logger.log({
      event: 'mqtt.publisher.stopped',
      outcome: 'succeeded',
    });
  }

  private markDisconnected(source: 'offline' | 'close'): void {
    if (this.state === 'stopping') {
      return;
    }

    this.transition('disconnected');
    this.logger.warn({
      event: 'mqtt.publisher.disconnected',
      outcome: 'disconnected',
      source,
    });
  }

  private transition(state: PublisherState): void {
    this.state = state;
    if (state !== 'unconfigured') {
      this.metrics?.recordMqttPublisherState(state);
    }
  }

  private readinessReason(): MqttPublisherReadinessReason {
    switch (this.state) {
      case 'unconfigured':
        return 'publisher_not_configured';
      case 'connecting':
        return 'publisher_connecting';
      case 'error':
        return 'publisher_error';
      case 'stopping':
        return 'publisher_stopping';
      default:
        return 'publisher_disconnected';
    }
  }

  private elapsedSeconds(startedAt: bigint): number {
    return Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
  }

  private withTimeout<T>(
    operation: Promise<T>,
    timeoutMs: number,
    message: string,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(message)), timeoutMs);

      operation.then(
        (result) => {
          clearTimeout(timeout);
          resolve(result);
        },
        (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      );
    });
  }
}
