import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readRepositoryFile(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('Database Integration Test Foundation contract', () => {
  it('keeps database integration execution separate from unit and E2E tests', () => {
    const packageJson = JSON.parse(readRepositoryFile('package.json')) as {
      scripts: Record<string, string>;
    };
    const unitConfig = readRepositoryFile('jest.config.js');
    const integrationConfig = readRepositoryFile('test/jest-integration.json');

    expect(packageJson.scripts['test:integration:db']).toContain(
      'run-database-integration.ts',
    );
    expect(unitConfig).toContain('integration-spec');
    expect(integrationConfig).toContain('integration-spec');
    expect(integrationConfig).toContain('"maxWorkers": 1');
  });

  it('provisions a run-owned schema and always registers cleanup', () => {
    const lifecycle = readRepositoryFile(
      'test/support/database-test-environment.ts',
    );
    const runner = readRepositoryFile(
      'test/scripts/run-database-integration.ts',
    );

    expect(lifecycle).toContain('DROP SCHEMA IF EXISTS');
    expect(lifecycle).toContain('CREATE SCHEMA');
    expect(lifecycle).toContain('assertSafeSchemaName');
    expect(lifecycle).not.toContain('DROP DATABASE');
    expect(runner).toContain('finally');
    expect(runner).toContain('await lifecycle.cleanup()');
  });

  it('uses committed Prisma migrations instead of schema push', () => {
    const runner = readRepositoryFile(
      'test/scripts/run-database-integration.ts',
    );

    expect(runner).toContain("['prisma', 'migrate', 'deploy']");
    expect(runner).not.toContain('db push');
  });

  it('requires explicit safety opt-in and a bounded database target', () => {
    const lifecycle = readRepositoryFile(
      'test/support/database-test-environment.ts',
    );

    expect(lifecycle).toContain('DATABASE_INTEGRATION_TESTS_ALLOWED');
    expect(lifecycle).toContain("source.NODE_ENV !== 'test'");
    expect(lifecycle).toContain('LOOPBACK_HOSTS');
    expect(lifecycle).toContain('SYSTEM_DATABASES');
  });

  it('proves migration visibility, persistence, and transaction rollback', () => {
    const integrationTest = readRepositoryFile(
      'test/integration/database.integration-spec.ts',
    );

    expect(integrationTest).toContain('current_schema()');
    expect(integrationTest).toContain('systemMetadata.create');
    expect(integrationTest).toContain('prisma.$transaction');
    expect(integrationTest).toContain('resolves.toBeNull()');
  });

  it('runs the isolated database integration gate in CI', () => {
    const ci = readRepositoryFile('.github/workflows/ci.yml');

    expect(ci).toContain('TEST_DATABASE_URL:');
    expect(ci).toContain("DATABASE_INTEGRATION_TESTS_ALLOWED: 'true'");
    expect(ci).toContain('run: npm run test:integration:db');
  });

  it('documents schema ownership, migration, and cleanup rules', () => {
    const strategy = readRepositoryFile('docs/testing-strategy.md');

    expect(strategy).toContain('Database Integration Test Foundation');
    expect(strategy).toContain('run-owned PostgreSQL schema');
    expect(strategy).toContain('prisma migrate deploy');
    expect(strategy).toContain('DROP SCHEMA');
    expect(strategy).toContain('MQTT Workflow Integration Test Foundation');
  });
});
