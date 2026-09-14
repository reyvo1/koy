import { ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { createTestResourceNames } from './test-resource-names';

const SAFE_TOPIC_PREFIX_PATTERN = /^tests\/[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SAFE_CLIENT_ROLE_PATTERN = /^[a-z0-9-]+$/;
const BROKER_START_TIMEOUT_MS = 10_000;
const BROKER_STOP_TIMEOUT_MS = 10_000;

const MQTT_BROKER_PROCESS_SOURCE = String.raw`
import { createServer } from 'node:net';
import { Aedes } from 'aedes';

const broker = await Aedes.createBroker();
const server = createServer(broker.handle);
let closing = false;

async function closeBrokerProcess() {
  if (closing) {
    return;
  }

  closing = true;

  await new Promise((resolve, reject) => {
    if (!server.listening) {
      resolve();
      return;
    }

    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

  await new Promise((resolve, reject) => {
    broker.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function fail(error) {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(message + '\n');
  process.exitCode = 1;
}

process.stdin.setEncoding('utf8');
process.stdin.once('data', () => {
  void closeBrokerProcess()
    .then(() => process.exit(0))
    .catch(fail);
});
process.once('SIGTERM', () => {
  void closeBrokerProcess()
    .then(() => process.exit(0))
    .catch(fail);
});

server.once('error', fail);
server.once('listening', () => {
  const address = server.address();

  if (!address || typeof address === 'string') {
    fail(new Error('MQTT test broker did not expose a TCP port'));
    return;
  }

  process.stdout.write(JSON.stringify({ port: address.port }) + '\n');
});
server.listen(0, '127.0.0.1');
`;

export interface MqttIntegrationEnvironment {
  runId: string;
  topicPrefix: string;
}

export interface StartedMqttTestBroker {
  url: string;
  host: string;
  port: number;
}

export function resolveMqttIntegrationEnvironment(
  source: NodeJS.ProcessEnv = process.env,
): MqttIntegrationEnvironment {
  if (source.NODE_ENV !== 'test') {
    throw new Error('MQTT integration tests require NODE_ENV=test');
  }

  if (source.MQTT_INTEGRATION_TESTS_ALLOWED !== 'true') {
    throw new Error(
      'MQTT integration tests require MQTT_INTEGRATION_TESTS_ALLOWED=true',
    );
  }

  const resources = createTestResourceNames(source.TEST_RUN_ID);
  assertSafeMqttTopicPrefix(resources.mqttTopicPrefix);

  return {
    runId: resources.runId,
    topicPrefix: resources.mqttTopicPrefix,
  };
}

export function assertSafeMqttTopicPrefix(topicPrefix: string): void {
  if (!SAFE_TOPIC_PREFIX_PATTERN.test(topicPrefix)) {
    throw new Error(`Unsafe MQTT integration topic prefix: ${topicPrefix}`);
  }
}

export function assertOwnedMqttTopic(topic: string, topicPrefix: string): void {
  assertSafeMqttTopicPrefix(topicPrefix);

  if (!topic.startsWith(`${topicPrefix}/`)) {
    throw new Error(`MQTT integration topic is outside the run namespace`);
  }

  if (topic.includes('\0')) {
    throw new Error('MQTT integration topic contains a null character');
  }
}

export function createMqttTestClientId(
  runId: string,
  role: string,
  processId = process.pid,
): string {
  const normalizedRole = role.trim().toLowerCase();

  if (!SAFE_CLIENT_ROLE_PATTERN.test(normalizedRole)) {
    throw new Error(`Unsafe MQTT integration client role: ${role}`);
  }

  return `iot-test-${runId}-${normalizedRole}-${processId}`.slice(0, 96);
}

export class MqttTestBrokerLifecycle {
  private brokerProcess?: ChildProcessWithoutNullStreams;

  async start(): Promise<StartedMqttTestBroker> {
    if (this.brokerProcess) {
      throw new Error('MQTT test broker is already started');
    }

    const brokerProcess = spawn(
      process.execPath,
      ['--input-type=module', '--eval', MQTT_BROKER_PROCESS_SOURCE],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          NODE_ENV: 'test',
        },
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      },
    );

    try {
      const port = await waitForBrokerStart(brokerProcess);
      this.brokerProcess = brokerProcess;

      return {
        url: `mqtt://127.0.0.1:${port}`,
        host: '127.0.0.1',
        port,
      };
    } catch (error) {
      brokerProcess.kill();
      throw error;
    }
  }

  async cleanup(): Promise<void> {
    const brokerProcess = this.brokerProcess;
    this.brokerProcess = undefined;

    if (!brokerProcess) {
      return;
    }

    await stopBrokerProcess(brokerProcess);
  }
}

