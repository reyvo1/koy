import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readRepositoryFile(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('MQTT Workflow Integration Test Foundation contract', () => {
  it('keeps MQTT integration execution separate and broker-backed', () => {
    const packageJson = JSON.parse(readRepositoryFile('package.json')) as {
      scripts: Record<string, string>;
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    const unitConfig = readRepositoryFile('jest.config.js');
    const mqttConfig = readRepositoryFile('test/jest-mqtt-integration.json');

    expect(packageJson.scripts['test:integration:mqtt']).toContain(
      'run-mqtt-integration.ts',
    );
    expect(packageJson.devDependencies.aedes).toBe('1.1.1');
    expect(packageJson.dependencies.mqtt).toBe('5.15.2');
    expect(unitConfig).toContain('integration-spec');
    expect(mqttConfig).toContain('mqtt-integration-spec');
    expect(mqttConfig).toContain('"maxWorkers": 1');
  });

  it('owns the broker and database lifecycle from a finally path', () => {
    const runner = readRepositoryFile('test/scripts/run-mqtt-integration.ts');

    expect(runner).toContain('new MqttTestBrokerLifecycle()');
    expect(runner).toContain('new DatabaseTestLifecycle(');
    expect(runner).toContain('finally');
    expect(runner).toContain('await brokerLifecycle.cleanup()');
    expect(runner).toContain('await databaseLifecycle.cleanup()');
    expect(runner).toContain("require.resolve('prisma')");
    expect(runner).toContain("require.resolve('jest/bin/jest')");
    expect(runner).not.toContain('npx.cmd');
    expect(runner).toContain('CHILD_PROCESS_TIMEOUT_MS');
    expect(runner).toContain('TEST_RUN_ID: mqttEnvironment.runId');
    expect(runner).toContain('JWT_SECRET: MQTT_INTEGRATION_JWT_SECRET');
  });

  it('requires explicit opt-in and run-owned MQTT topics', () => {
    const environment = readRepositoryFile(
      'test/support/mqtt-test-environment.ts',
    );

    expect(environment).toContain('MQTT_INTEGRATION_TESTS_ALLOWED');
    expect(environment).toContain("source.NODE_ENV !== 'test'");
    expect(environment).toContain('tests\\/');
    expect(environment).toContain('assertOwnedMqttTopic');
    expect(environment).toContain("server.listen(0, '127.0.0.1')");
  });

  it('uses non-retained messages and deterministic client teardown', () => {
    const client = readRepositoryFile('test/support/mqtt-test-client.ts');

    expect(client).toContain('retain: false');
    expect(client).toContain('reconnectPeriod: 0');
    expect(client).toContain('Timed out waiting for MQTT test message');
    expect(client).toContain('client.end(false, {}, finish)');
    expect(client).toContain('client.end(true, {}, finish)');
    expect(client).toContain('CLIENT_CLOSE_TIMEOUT_MS');
  });

  it('proves broker round-trip, telemetry persistence, and command acknowledgement', () => {
    const integrationTest = readRepositoryFile(
      'test/integration/mqtt.workflow.mqtt-integration-spec.ts',
    );

    expect(integrationTest).toContain('mqtt-broker-round-trip');
    expect(integrationTest).toContain('/mqtt/webhook/telemetry');
    expect(integrationTest).toContain('/mqtt/ack');
    expect(integrationTest).toContain('prisma.telemetry.findUnique');
    expect(integrationTest).toContain('CommandStatus.ACKNOWLEDGED');
    expect(integrationTest).toContain("overrideProvider('REDIS_CLIENT')");
    expect(integrationTest).toContain("dataType: 'number'");
    expect(integrationTest).toContain('`${topicPrefix}/tenants/');
    expect(integrationTest).not.toContain("publisher.publish('tenants/");
  });

  it('runs the MQTT workflow gate in CI with explicit safety opt-in', () => {
    const ci = readRepositoryFile('.github/workflows/ci.yml');

    expect(ci).toContain("MQTT_INTEGRATION_TESTS_ALLOWED: 'true'");
    expect(ci).toContain('run: npm run test:integration:mqtt');
    expect(ci).toContain("node-version-file: '.nvmrc'");
  });

  it('documents runner ownership, namespace isolation, and production boundaries', () => {
    const strategy = readRepositoryFile('docs/testing-strategy.md');

    expect(strategy).toContain('MQTT Workflow Integration Test Foundation');
    expect(strategy).toContain('runner-owned MQTT broker');
    expect(strategy).toContain('broker-to-webhook');
    expect(strategy).toContain(
      'Production `MqttService.publish()` delegates to the verified-TLS adapter',
    );
    expect(strategy).toContain(
      'Integration and End-to-End Testing Completion Review',
    );
  });
});
