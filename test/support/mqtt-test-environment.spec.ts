import {
  assertOwnedMqttTopic,
  assertSafeMqttTopicPrefix,
  createMqttTestClientId,
  MqttTestBrokerLifecycle,
  resolveMqttIntegrationEnvironment,
} from './mqtt-test-environment';
import {
  closeMqttTestClient,
  connectMqttTestClient,
  publishMqttTestMessage,
  subscribeMqttTestClient,
  waitForMqttMessage,
} from './mqtt-test-client';

describe('MQTT integration test environment', () => {
  jest.setTimeout(30_000);

  it('requires explicit test-mode opt-in', () => {
    expect(() =>
      resolveMqttIntegrationEnvironment({
        NODE_ENV: 'development',
        MQTT_INTEGRATION_TESTS_ALLOWED: 'true',
      }),
    ).toThrow('NODE_ENV=test');

    expect(() =>
      resolveMqttIntegrationEnvironment({
        NODE_ENV: 'test',
      }),
    ).toThrow('MQTT_INTEGRATION_TESTS_ALLOWED=true');
  });

  it('derives a bounded run-owned topic prefix', () => {
    expect(
      resolveMqttIntegrationEnvironment({
        NODE_ENV: 'test',
        MQTT_INTEGRATION_TESTS_ALLOWED: 'true',
        TEST_RUN_ID: 'CI-987-2',
      }),
    ).toEqual({
      runId: 'ci-987-2',
      topicPrefix: 'tests/ci-987-2',
    });
  });

  it('rejects unsafe prefixes and topics outside the run namespace', () => {
    expect(() => assertSafeMqttTopicPrefix('tenants/production')).toThrow(
      'Unsafe MQTT integration topic prefix',
    );
    expect(() =>
      assertOwnedMqttTopic(
        'tenants/tenant-a/devices/device-a/telemetry',
        'tests/local-1',
      ),
    ).toThrow('outside the run namespace');
  });

  it('accepts only topics below the approved namespace', () => {
    expect(() =>
      assertOwnedMqttTopic(
        'tests/local-1/tenants/tenant-a/devices/device-a/telemetry',
        'tests/local-1',
      ),
    ).not.toThrow();
  });

  it('creates unique bounded client identifiers', () => {
    expect(createMqttTestClientId('ci-987-2', 'bridge', 321)).toBe(
      'iot-test-ci-987-2-bridge-321',
    );
    expect(() => createMqttTestClientId('ci-987-2', 'bad role', 321)).toThrow(
      'Unsafe MQTT integration client role',
    );
  });

  it('starts and cleans up a runner-owned loopback broker', async () => {
    const lifecycle = new MqttTestBrokerLifecycle();

    try {
      const broker = await lifecycle.start();

      expect(broker.host).toBe('127.0.0.1');
      expect(broker.port).toBeGreaterThan(0);
      expect(broker.url).toBe(`mqtt://127.0.0.1:${broker.port}`);
    } finally {
      await lifecycle.cleanup();
    }
  });
  it('round-trips and closes clients against the runner-owned broker', async () => {
    const lifecycle = new MqttTestBrokerLifecycle();
    const topicPrefix = 'tests/local-broker-proof';
    let publisher;
    let subscriber;

    try {
      const broker = await lifecycle.start();
      publisher = await connectMqttTestClient(
        broker.url,
        createMqttTestClientId('local-broker-proof', 'publisher', 101),
      );
      subscriber = await connectMqttTestClient(
        broker.url,
        createMqttTestClientId('local-broker-proof', 'subscriber', 102),
      );
      const topic = `${topicPrefix}/smoke/round-trip`;

      await subscribeMqttTestClient(subscriber, `${topicPrefix}/smoke/#`);
      const received = waitForMqttMessage(
        subscriber,
        (receivedTopic) => receivedTopic === topic,
      );

      await publishMqttTestMessage(publisher, topic, topicPrefix, { ok: true });

      await expect(received).resolves.toMatchObject({ topic });
    } finally {
      await Promise.all([
        closeMqttTestClient(subscriber),
        closeMqttTestClient(publisher),
      ]);
      await lifecycle.cleanup();
    }
  });
});
