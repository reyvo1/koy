import { EventEmitter } from 'node:events';
import { ConfigService } from '@nestjs/config';
import { MqttClient } from 'mqtt';
import { MetricsService } from '../metrics/metrics.service';
import {
  MqttClientFactory,
  MqttJsPublisherAdapter,
} from './mqtt-js-publisher.adapter';

class TestMqttClient extends EventEmitter {
  connected = false;
  publishAsync = jest.fn<Promise<unknown>, any[]>();
  endAsync = jest.fn<Promise<void>, any[]>().mockResolvedValue(undefined);
}

function configuredValues(overrides: Record<string, unknown> = {}) {
  return {
    MQTT_BROKER_URL: 'mqtts://broker.example.com:8883',
    MQTT_CLIENT_ID_PREFIX: 'iot-api',
    MQTT_USERNAME: 'publisher',
    MQTT_PASSWORD: 'secret',
    MQTT_CONNECT_TIMEOUT_MS: 1000,
    MQTT_PUBLISH_TIMEOUT_MS: 1000,
    MQTT_KEEPALIVE_SECONDS: 30,
    MQTT_RECONNECT_PERIOD_MS: 1000,
    COMMAND_ACK_TIMEOUT_MS: 5000,
    ...overrides,
  };
}

describe('MqttJsPublisherAdapter', () => {
  let client: TestMqttClient;
  let factory: jest.MockedFunction<MqttClientFactory>;
  let metrics: jest.Mocked<MetricsService>;

  beforeEach(() => {
    client = new TestMqttClient();
    factory = jest.fn<MqttClient, Parameters<MqttClientFactory>>(
      () => client as unknown as MqttClient,
    );
    metrics = {
      recordMqttPublisherState: jest.fn(),
      recordMqttPublisherReconnect: jest.fn(),
      recordMqttPublisherPublish: jest.fn(),
    } as unknown as jest.Mocked<MetricsService>;
  });

  it('remains honestly unconfigured when no broker URL is provided', () => {
    // Isolate from host .env leakage so the unconfigured path is deterministic.
    const previous = process.env.MQTT_BROKER_URL;
    delete process.env.MQTT_BROKER_URL;
    try {
      const adapter = new MqttJsPublisherAdapter(
        new ConfigService({}),
        factory,
        metrics,
      );

      adapter.onModuleInit();

      expect(factory).not.toHaveBeenCalled();
      expect(adapter.getReadiness()).toEqual({
        ready: false,
        reason: 'publisher_not_configured',
      });
    } finally {
      if (previous !== undefined) {
        process.env.MQTT_BROKER_URL = previous;
      }
    }
  });

  it('connects once and reports real readiness transitions', () => {
    const adapter = new MqttJsPublisherAdapter(
      new ConfigService(configuredValues()),
      factory,
      metrics,
    );

    adapter.onModuleInit();
    adapter.onModuleInit();

    expect(factory).toHaveBeenCalledTimes(1);
    expect(adapter.getReadiness()).toEqual({
      ready: false,
      reason: 'publisher_connecting',
    });

    client.connected = true;
    client.emit('connect');
    expect(adapter.getReadiness()).toEqual({ ready: true });

    client.connected = false;
    client.emit('offline');
    expect(adapter.getReadiness()).toEqual({
      ready: false,
      reason: 'publisher_disconnected',
    });
  });

  it('rejects publishes while disconnected', async () => {
    const adapter = new MqttJsPublisherAdapter(
      new ConfigService(configuredValues()),
      factory,
      metrics,
    );
    adapter.onModuleInit();

    await expect(
      adapter.publish('tenants/t1/devices/d1/commands', { commandId: 'c1' }),
    ).rejects.toThrow('MQTT publisher is not connected');
    expect(client.publishAsync).not.toHaveBeenCalled();
  });

  it('publishes QoS 1 without retain and waits for broker confirmation', async () => {
    client.publishAsync.mockResolvedValue(undefined);
    const adapter = new MqttJsPublisherAdapter(
      new ConfigService(configuredValues()),
      factory,
      metrics,
    );
    adapter.onModuleInit();
    client.connected = true;
    client.emit('connect');

    await adapter.publish('tenants/t1/devices/d1/commands', {
      commandId: 'c1',
      payload: { power: true },
    });

    expect(client.publishAsync).toHaveBeenCalledWith(
      'tenants/t1/devices/d1/commands',
      JSON.stringify({ commandId: 'c1', payload: { power: true } }),
      {
        qos: 1,
        retain: false,
        properties: { messageExpiryInterval: 5 },
      },
    );
    expect(metrics.recordMqttPublisherPublish).toHaveBeenCalledWith(
      'confirmed',
      expect.any(Number),
    );
  });

  it('times out a broker confirmation without adding a retry', async () => {
    jest.useFakeTimers();
    client.publishAsync.mockReturnValue(new Promise(() => undefined));
    const adapter = new MqttJsPublisherAdapter(
      new ConfigService(configuredValues({ MQTT_PUBLISH_TIMEOUT_MS: 1000 })),
      factory,
      metrics,
    );
    adapter.onModuleInit();
    client.connected = true;
    client.emit('connect');

    const publish = adapter.publish('tenants/t1/devices/d1/commands', {
      commandId: 'c1',
    });
    const rejection = expect(publish).rejects.toThrow('MQTT publish timed out');

    await jest.advanceTimersByTimeAsync(1000);
    await rejection;
    expect(client.publishAsync).toHaveBeenCalledTimes(1);
    expect(metrics.recordMqttPublisherPublish).toHaveBeenCalledWith(
      'timeout',
      expect.any(Number),
    );
    jest.useRealTimers();
  });

  it('tracks reconnects and shuts down idempotently', async () => {
    const adapter = new MqttJsPublisherAdapter(
      new ConfigService(configuredValues()),
      factory,
      metrics,
    );
    adapter.onModuleInit();
    client.emit('reconnect');

    expect(metrics.recordMqttPublisherReconnect).toHaveBeenCalledTimes(1);
    expect(adapter.getReadiness()).toEqual({
      ready: false,
      reason: 'publisher_connecting',
    });

    await Promise.all([adapter.shutdown(), adapter.shutdown()]);

    expect(client.endAsync).toHaveBeenCalledTimes(1);
    expect(adapter.getReadiness()).toEqual({
      ready: false,
      reason: 'publisher_stopping',
    });
  });
});
