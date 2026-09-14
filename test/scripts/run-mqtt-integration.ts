import { ChildProcess, spawn } from 'node:child_process';
import {
  DatabaseTestLifecycle,
  resolveDatabaseIntegrationEnvironment,
} from '../support/database-test-environment';
import {
  MqttTestBrokerLifecycle,
  resolveMqttIntegrationEnvironment,
} from '../support/mqtt-test-environment';

const PRISMA_MIGRATE_DEPLOY_ARGS = ['migrate', 'deploy'] as const;
const JEST_MQTT_INTEGRATION_ARGS = [
  '--config',
  './test/jest-mqtt-integration.json',
  '--runInBand',
] as const;
const MQTT_WEBHOOK_SECRET = 'mqtt-integration-webhook-secret';
const MQTT_INTEGRATION_JWT_SECRET =
  'mqtt-integration-jwt-secret-local-only-2026';
const CHILD_PROCESS_TIMEOUT_MS = 180_000;

async function main(): Promise<void> {
  const databaseEnvironment = resolveDatabaseIntegrationEnvironment(
    process.env,
  );
  const mqttEnvironment = resolveMqttIntegrationEnvironment(process.env);
  const databaseLifecycle = new DatabaseTestLifecycle(databaseEnvironment);
  const brokerLifecycle = new MqttTestBrokerLifecycle();

  console.log(
    `Provisioning PostgreSQL schema ${databaseEnvironment.schema} and MQTT namespace ${mqttEnvironment.topicPrefix}...`,
  );

  let failure: unknown;

  try {
    await databaseLifecycle.provision();

    await runNodeCli(require.resolve('prisma'), PRISMA_MIGRATE_DEPLOY_ARGS, {
      DATABASE_URL: databaseEnvironment.databaseUrl,
      TEST_DATABASE_SCHEMA: databaseEnvironment.schema,
      TEST_RUN_ID: databaseEnvironment.runId,
    });

    const broker = await brokerLifecycle.start();
    console.log(`Started runner-owned MQTT broker at ${broker.url}.`);

    await runNodeCli(
      require.resolve('jest/bin/jest'),
      JEST_MQTT_INTEGRATION_ARGS,
      {
        DATABASE_URL: databaseEnvironment.databaseUrl,
        TEST_DATABASE_SCHEMA: databaseEnvironment.schema,
        TEST_RUN_ID: mqttEnvironment.runId,
        MQTT_TEST_URL: broker.url,
        MQTT_TEST_TOPIC_PREFIX: mqttEnvironment.topicPrefix,
        MQTT_WEBHOOK_SECRET,
        JWT_SECRET: MQTT_INTEGRATION_JWT_SECRET,
      },
    );
  } catch (error) {
    failure = error;
  } finally {
    console.log('Stopping runner-owned MQTT broker...');

    try {
      await brokerLifecycle.cleanup();
    } catch (cleanupError) {
      failure ??= cleanupError;
      console.error('MQTT integration cleanup also failed:', cleanupError);
    }

    console.log(
      `Dropping isolated PostgreSQL schema ${databaseEnvironment.schema}...`,
    );

    try {
      await databaseLifecycle.cleanup();
    } catch (cleanupError) {
      failure ??= cleanupError;
      console.error('Database integration cleanup also failed:', cleanupError);
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
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliEntryPoint, ...args], {
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

    let settled = false;
    const finish = (error?: Error) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      child.removeAllListeners();

      if (error) {
        reject(error);
        return;
      }

      resolve();
    };
    const timeout = setTimeout(() => {
      terminateChild(child);
      finish(
        new Error(
          `${process.execPath} ${cliEntryPoint} ${args.join(' ')} exceeded ${CHILD_PROCESS_TIMEOUT_MS}ms`,
        ),
      );
    }, CHILD_PROCESS_TIMEOUT_MS);

    child.once('error', (error) => finish(error));
    child.once('exit', (code, signal) => {
      if (code === 0) {
        finish();
        return;
      }

      finish(
        new Error(
          `${process.execPath} ${cliEntryPoint} ${args.join(' ')} failed with ${
            signal ? `signal ${signal}` : `exit code ${code ?? 'unknown'}`
          }`,
        ),
      );
    });
  });
}

function terminateChild(child: ChildProcess): void {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  child.kill('SIGTERM');

  const forceTimer = setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL');
    }
  }, 3_000);
  forceTimer.unref();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
