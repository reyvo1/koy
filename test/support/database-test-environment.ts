import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { createTestResourceNames } from './test-resource-names';

const SAFE_SCHEMA_PATTERN = /^test_[a-z0-9_]{1,55}$/;
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const SYSTEM_DATABASES = new Set(['postgres', 'template0', 'template1']);

export interface DatabaseIntegrationEnvironment {
  adminDatabaseUrl: string;
  databaseUrl: string;
  schema: string;
  runId: string;
}

export function resolveDatabaseIntegrationEnvironment(
  source: NodeJS.ProcessEnv = process.env,
): DatabaseIntegrationEnvironment {
  if (source.NODE_ENV !== 'test') {
    throw new Error('Database integration tests require NODE_ENV=test');
  }

  if (source.DATABASE_INTEGRATION_TESTS_ALLOWED !== 'true') {
    throw new Error(
      'Database integration tests require DATABASE_INTEGRATION_TESTS_ALLOWED=true',
    );
  }

  const baseUrl =
    source.TEST_DATABASE_URL ??
    source.DATABASE_URL ??
    readDotEnvValue('TEST_DATABASE_URL') ??
    readDotEnvValue('DATABASE_URL');

  if (!baseUrl) {
    throw new Error(
      'Database integration tests require TEST_DATABASE_URL or DATABASE_URL',
    );
  }

  const parsed = parsePostgresUrl(baseUrl);
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));

  if (!databaseName || SYSTEM_DATABASES.has(databaseName)) {
    throw new Error('Database integration tests require a non-system database');
  }

  if (source.CI !== 'true' && !LOOPBACK_HOSTS.has(parsed.hostname)) {
    throw new Error(
      'Local database integration tests require a loopback PostgreSQL host',
    );
  }

  const resources = createTestResourceNames(source.TEST_RUN_ID);
  assertSafeSchemaName(resources.postgresSchema);

  const adminUrl = new URL(parsed.toString());
  adminUrl.searchParams.set('schema', 'public');

  const databaseUrl = new URL(parsed.toString());
  databaseUrl.searchParams.set('schema', resources.postgresSchema);

  return {
    adminDatabaseUrl: adminUrl.toString(),
    databaseUrl: databaseUrl.toString(),
    schema: resources.postgresSchema,
    runId: resources.runId,
  };
}

export function assertSafeSchemaName(schema: string): void {
  if (!SAFE_SCHEMA_PATTERN.test(schema)) {
    throw new Error(`Unsafe database integration schema: ${schema}`);
  }
}

export class DatabaseTestLifecycle {
  private readonly adminClient: PrismaClient;

  constructor(private readonly environment: DatabaseIntegrationEnvironment) {
    this.adminClient = new PrismaClient({
      datasources: {
        db: {
          url: environment.adminDatabaseUrl,
        },
      },
    });
  }

  async provision(): Promise<void> {
    await this.adminClient.$connect();
    await this.dropSchema();
    await this.adminClient.$executeRawUnsafe(
      `CREATE SCHEMA ${quoteSchema(this.environment.schema)}`,
    );
  }

  async cleanup(): Promise<void> {
    try {
      await this.adminClient.$connect();
      await this.dropSchema();
    } finally {
      await this.adminClient.$disconnect();
    }
  }

  private async dropSchema(): Promise<void> {
    await this.adminClient.$executeRawUnsafe(
      `DROP SCHEMA IF EXISTS ${quoteSchema(this.environment.schema)} CASCADE`,
    );
  }
}

function parsePostgresUrl(value: string): URL {
  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch {
    throw new Error('Database integration URL is not a valid URL');
  }

  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    throw new Error('Database integration URL must use PostgreSQL');
  }

  return parsed;
}

function quoteSchema(schema: string): string {
  assertSafeSchemaName(schema);
  return `"${schema}"`;
}

function readDotEnvValue(key: string): string | undefined {
  try {
    const content = readFileSync(resolve(process.cwd(), '.env'), 'utf8');

    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();

      if (!line || line.startsWith('#')) {
        continue;
      }

      const separatorIndex = line.indexOf('=');
      if (separatorIndex < 1 || line.slice(0, separatorIndex).trim() !== key) {
        continue;
      }

      const value = line.slice(separatorIndex + 1).trim();
      return stripMatchingQuotes(value);
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function stripMatchingQuotes(value: string): string {
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    return value.slice(1, -1);
  }

  return value;
}
