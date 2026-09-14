import {
  assertSafeSchemaName,
  resolveDatabaseIntegrationEnvironment,
} from './database-test-environment';

describe('database test environment', () => {
  const baseEnvironment: NodeJS.ProcessEnv = {
    NODE_ENV: 'test',
    DATABASE_INTEGRATION_TESTS_ALLOWED: 'true',
    TEST_DATABASE_URL:
      'postgresql://postgres:postgres@localhost:5432/iot_platform?connection_limit=2',
    TEST_RUN_ID: 'ci-123-2',
  };

  it('builds isolated admin and run-owned schema URLs', () => {
    const environment = resolveDatabaseIntegrationEnvironment(baseEnvironment);

    expect(environment.runId).toBe('ci-123-2');
    expect(environment.schema).toBe('test_ci_123_2');
    expect(
      new URL(environment.adminDatabaseUrl).searchParams.get('schema'),
    ).toBe('public');
    expect(new URL(environment.databaseUrl).searchParams.get('schema')).toBe(
      'test_ci_123_2',
    );
    expect(
      new URL(environment.databaseUrl).searchParams.get('connection_limit'),
    ).toBe('2');
  });

  it('requires an explicit destructive-test opt in', () => {
    expect(() =>
      resolveDatabaseIntegrationEnvironment({
        ...baseEnvironment,
        DATABASE_INTEGRATION_TESTS_ALLOWED: 'false',
      }),
    ).toThrow('DATABASE_INTEGRATION_TESTS_ALLOWED=true');
  });

  it('requires test mode', () => {
    expect(() =>
      resolveDatabaseIntegrationEnvironment({
        ...baseEnvironment,
        NODE_ENV: 'development',
      }),
    ).toThrow('NODE_ENV=test');
  });

  it('rejects remote local-run database hosts', () => {
    expect(() =>
      resolveDatabaseIntegrationEnvironment({
        ...baseEnvironment,
        TEST_DATABASE_URL:
          'postgresql://postgres:postgres@database.example.com:5432/iot_platform',
      }),
    ).toThrow('loopback PostgreSQL host');
  });

  it('rejects PostgreSQL system databases', () => {
    expect(() =>
      resolveDatabaseIntegrationEnvironment({
        ...baseEnvironment,
        TEST_DATABASE_URL:
          'postgresql://postgres:postgres@localhost:5432/postgres',
      }),
    ).toThrow('non-system database');
  });

  it('rejects unsafe schema identifiers', () => {
    expect(() => assertSafeSchemaName('public')).toThrow(
      'Unsafe database integration schema',
    );
    expect(() => assertSafeSchemaName('test_safe_schema')).not.toThrow();
  });
});
