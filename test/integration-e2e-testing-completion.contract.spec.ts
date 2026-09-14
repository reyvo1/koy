import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readRepositoryFile(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

function expectOrderedMarkers(content: string, markers: string[]): void {
  let previousIndex = -1;

  for (const marker of markers) {
    const index = content.indexOf(marker);
    expect(index).toBeGreaterThan(previousIndex);
    previousIndex = index;
  }
}

describe('Integration and End-to-End Testing Completion Review contract', () => {
  it('keeps the unit, E2E, database, and MQTT layers separated', () => {
    const packageJson = JSON.parse(readRepositoryFile('package.json')) as {
      scripts: Record<string, string>;
      engines: Record<string, string>;
      packageManager: string;
    };
    const unitConfig = readRepositoryFile('jest.config.js');
    const e2eConfig = readRepositoryFile('test/jest-e2e.json');
    const databaseConfig = readRepositoryFile('test/jest-integration.json');
    const mqttConfig = readRepositoryFile('test/jest-mqtt-integration.json');

    expect(packageJson.scripts.test).toBe('jest');
    expect(packageJson.scripts['test:e2e']).toContain('jest-e2e.json');
    expect(packageJson.scripts['test:integration:db']).toContain(
      'run-database-integration.ts',
    );
    expect(packageJson.scripts['test:integration:mqtt']).toContain(
      'run-mqtt-integration.ts',
    );
    expect(unitConfig).toContain('e2e-spec');
    expect(unitConfig).toContain('integration-spec');
    expect(unitConfig).toContain('mqtt-integration-spec');
    expect(e2eConfig).toContain('e2e-spec');
    expect(databaseConfig).toContain('integration-spec');
    expect(mqttConfig).toContain('mqtt-integration-spec');
    expect(databaseConfig).toContain('"maxWorkers": 1');
    expect(mqttConfig).toContain('"maxWorkers": 1');
    expect(packageJson.engines.node).toBe('>=22 <23');
    expect(packageJson.packageManager).toContain('npm@10.9.8');
  });

  it('shares production validation and error configuration with Fastify E2E', () => {
    const runtime = readRepositoryFile('src/bootstrap/production-runtime.ts');
    const testApplication = readRepositoryFile(
      'test/support/create-test-application.ts',
    );
    const sharedConfiguration = readRepositoryFile(
      'src/bootstrap/configure-application.ts',
    );
    const smoke = readRepositoryFile('test/application.smoke.e2e-spec.ts');

    expect(runtime).toContain('configureApplication(app');
    expect(testApplication).toContain('configureApplication(app');
    expect(sharedConfiguration).toContain('createValidationException');
    expect(sharedConfiguration).toContain('GlobalExceptionFilter');
    expect(smoke).toContain('app.inject');
    expect(smoke).not.toContain('app.listen');
    expect(smoke).toContain("path: '/test/validation'");
  });

  it('preserves run-owned PostgreSQL migration and cleanup boundaries', () => {
    const names = readRepositoryFile('test/support/test-resource-names.ts');
    const lifecycle = readRepositoryFile(
      'test/support/database-test-environment.ts',
    );
    const runner = readRepositoryFile(
      'test/scripts/run-database-integration.ts',
    );
    const proof = readRepositoryFile(
      'test/integration/database.integration-spec.ts',
    );

    expect(names).toContain('postgresSchema: `test_${postgresId}`');
    expect(lifecycle).toContain('CREATE SCHEMA');
    expect(lifecycle).toContain('DROP SCHEMA IF EXISTS');
    expect(lifecycle).not.toContain('DROP DATABASE');
    expect(runner).toContain("['prisma', 'migrate', 'deploy']");
    expect(runner).toContain('finally');
    expect(proof).toContain('current_schema()');
    expect(proof).toContain('prisma.$transaction');
  });

  it('preserves run-owned MQTT topics and deterministic teardown', () => {
    const names = readRepositoryFile('test/support/test-resource-names.ts');
    const environment = readRepositoryFile(
      'test/support/mqtt-test-environment.ts',
    );
    const client = readRepositoryFile('test/support/mqtt-test-client.ts');
    const runner = readRepositoryFile('test/scripts/run-mqtt-integration.ts');

    expect(names).toContain('mqttTopicPrefix: `tests/${runId}`');
    expect(environment).toContain("server.listen(0, '127.0.0.1')");
    expect(environment).toContain('assertOwnedMqttTopic');
    expect(client).toContain('retain: false');
    expect(client).toContain('reconnectPeriod: 0');
    expect(client).toContain('client.end(false, {}, finish)');
    expect(client).toContain('client.end(true, {}, finish)');
    expect(runner).toContain('finally');
    expect(runner).toContain('await brokerLifecycle.cleanup()');
    expect(runner).toContain('await databaseLifecycle.cleanup()');
  });

  it('retains telemetry persistence and command acknowledgement workflow proofs', () => {
    const mqttProof = readRepositoryFile(
      'test/integration/mqtt.workflow.mqtt-integration-spec.ts',
    );

    expect(mqttProof).toContain('/mqtt/webhook/telemetry');
    expect(mqttProof).toContain('prisma.telemetry.findUnique');
    expect(mqttProof).toContain('/mqtt/ack');
    expect(mqttProof).toContain('CommandStatus.ACKNOWLEDGED');
    expect(mqttProof).toContain("overrideProvider('REDIS_CLIENT')");
    expect(mqttProof).toContain('`${topicPrefix}/tenants/');
    expect(mqttProof).not.toContain("publisher.publish('tenants/");
  });

  it('keeps CI execution ordered and explicitly opts into isolated infrastructure', () => {
    const ci = readRepositoryFile('.github/workflows/ci.yml');

    expect(ci).toContain("node-version-file: '.nvmrc'");
    expect(ci).toContain("DATABASE_INTEGRATION_TESTS_ALLOWED: 'true'");
    expect(ci).toContain("MQTT_INTEGRATION_TESTS_ALLOWED: 'true'");
    expectOrderedMarkers(ci, [
      'run: bash ops/scripts/ci-bootstrap-dependencies.sh',
      'run: node node_modules/prisma/build/index.js validate',
      'run: node node_modules/prisma/build/index.js migrate deploy',
      'run: npm run build',
      'run: npm test -- --runInBand',
      'run: npm run test:e2e',
      'run: npm run test:integration:db',
      'run: npm run test:integration:mqtt',
      'run: npm run test:cov',
    ]);
  });

  it('keeps the production publisher isolated from existing workflow integration', () => {
    const mqttService = readRepositoryFile('src/mqtt/mqtt.service.ts');
    const adapter = readRepositoryFile('src/mqtt/mqtt-js-publisher.adapter.ts');
    const strategy = readRepositoryFile('docs/testing-strategy.md');

    expect(mqttService).toContain(
      'this.publisherTransport.publish(topic, message)',
    );
    expect(adapter).toContain('MqttPublisherTransport');
    expect(strategy).toContain(
      'The existing webhook workflow remains isolated from the production publisher',
    );
  });

  it('preserves the completed testing milestone independently of active module', () => {
    const strategy = readRepositoryFile('docs/testing-strategy.md');

    expect(strategy).toContain(
      'The Integration and End-to-End Testing workstream is complete',
    );
    expect(strategy).toContain(
      'Production Readiness Completion Review local gates passed',
    );
  });
});
