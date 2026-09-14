import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';


interface DatabaseClient {
  $connect(): Promise<void>;
  $disconnect(): Promise<void>;
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
}

type PrismaClientConstructor = new (options: {
  datasources: { db: { url: string } };
}) => DatabaseClient;

function createDatabaseClient(url: string): DatabaseClient {
  const prismaModule = require('@prisma/client') as {
    PrismaClient?: PrismaClientConstructor;
  };
  if (typeof prismaModule.PrismaClient !== 'function') {
    throw new Error(
      'Generated PrismaClient is unavailable; run prisma generate before the recovery drill',
    );
  }
  return new prismaModule.PrismaClient({
    datasources: {
      db: {
        url,
      },
    },
  });
}

function assertSafety(): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('Recovery drill requires NODE_ENV=test');
  }
  if (process.env.RECOVERY_DRILL_TESTS_ALLOWED !== 'true') {
    throw new Error(
      'Recovery drill requires RECOVERY_DRILL_TESTS_ALLOWED=true',
    );
  }
}

function canRun(command: string): boolean {
  const result = spawnSync(command, ['--version'], {
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
  });
  return result.status === 0;
}

function resolvePostgresTool(name: string): string {
  const executable = process.platform === 'win32' ? `${name}.exe` : name;
  const configured = process.env.PG_BIN_DIR
    ? resolve(process.env.PG_BIN_DIR, executable)
    : undefined;
  if (configured && existsSync(configured)) {
    return configured;
  }
  if (canRun(executable)) {
    return executable;
  }
  if (process.platform === 'win32') {
    const root = 'C:\\Program Files\\PostgreSQL';
    if (existsSync(root)) {
      const versions = readdirSync(root, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort((left, right) =>
          right.localeCompare(left, undefined, { numeric: true }),
        );
      for (const version of versions) {
        const candidate = join(root, version, 'bin', executable);
        if (existsSync(candidate)) {
          return candidate;
        }
      }
    }
  }
  throw new Error(`${name} is required for the PostgreSQL recovery drill`);
}

function resolvePrismaCli(repositoryRoot: string): string {
  const candidate = resolve(
    repositoryRoot,
    'node_modules',
    'prisma',
    'build',
    'index.js',
  );
  if (!existsSync(candidate)) {
    throw new Error(`Prisma CLI entrypoint was not found: ${candidate}`);
  }
  return candidate;
}

function run(command: string, args: string[], env = process.env): string {
  const result = spawnSync(command, args, {
    cwd: resolve(__dirname, '../..'),
    env,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    maxBuffer: 20 * 1024 * 1024,
    timeout: 180_000,
  });
  if (result.error) {
    throw new Error(
      `${basename(command)} could not start: ${result.error.message}`,
    );
  }
  if (result.status !== 0) {
    const exitDescription =
      result.status === null
        ? `signal ${result.signal ?? 'unknown'}`
        : `exit code ${result.status}`;
    throw new Error(
      `${basename(command)} failed with ${exitDescription}\n${result.stdout ?? ''}\n${result.stderr ?? ''}`,
    );
  }
  return result.stdout ?? '';
}

function databaseUrl(baseUrl: string, database: string): string {
  const url = new URL(baseUrl);
  url.pathname = `/${database}`;
  url.search = '';
  url.hash = '';
  return url.toString();
}

async function useDatabase<T>(
  url: string,
  operation: (client: DatabaseClient) => Promise<T>,
): Promise<T> {
  const client = createDatabaseClient(url);
  try {
    await client.$connect();
    return await operation(client);
  } finally {
    await client.$disconnect();
  }
}

async function createAndVerifySourceMarker(sourceUrl: string): Promise<void> {
  await useDatabase(sourceUrl, async (client) => {
    await client.$executeRawUnsafe(
      'CREATE TABLE recovery_drill_marker (id integer PRIMARY KEY, value text NOT NULL)',
    );
    await client.$executeRawUnsafe(
      "INSERT INTO recovery_drill_marker (id, value) VALUES (1, 'verified')",
    );
    const rows = await client.$queryRawUnsafe<Array<{ value: string }>>(
      'SELECT value FROM recovery_drill_marker WHERE id = 1',
    );
    if (rows[0]?.value !== 'verified') {
      throw new Error('Source recovery marker could not be verified before dump');
    }
  });
}

async function verifyRestoredDatabase(
  targetUrl: string,
): Promise<{ migrations: number; marker: string }> {
  return useDatabase(targetUrl, async (client) => {
    const markerRows = await client.$queryRawUnsafe<Array<{ value: string }>>(
      'SELECT value FROM recovery_drill_marker WHERE id = 1',
    );
    const migrationRows = await client.$queryRawUnsafe<Array<{ count: bigint }>>(
      'SELECT COUNT(*)::bigint AS count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL',
    );
    return {
      marker: markerRows[0]?.value ?? '',
      migrations: Number(migrationRows[0]?.count ?? 0n),
    };
  });
}

async function main(): Promise<void> {
  assertSafety();
  const baseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!baseUrl) {
    throw new Error('TEST_DATABASE_URL or DATABASE_URL is required');
  }

  const repositoryRoot = resolve(__dirname, '../..');
  const prismaCli = resolvePrismaCli(repositoryRoot);
  const runId = (process.env.TEST_RUN_ID ?? `local-${process.pid}`)
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .slice(0, 24);
  const sourceDatabase = `iot_recovery_src_${runId}`.slice(0, 63);
  const targetDatabase = `iot_recovery_dst_${runId}`.slice(0, 63);
  const maintenanceUrl = databaseUrl(baseUrl, 'postgres');
  const sourceUrl = databaseUrl(baseUrl, sourceDatabase);
  const targetUrl = databaseUrl(baseUrl, targetDatabase);
  const createdb = resolvePostgresTool('createdb');
  const dropdb = resolvePostgresTool('dropdb');
  const pgDump = resolvePostgresTool('pg_dump');
  const pgRestore = resolvePostgresTool('pg_restore');
  const workingDirectory = mkdtempSync(join(tmpdir(), 'iot-recovery-drill-'));
  const archive = join(workingDirectory, 'recovery.dump');

  const drop = (database: string): void => {
    const result = spawnSync(
      dropdb,
      [
        '--if-exists',
        '--force',
        `--maintenance-db=${maintenanceUrl}`,
        database,
      ],
      {
        encoding: 'utf8',
        shell: false,
        windowsHide: true,
        timeout: 30_000,
      },
    );
    if (result.status !== 0) {
      console.error(result.stderr);
    }
  };

  console.log(
    `Provisioning recovery drill databases ${sourceDatabase} and ${targetDatabase}...`,
  );
  try {
    drop(sourceDatabase);
    drop(targetDatabase);
    run(createdb, [`--maintenance-db=${maintenanceUrl}`, sourceDatabase]);
    run(createdb, [`--maintenance-db=${maintenanceUrl}`, targetDatabase]);

    run(process.execPath, [prismaCli, 'migrate', 'deploy'], {
      ...process.env,
      DATABASE_URL: sourceUrl,
    });
    await createAndVerifySourceMarker(sourceUrl);
    run(pgDump, [
      `--dbname=${sourceUrl}`,
      '--format=custom',
      '--no-owner',
      '--no-privileges',
      `--file=${archive}`,
    ]);
    run(pgRestore, ['--list', archive]);
    run(pgRestore, [
      '--no-owner',
      '--no-privileges',
      '--single-transaction',
      `--dbname=${targetUrl}`,
      archive,
    ]);

    const restored = await verifyRestoredDatabase(targetUrl);
    if (restored.marker !== 'verified') {
      throw new Error(`Recovery marker mismatch: ${restored.marker}`);
    }
    if (restored.migrations < 13) {
      throw new Error(
        `Expected at least 13 applied migrations, received ${restored.migrations}`,
      );
    }
    console.log(
      `Recovery drill passed with ${restored.migrations} applied migrations and verified data.`,
    );
  } finally {
    drop(sourceDatabase);
    drop(targetDatabase);
    rmSync(workingDirectory, { recursive: true, force: true });
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
