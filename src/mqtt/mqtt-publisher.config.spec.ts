import { ConfigService } from '@nestjs/config';
import {
  createMqttPublisherClientId,
  resolveMqttPublisherSettings,
} from './mqtt-publisher.config';

describe('MQTT publisher configuration', () => {
  it('returns undefined when the publisher is not configured', () => {
    // Isolate from host .env leakage (MQTT_BROKER_URL etc.) so the
    // unconfigured path is deterministic in every environment.
    const previous = process.env.MQTT_BROKER_URL;
    delete process.env.MQTT_BROKER_URL;
    try {
      expect(resolveMqttPublisherSettings(new ConfigService({}))).toBeUndefined();
    } finally {
      if (previous !== undefined) {
        process.env.MQTT_BROKER_URL = previous;
      }
    }
  });

  it('creates bounded process-unique client identifiers', () => {
    const first = createMqttPublisherClientId(
      'iot-api',
      42,
      'Host Name',
      'aaaa',
    );
    const second = createMqttPublisherClientId(
      'iot-api',
      42,
      'Host Name',
      'bbbb',
    );

    expect(first).toBe('iot-api-host-name-42-aaaa');
    expect(second).not.toBe(first);
    expect(first.length).toBeLessThanOrEqual(96);
  });

  it('resolves verified MQTT 5 publisher settings', () => {
    const settings = resolveMqttPublisherSettings(
      new ConfigService({
        MQTT_BROKER_URL: 'mqtts://broker.example.com:8883',
        MQTT_CLIENT_ID_PREFIX: 'iot-api',
        MQTT_USERNAME: 'publisher',
        MQTT_PASSWORD: 'secret',
        MQTT_CONNECT_TIMEOUT_MS: 5000,
        MQTT_PUBLISH_TIMEOUT_MS: 4000,
        MQTT_KEEPALIVE_SECONDS: 45,
        MQTT_RECONNECT_PERIOD_MS: 3000,
        COMMAND_ACK_TIMEOUT_MS: 61_000,
      }),
    );

    expect(settings).toEqual(
      expect.objectContaining({
        brokerUrl: 'mqtts://broker.example.com:8883',
        connectTimeoutMs: 5000,
        publishTimeoutMs: 4000,
        commandExpirySeconds: 61,
      }),
    );
    expect(settings?.clientOptions).toEqual(
      expect.objectContaining({
        protocolVersion: 5,
        clean: true,
        username: 'publisher',
        password: 'secret',
        rejectUnauthorized: true,
        reconnectPeriod: 3000,
        keepalive: 45,
        queueQoSZero: false,
        resubscribe: false,
        properties: { sessionExpiryInterval: 0 },
      }),
    );
  });
});
