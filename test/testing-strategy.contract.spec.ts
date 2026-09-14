import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readRepositoryFile(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('Testing Strategy Foundation contract', () => {
  it('keeps unit and E2E execution separated', () => {
    const packageJson = JSON.parse(readRepositoryFile('package.json')) as {
      scripts: Record<string, string>;
    };
    const unitConfig = readRepositoryFile('jest.config.js');
    const e2eConfig = readRepositoryFile('test/jest-e2e.json');

    expect(packageJson.scripts['test:e2e']).toContain(
      'jest --config ./test/jest-e2e.json',
    );
    expect(unitConfig).toContain('testPathIgnorePatterns');
    expect(unitConfig).toContain('e2e-spec');
    expect(e2eConfig).toContain('testRegex');
    expect(e2eConfig).toContain('e2e-spec');
    expect(e2eConfig).toContain('\"maxWorkers\": 1');
  });

  it('uses the shared production application configuration for E2E bootstrap', () => {
    const runtimeSource = readRepositoryFile(
      'src/bootstrap/production-runtime.ts',
    );
    const testBootstrap = readRepositoryFile(
      'test/support/create-test-application.ts',
    );
    const sharedConfiguration = readRepositoryFile(
      'src/bootstrap/configure-application.ts',
    );

    expect(runtimeSource).toContain('configureApplication(app');
    expect(testBootstrap).toContain('configureApplication(app');
    expect(sharedConfiguration).toContain(
      'app.useGlobalFilters(new GlobalExceptionFilter())',
    );
    expect(sharedConfiguration).toContain(
      'exceptionFactory: createValidationException',
    );
  });

  it('keeps the E2E smoke test hermetic and Fastify-native', () => {
    const smokeTest = readRepositoryFile('test/application.smoke.e2e-spec.ts');

    expect(smokeTest).toContain('app.inject');
    expect(smokeTest).not.toContain('app.listen');
    expect(smokeTest).not.toContain('PrismaService');
    expect(smokeTest).not.toContain('REDIS_CLIENT');
    expect(smokeTest).not.toContain('MqttService');
  });

  it('defines bounded isolation namespaces for external test resources', () => {
    const resources = readRepositoryFile('test/support/test-resource-names.ts');

    expect(resources).toContain('postgresSchema: `test_${postgresId}`');
    expect(resources).toContain('redisKeyPrefix: `iot:test:${runId}:`');
    expect(resources).toContain('mqttTopicPrefix: `tests/${runId}`');
    expect(resources).toContain('MAX_RUN_ID_LENGTH = 40');
  });

  it('runs the E2E smoke gate in CI with a unique test run id', () => {
    const ci = readRepositoryFile('.github/workflows/ci.yml');

    expect(ci).toContain(
      'TEST_RUN_ID: ci-${{ github.run_id }}-${{ github.run_attempt }}',
    );
    expect(ci).toContain('run: npm run test:e2e');
  });

  it('documents deterministic PostgreSQL, Redis, and MQTT cleanup boundaries', () => {
    const strategy = readRepositoryFile('docs/testing-strategy.md');

    expect(strategy).toContain('## PostgreSQL Isolation');
    expect(strategy).toContain('## Redis Isolation');
    expect(strategy).toContain('## MQTT Isolation');
    expect(strategy).toContain('Never use `FLUSHALL` or `FLUSHDB`');
    expect(strategy).toContain('retained messages');
  });
});
