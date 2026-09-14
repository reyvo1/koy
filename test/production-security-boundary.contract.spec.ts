import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');

function readRepositoryFile(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

describe('Production Security Boundary contract', () => {
  it('enforces exact production CORS origins without wildcard credentials', () => {
    const validation = readRepositoryFile('src/config/config.validation.ts');
    const security = readRepositoryFile(
      'src/security/production-security.config.ts',
    );
    const bootstrap = readRepositoryFile(
      'src/bootstrap/configure-application.ts',
    );

    expect(security).toContain("if (origin === '*')");
    expect(security).toContain('parsed.origin !== origin');
    expect(validation).toContain(
      'CORS_ALLOWED_ORIGINS must use HTTPS origins in production',
    );
    expect(bootstrap).toContain('credentials: false');
    expect(bootstrap).toContain('origin: options.corsAllowedOrigins');
  });

  it('pins trusted proxy, body, and request-time boundaries', () => {
    const security = readRepositoryFile(
      'src/security/production-security.config.ts',
    );
    const adapter = readRepositoryFile(
      'src/bootstrap/production-fastify-adapter.ts',
    );

    expect(security).toContain('PRODUCTION_HTTP_BODY_LIMIT_BYTES = 262_144');
    expect(security).toContain('PRODUCTION_HTTP_REQUEST_TIMEOUT_MS = 30_000');
    expect(security).toContain("['127.0.0.1', '::1']");
    expect(adapter).toContain('bodyLimit: PRODUCTION_HTTP_BODY_LIMIT_BYTES');
    expect(adapter).toContain(
      'requestTimeout: PRODUCTION_HTTP_REQUEST_TIMEOUT_MS',
    );
    expect(adapter).toContain('trustProxy: [...PRODUCTION_TRUSTED_PROXIES]');
  });

  it('rate limits only sensitive authentication paths with Redis atomically', () => {
    const guard = readRepositoryFile(
      'src/security/sensitive-endpoint-rate-limit.guard.ts',
    );
    const appModule = readRepositoryFile('src/app.module.ts');

    for (const path of [
      '/auth/register',
      '/auth/verify-email',
      '/auth/login',
      '/auth/refresh',
      '/auth/forgot-password',
      '/auth/reset-password',
    ]) {
      expect(guard).toContain(path);
    }

    expect(guard).toContain("redis.call('INCR', KEYS[1])");
    expect(guard).toContain("redis.call('PEXPIRE', KEYS[1], ARGV[1])");
    expect(guard).toContain("createHash('sha256')");
    expect(guard).toContain('Retry-After');
    expect(guard).toContain('ERROR_CODES.AuthRateLimitExceeded');
    expect(guard).toContain('ERROR_CODES.RateLimitUnavailable');
    expect(appModule).toContain('SensitiveEndpointRateLimitGuard');
    expect(appModule).toContain('provide: APP_GUARD');
  });

  it('protects metrics with a production bearer token and constant-time compare', () => {
    const validation = readRepositoryFile('src/config/config.validation.ts');
    const guard = readRepositoryFile('src/metrics/metrics-access.guard.ts');
    const controller = readRepositoryFile('src/metrics/metrics.controller.ts');

    expect(validation).toContain(
      'METRICS_ACCESS_TOKEN is required in production',
    );
    expect(guard).toContain('timingSafeEqual');
    expect(guard).toContain('ERROR_CODES.MetricsAccessDenied');
    expect(guard).toContain('/^Bearer\\s+(.+)$/i');
    expect(controller).toContain('@UseGuards(MetricsAccessGuard)');
  });

  it('records stable security error codes', () => {
    const codes = readRepositoryFile('src/common/errors/error-code.ts');

    expect(codes).toContain("MetricsAccessDenied: 'METRICS_ACCESS_DENIED'");
    expect(codes).toContain(
      "AuthRateLimitExceeded: 'AUTH_RATE_LIMIT_EXCEEDED'",
    );
    expect(codes).toContain("RateLimitUnavailable: 'RATE_LIMIT_UNAVAILABLE'");
  });

  it('retains security, deployment, and MQTT completion after later transitions', () => {
    const documentation = readRepositoryFile('docs/production-security.md');
    const readiness = readRepositoryFile('docs/production-readiness.md');

    expect(documentation).toMatch(/## Status\r?\n\r?\nCompleted\./);
    expect(documentation).toContain('Deployment and Recovery Foundation');
    expect(readiness).toContain(
      'Production Security Boundary Hardening — Completed',
    );
  });

  it('preserves the approved MQTT adapter and deployment approval boundary', () => {
    const mqtt = readRepositoryFile('src/mqtt/mqtt.service.ts');
    const adapter = readRepositoryFile('src/mqtt/mqtt-js-publisher.adapter.ts');
    const mqttConfig = readRepositoryFile('src/mqtt/mqtt-publisher.config.ts');
    const readiness = readRepositoryFile('docs/production-readiness.md');

    expect(mqtt).toContain('this.publisherTransport.publish(topic, message)');
    expect(adapter).toContain('publishAsync');
    expect(mqttConfig).toContain('rejectUnauthorized: true');
    expect(readiness).toContain('MQTT Production Transport Implementation');
    expect(readiness).toContain('Status: NOT READY FOR PRODUCTION DEPLOYMENT');
  });
});
