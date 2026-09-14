import { ConfigService } from '@nestjs/config';

export const PRODUCTION_HTTP_BODY_LIMIT_BYTES = 262_144;
export const PRODUCTION_HTTP_REQUEST_TIMEOUT_MS = 30_000;
export const PRODUCTION_TRUSTED_PROXIES = ['127.0.0.1', '::1'] as const;
export const DEFAULT_SENSITIVE_RATE_LIMIT_MAX = 10;
export const DEFAULT_SENSITIVE_RATE_LIMIT_WINDOW_MS = 60_000;

const DEVELOPMENT_CORS_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];

export function parseCorsAllowedOrigins(value: string): string[] {
  const origins = value
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  const uniqueOrigins = [...new Set(origins)];

  for (const origin of uniqueOrigins) {
    if (origin === '*') {
      throw new Error('CORS_ALLOWED_ORIGINS must not contain a wildcard');
    }

    let parsed: URL;

    try {
      parsed = new URL(origin);
    } catch {
      throw new Error(
        `CORS_ALLOWED_ORIGINS contains an invalid origin: ${origin}`,
      );
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error(
        `CORS_ALLOWED_ORIGINS contains an unsupported protocol: ${origin}`,
      );
    }

    if (
      parsed.origin !== origin ||
      parsed.username ||
      parsed.password ||
      parsed.pathname !== '/' ||
      parsed.search ||
      parsed.hash
    ) {
      throw new Error(
        `CORS_ALLOWED_ORIGINS must contain exact origins only: ${origin}`,
      );
    }
  }

  return uniqueOrigins;
}

export function defaultCorsAllowedOrigins(environment: string): string {
  return environment === 'production' ? '' : DEVELOPMENT_CORS_ORIGINS.join(',');
}

export function resolveCorsAllowedOrigins(
  configService: ConfigService,
): string[] {
  return parseCorsAllowedOrigins(
    configService.getOrThrow<string>('CORS_ALLOWED_ORIGINS'),
  );
}
