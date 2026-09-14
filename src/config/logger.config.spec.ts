import { IncomingMessage, ServerResponse } from 'node:http';
import { Writable } from 'node:stream';
import pinoHttp, { Options } from 'pino-http';
import {
  createLoggerConfig,
  generateRequestId,
  REDACTED_VALUE,
  REQUEST_ID_HEADER,
} from './logger.config';

function getPinoHttpOptions(
  environment: string,
  configuredLevel?: string,
): Options {
  return createLoggerConfig(environment, configuredLevel).pinoHttp as Options;
}

describe('Logger Configuration', () => {
  const originalLogLevel = process.env.LOG_LEVEL;

  beforeEach(() => {
    delete process.env.LOG_LEVEL;
  });

  afterAll(() => {
    if (originalLogLevel === undefined) {
      delete process.env.LOG_LEVEL;
      return;
    }

    process.env.LOG_LEVEL = originalLogLevel;
  });
  it('uses environment-aware default log levels', () => {
    expect(getPinoHttpOptions('development').level).toBe('debug');
    expect(getPinoHttpOptions('production').level).toBe('info');
    expect(getPinoHttpOptions('test').level).toBe('silent');
  });

  it('allows a validated explicit log level override', () => {
    expect(getPinoHttpOptions('production', 'warn').level).toBe('warn');
  });

  it('uses pretty transport only in development', () => {
    expect(getPinoHttpOptions('development').transport).toMatchObject({
      target: 'pino-pretty',
    });
    expect(getPinoHttpOptions('production').transport).toBeUndefined();
    expect(getPinoHttpOptions('test').transport).toBeUndefined();
  });

  it('propagates a valid incoming request ID', () => {
    const request = {
      headers: { [REQUEST_ID_HEADER]: 'request-123' },
    } as unknown as IncomingMessage;
    const response = {
      setHeader: jest.fn(),
    } as unknown as ServerResponse;

    expect(generateRequestId(request, response)).toBe('request-123');
    expect(response.setHeader).toHaveBeenCalledWith(
      REQUEST_ID_HEADER,
      'request-123',
    );
  });

  it('replaces an invalid incoming request ID', () => {
    const request = {
      headers: { [REQUEST_ID_HEADER]: 'invalid request id' },
    } as unknown as IncomingMessage;
    const response = {
      setHeader: jest.fn(),
    } as unknown as ServerResponse;

    const requestId = generateRequestId(request, response);

    expect(requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      REQUEST_ID_HEADER,
      requestId,
    );
  });

  it('maps HTTP outcomes to operational log levels', () => {
    const options = getPinoHttpOptions('test');
    const customLogLevel = options.customLogLevel;

    expect(customLogLevel).toBeDefined();
    expect(
      customLogLevel?.(
        {} as IncomingMessage,
        {
          statusCode: 200,
        } as ServerResponse,
      ),
    ).toBe('info');
    expect(
      customLogLevel?.(
        {} as IncomingMessage,
        {
          statusCode: 404,
        } as ServerResponse,
      ),
    ).toBe('warn');
    expect(
      customLogLevel?.(
        {} as IncomingMessage,
        {
          statusCode: 500,
        } as ServerResponse,
      ),
    ).toBe('error');
  });

  it('redacts sensitive fields from structured log output', async () => {
    let output = '';
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        output += chunk.toString();
        callback();
      },
    });
    const options = getPinoHttpOptions('production', 'info');
    const logger = pinoHttp(
      { ...options, transport: undefined },
      stream,
    ).logger;

    logger.info({
      password: 'plain-password',
      accessToken: 'access-token',
      req: {
        headers: {
          authorization: 'Bearer secret-token',
          'x-webhook-secret': 'super-private-webhook-value',
        },
      },
      auth: {
        refreshToken: 'refresh-token',
      },
    });

    await new Promise<void>((resolve) => setImmediate(resolve));

    const entry = JSON.parse(output.trim()) as Record<string, unknown>;
    const request = entry.req as {
      headers: Record<string, string>;
    };
    const auth = entry.auth as Record<string, string>;

    expect(entry.password).toBe(REDACTED_VALUE);
    expect(entry.accessToken).toBe(REDACTED_VALUE);
    expect(request.headers.authorization).toBe(REDACTED_VALUE);
    expect(request.headers['x-webhook-secret']).toBe(REDACTED_VALUE);
    expect(auth.refreshToken).toBe(REDACTED_VALUE);
    expect(output).not.toContain('plain-password');
    expect(output).not.toContain('secret-token');
    expect(output).not.toContain('super-private-webhook-value');
    expect(output).not.toContain('refresh-token');
  });
});
