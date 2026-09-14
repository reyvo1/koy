import { randomUUID } from 'node:crypto';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Params } from 'nestjs-pino';
import { LevelWithSilent } from 'pino';

export const REQUEST_ID_HEADER = 'x-request-id';
export const REDACTED_VALUE = '[REDACTED]';

export const SENSITIVE_LOG_PATHS = [
  'password',
  'passwordHash',
  'token',
  'tokenHash',
  'tokenLookup',
  'accessToken',
  'refreshToken',
  'secret',
  'oldSecret',
  'newSecret',
  'credential',
  'credential.passwordHash',
  '*.password',
  '*.passwordHash',
  '*.token',
  '*.tokenHash',
  '*.tokenLookup',
  '*.accessToken',
  '*.refreshToken',
  '*.secret',
  '*.oldSecret',
  '*.newSecret',
  'req.headers.authorization',
  'req.headers.cookie',
  "req.headers['x-webhook-secret']",
  "req.headers['x-device-secret']",
  'req.body.password',
  'req.body.token',
  'req.body.refreshToken',
  'req.body.accessToken',
  'req.body.secret',
  'req.body.oldSecret',
  'req.body.newSecret',
] as const;

const VALID_REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const VALID_LOG_LEVELS = new Set<LevelWithSilent>([
  'fatal',
  'error',
  'warn',
  'info',
  'debug',
  'trace',
  'silent',
]);

function resolveLogLevel(
  environment: string | undefined,
  configuredLevel: string | undefined,
): LevelWithSilent {
  if (
    configuredLevel &&
    VALID_LOG_LEVELS.has(configuredLevel as LevelWithSilent)
  ) {
    return configuredLevel as LevelWithSilent;
  }

  if (environment === 'production') {
    return 'info';
  }

  if (environment === 'test') {
    return 'silent';
  }

  return 'debug';
}

export function generateRequestId(
  request: IncomingMessage,
  response: ServerResponse,
): string {
  const requestIdHeader = request.headers[REQUEST_ID_HEADER];
  const candidate = Array.isArray(requestIdHeader)
    ? requestIdHeader[0]
    : requestIdHeader;
  const requestId =
    typeof candidate === 'string' && VALID_REQUEST_ID.test(candidate)
      ? candidate
      : randomUUID();

  response.setHeader(REQUEST_ID_HEADER, requestId);

  return requestId;
}

export function createLoggerConfig(
  environment: string | undefined = process.env.NODE_ENV,
  configuredLevel: string | undefined = process.env.LOG_LEVEL,
): Params {
  const isDevelopment = environment === 'development' || !environment;

  return {
    pinoHttp: {
      level: resolveLogLevel(environment, configuredLevel),
      genReqId: generateRequestId,
      quietReqLogger: true,
      customAttributeKeys: {
        reqId: 'requestId',
        responseTime: 'durationMs',
      },
      customLogLevel: (_request, response, error): LevelWithSilent => {
        if (error || response.statusCode >= 500) {
          return 'error';
        }

        if (response.statusCode >= 400) {
          return 'warn';
        }

        return 'info';
      },
      customSuccessMessage: () => 'http.request.completed',
      customErrorMessage: () => 'http.request.failed',
      redact: {
        paths: [...SENSITIVE_LOG_PATHS],
        censor: REDACTED_VALUE,
      },
      transport: isDevelopment
        ? {
            target: 'pino-pretty',
            options: {
              colorize: true,
              singleLine: true,
              translateTime: 'SYS:standard',
              ignore: 'pid,hostname',
            },
          }
        : undefined,
    },
  };
}
