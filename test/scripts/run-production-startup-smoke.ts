import { spawn, type ChildProcess } from 'node:child_process';
import { request } from 'node:http';
import { createServer, type Server, type Socket } from 'node:net';
import { resolve } from 'node:path';

function isExpectedTeardownSocketError(error: NodeJS.ErrnoException): boolean {
  return error.code === 'ECONNRESET' || error.code === 'EPIPE';
}

function parseRedisCommands(
  socket: Socket,
  unexpectedSocketErrors: Error[],
): void {
  socket.on('error', (error: NodeJS.ErrnoException) => {
    if (!isExpectedTeardownSocketError(error)) {
      unexpectedSocketErrors.push(error);
    }
  });

  let buffer = Buffer.alloc(0);
  socket.on('data', (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length > 0) {
      const firstLineEnd = buffer.indexOf('\r\n');
      if (firstLineEnd < 0 || buffer[0] !== 42) {
        return;
      }
      const count = Number(buffer.subarray(1, firstLineEnd).toString('utf8'));
      let offset = firstLineEnd + 2;
      const values: string[] = [];
      let complete = true;
      for (let index = 0; index < count; index += 1) {
        const lengthLineEnd = buffer.indexOf('\r\n', offset);
        if (lengthLineEnd < 0 || buffer[offset] !== 36) {
          complete = false;
          break;
        }
        const length = Number(
          buffer.subarray(offset + 1, lengthLineEnd).toString('utf8'),
        );
        const valueStart = lengthLineEnd + 2;
        const valueEnd = valueStart + length;
        if (buffer.length < valueEnd + 2) {
          complete = false;
          break;
        }
        values.push(buffer.subarray(valueStart, valueEnd).toString('utf8'));
        offset = valueEnd + 2;
      }
      if (!complete) {
        return;
      }
      buffer = buffer.subarray(offset);
      const command = values[0]?.toUpperCase();
      if (command === 'INFO') {
        const payload = 'redis_version:7.0.0\r\n';
        socket.write(`$${Buffer.byteLength(payload)}\r\n${payload}\r\n`);
      } else if (command === 'PING') {
        socket.write('+PONG\r\n');
      } else if (command === 'QUIT') {
        socket.end('+OK\r\n');
      } else {
        socket.write('+OK\r\n');
      }
    }
  });
}

async function startRedisStub(): Promise<{
  server: Server;
  port: number;
  unexpectedSocketErrors: Error[];
}> {
  return new Promise((resolveServer, reject) => {
    const unexpectedSocketErrors: Error[] = [];
    const server = createServer((socket) =>
      parseRedisCommands(socket, unexpectedSocketErrors),
    );
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Unable to start the Redis startup-smoke stub'));
        return;
      }
      resolveServer({ server, port: address.port, unexpectedSocketErrors });
    });
  });
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
}

async function reservePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Unable to reserve a startup smoke port'));
        return;
      }
      const port = address.port;
      server.close((error) => (error ? reject(error) : resolvePort(port)));
    });
  });
}

interface StartupSmokeResponse {
  statusCode: number;
  body: string;
}

function resolveStartupTimeoutMs(): number {
  const value = Number(
    process.env.PRODUCTION_STARTUP_SMOKE_TIMEOUT_MS ?? '60000',
  );

  if (!Number.isInteger(value) || value < 5000 || value > 120000) {
    throw new Error(
      'PRODUCTION_STARTUP_SMOKE_TIMEOUT_MS must be an integer between 5000 and 120000',
    );
  }

  return value;
}

async function requestResponse(url: string): Promise<StartupSmokeResponse> {
  return new Promise((resolveResponse, reject) => {
    const outgoing = request(url, { method: 'GET' }, (incoming) => {
      const chunks: Buffer[] = [];

      incoming.on('data', (chunk: Buffer) => chunks.push(chunk));
      incoming.once('error', reject);
      incoming.once('end', () => {
        resolveResponse({
          statusCode: incoming.statusCode ?? 0,
          body: Buffer.concat(chunks).toString('utf8'),
        });
      });
    });

    outgoing.setTimeout(1000, () => {
      outgoing.destroy(new Error(`HTTP request timed out: ${url}`));
    });
    outgoing.once('error', reject);
    outgoing.end();
  });
}

async function waitForResponse(
  url: string,
  expectedStatus: number,
  child: ChildProcess,
  timeoutMs: number,
): Promise<StartupSmokeResponse> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;

  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(
        `Startup child exited before ${url} became ready: code=${String(
          child.exitCode,
        )}, signal=${String(child.signalCode)}`,
      );
    }

    try {
      const response = await requestResponse(url);
      if (response.statusCode === expectedStatus) {
        return response;
      }
      lastError = new Error(
        `Received HTTP ${response.statusCode} from ${url}: ${response.body}`,
      );
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }

  const detail =
    lastError instanceof Error ? lastError.message : String(lastError);

  throw new Error(
    `Startup smoke timed out after ${timeoutMs}ms waiting for ${url}. Last error: ${detail}`,
  );
}

