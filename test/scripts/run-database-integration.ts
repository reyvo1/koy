import { spawnSync } from 'node:child_process';
import {
  DatabaseTestLifecycle,
  resolveDatabaseIntegrationEnvironment,
} from '../support/database-test-environment';

const PRISMA_MIGRATE_DEPLOY_COMMAND = ['prisma', 'migrate', 'deploy'] as const;
const JEST_INTEGRATION_COMMAND = [
  'jest',
  '--config',
  './test/jest-integration.json',
  '--runInBand',
] as const;

async function main(): Promise<void> {
  const environment = resolveDatabaseIntegrationEnvironment(process.env);
  const lifecycle = new DatabaseTestLifecycle(environment);

  console.log(
    `Provisioning isolated PostgreSQL schema ${environment.schema} for ${environment.runId}...`,
  );

  let failure: unknown;

  try {
    await lifecycle.provision();

    runNodeCli(
      require.resolve('prisma'),
      PRISMA_MIGRATE_DEPLOY_COMMAND.slice(1),
      {
        DATABASE_URL: environment.databaseUrl,
        TEST_DATABASE_SCHEMA: environment.schema,
      },
    );

    runNodeCli(
      require.resolve('jest/bin/jest'),
      JEST_INTEGRATION_COMMAND.slice(1),
      {
        DATABASE_URL: environment.databaseUrl,
        TEST_DATABASE_SCHEMA: environment.schema,
      },
    );
  } catch (error) {
    failure = error;
  } finally {
    console.log(`Dropping isolated PostgreSQL schema ${environment.schema}...`);

    try {
      await lifecycle.cleanup();
    } catch (cleanupError) {
      if (!failure) {
        failure = cleanupError;
      } else {
        console.error(
          'Database integration cleanup also failed:',
          cleanupError,
        );
      }
    }
  }

  if (failure) {
    throw failure;
  }
}

function runNodeCli(
  cliEntryPoint: string,
  args: readonly string[],
  environmentOverrides: NodeJS.ProcessEnv,
): void {
  const result = spawnSync(process.execPath, [cliEntryPoint, ...args], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...environmentOverrides,
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      TZ: 'UTC',
    },
    stdio: 'inherit',
    windowsHide: true,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      `${process.execPath} ${cliEntryPoint} ${args.join(' ')} failed with exit code ${result.status ?? 'unknown'}`,
    );
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