function waitForBrokerStart(
  brokerProcess: ChildProcessWithoutNullStreams,
): Promise<number> {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';

    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out starting runner-owned MQTT broker'));
    }, BROKER_START_TIMEOUT_MS);

    const cleanup = () => {
      clearTimeout(timeout);
      brokerProcess.off('error', onError);
      brokerProcess.off('exit', onExit);
      brokerProcess.stdout.off('data', onStdout);
      brokerProcess.stderr.off('data', onStderr);
    };

    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };

    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      cleanup();
      reject(
        new Error(
          `MQTT broker process exited before startup (${formatExit(code, signal)}): ${stderr.trim()}`,
        ),
      );
    };

    const onStderr = (chunk: Buffer | string) => {
      stderr += chunk.toString();
    };

    const onStdout = (chunk: Buffer | string) => {
      stdout += chunk.toString();
      const lineEnd = stdout.indexOf('\n');

      if (lineEnd < 0) {
        return;
      }

      const line = stdout.slice(0, lineEnd).trim();

      try {
        const payload = JSON.parse(line) as { port?: unknown };

        if (
          typeof payload.port !== 'number' ||
          !Number.isInteger(payload.port) ||
          payload.port <= 0
        ) {
          throw new Error(
            'Broker startup message did not contain a valid port',
          );
        }

        cleanup();
        resolve(payload.port);
      } catch (error) {
        cleanup();
        reject(
          new Error(
            `Invalid MQTT broker startup message: ${
              error instanceof Error ? error.message : String(error)
            }`,
          ),
        );
      }
    };

    brokerProcess.once('error', onError);
    brokerProcess.once('exit', onExit);
    brokerProcess.stdout.on('data', onStdout);
    brokerProcess.stderr.on('data', onStderr);
  });
}

function stopBrokerProcess(
  brokerProcess: ChildProcessWithoutNullStreams,
): Promise<void> {
  if (brokerProcess.exitCode !== null || brokerProcess.signalCode !== null) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    let stderr = '';

    const timeout = setTimeout(() => {
      brokerProcess.kill('SIGKILL');
      cleanup();
      reject(new Error('Timed out stopping runner-owned MQTT broker'));
    }, BROKER_STOP_TIMEOUT_MS);

    const cleanup = () => {
      clearTimeout(timeout);
      brokerProcess.off('error', onError);
      brokerProcess.off('exit', onExit);
      brokerProcess.stderr.off('data', onStderr);
    };

    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };

    const onStderr = (chunk: Buffer | string) => {
      stderr += chunk.toString();
    };

    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      cleanup();

      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `MQTT broker process failed during cleanup (${formatExit(code, signal)}): ${stderr.trim()}`,
        ),
      );
    };

    brokerProcess.once('error', onError);
    brokerProcess.once('exit', onExit);
    brokerProcess.stderr.on('data', onStderr);
    brokerProcess.stdin.end('shutdown\n');
  });
}

function formatExit(
  code: number | null,
  signal: NodeJS.Signals | null,
): string {
  return signal ? `signal ${signal}` : `exit code ${code ?? 'unknown'}`;
}