async function waitForExit(
  child: ChildProcess,
  timeoutMs: number,
): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return true;
  }
  return new Promise<boolean>((resolveExit) => {
    const timer = setTimeout(() => {
      child.off('exit', onExit);
      resolveExit(false);
    }, timeoutMs);
    const onExit = (): void => {
      clearTimeout(timer);
      resolveExit(true);
    };
    child.once('exit', onExit);
  });
}

async function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  child.kill('SIGTERM');
  if (await waitForExit(child, 10_000)) {
    return;
  }
  child.kill('SIGKILL');
  if (!(await waitForExit(child, 5_000))) {
    throw new Error(
      `Unable to terminate startup-smoke child process ${child.pid}`,
    );
  }
}

async function main(): Promise<void> {
  const root = resolve(__dirname, '../..');
  const releaseRoot = resolve(
    root,
    process.env.RELEASE_OUTPUT_DIR ?? 'artifacts/iot-platform-release',
  );
  const port = await reservePort();
  const redisStub = await startRedisStub();
  const child = spawn(process.execPath, ['dist/main.js'], {
    cwd: releaseRoot,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      HOST: '127.0.0.1',
      PORT: String(port),
      SWAGGER_ENABLED: 'false',
      LOG_LEVEL: process.env.STARTUP_SMOKE_LOG_LEVEL ?? 'silent',
      CORS_ALLOWED_ORIGINS: 'https://app.example.test',
      JWT_SECRET: 'startup-smoke-jwt-secret-with-at-least-32-bytes',
      MQTT_BROKER_URL: 'mqtts://127.0.0.1:1',
      MQTT_CLIENT_ID_PREFIX: 'iot-startup-smoke',
      MQTT_USERNAME: 'startup-smoke-publisher',
      MQTT_PASSWORD: 'startup-smoke-publisher-password',
      MQTT_CONNECT_TIMEOUT_MS: '1000',
      MQTT_PUBLISH_TIMEOUT_MS: '1000',
      MQTT_KEEPALIVE_SECONDS: '30',
      MQTT_RECONNECT_PERIOD_MS: '1000',
      MQTT_WEBHOOK_SECRET: 'startup-smoke-mqtt-secret-with-at-least-32-bytes',
      METRICS_ACCESS_TOKEN:
        'startup-smoke-metrics-token-with-at-least-32-bytes',
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ??
        process.env.DATABASE_URL ??
        'postgresql://postgres:postgres@127.0.0.1:5432/iot_platform',
      REDIS_URL: `redis://127.0.0.1:${redisStub.port}`,
      HEALTH_CHECK_TIMEOUT_MS: '500',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let output = '';
  child.stdout?.on('data', (chunk) => (output += chunk.toString()));
  child.stderr?.on('data', (chunk) => (output += chunk.toString()));

  try {
    const startupTimeoutMs = resolveStartupTimeoutMs();
    const live = await waitForResponse(
      `http://127.0.0.1:${port}/health/live`,
      200,
      child,
      startupTimeoutMs,
    );
    const liveBody = JSON.parse(live.body) as { status?: string };
    if (liveBody.status !== 'ok') {
      throw new Error(
        `Unexpected liveness payload: ${JSON.stringify(liveBody)}`,
      );
    }
    const ready = await waitForResponse(
      `http://127.0.0.1:${port}/health/ready`,
      503,
      child,
      startupTimeoutMs,
    );
    const readyBody = JSON.parse(ready.body) as {
      status?: string;
      checks?: { mqtt?: { reason?: string } };
    };
    const acceptedMqttReasons = new Set([
      'publisher_connecting',
      'publisher_disconnected',
      'publisher_error',
    ]);
    if (
      readyBody.status !== 'not_ready' ||
      !readyBody.checks?.mqtt?.reason ||
      !acceptedMqttReasons.has(readyBody.checks.mqtt.reason)
    ) {
      throw new Error(
        `Unexpected readiness payload: ${JSON.stringify(readyBody)}`,
      );
    }
    console.log('Production artifact startup smoke passed.');
    console.log(
      'Liveness returned 200 and MQTT readiness reflected the unavailable broker.',
    );
  } catch (error) {
    throw new Error(
      `${
        error instanceof Error ? error.message : error
      }\nChild exit: code=${String(child.exitCode)}, signal=${String(
        child.signalCode,
      )}\nChild output:\n${output}`,
    );
  } finally {
    await stop(child);
    await closeServer(redisStub.server);
    if (redisStub.unexpectedSocketErrors.length > 0) {
      throw new Error(
        `Unexpected Redis startup-smoke socket error: ${redisStub.unexpectedSocketErrors[0].message}`,
      );
    }
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
