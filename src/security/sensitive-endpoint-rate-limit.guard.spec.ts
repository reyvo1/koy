import { ExecutionContext, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { SensitiveEndpointRateLimitGuard } from './sensitive-endpoint-rate-limit.guard';

function contextFor(
  url: string,
  ip = '203.0.113.20',
  header = jest.fn(),
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ url, ip }),
      getResponse: () => ({ header }),
    }),
  } as unknown as ExecutionContext;
}

function createConfig(): ConfigService {
  return {
    getOrThrow: jest.fn((key: string) => {
      const values: Record<string, number> = {
        SENSITIVE_RATE_LIMIT_MAX: 3,
        SENSITIVE_RATE_LIMIT_WINDOW_MS: 60_000,
      };
      return values[key];
    }),
  } as unknown as ConfigService;
}

describe('SensitiveEndpointRateLimitGuard', () => {
  it('does not touch Redis for non-sensitive endpoints', async () => {
    const redis = { eval: jest.fn() } as unknown as Redis;
    const guard = new SensitiveEndpointRateLimitGuard(createConfig(), redis);

    await expect(guard.canActivate(contextFor('/health'))).resolves.toBe(true);
    expect(redis.eval).not.toHaveBeenCalled();
  });

  it('allows authentication requests within the configured window', async () => {
    const redis = {
      eval: jest.fn().mockResolvedValue([2, 45_000]),
    } as unknown as Redis;
    const guard = new SensitiveEndpointRateLimitGuard(createConfig(), redis);

    await expect(
      guard.canActivate(contextFor('/auth/login?source=web')),
    ).resolves.toBe(true);
    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('INCR'"),
      1,
      expect.stringMatching(/^iot:rate-limit:auth:[a-f0-9]{64}$/),
      60_000,
    );
  });

  it('rejects requests after the authentication limit is exceeded', async () => {
    const redis = {
      eval: jest.fn().mockResolvedValue([4, 30_000]),
    } as unknown as Redis;
    const guard = new SensitiveEndpointRateLimitGuard(createConfig(), redis);

    const header = jest.fn();

    await expect(
      guard.canActivate(contextFor('/auth/reset-password', undefined, header)),
    ).rejects.toMatchObject({
      status: 429,
    });
    expect(header).toHaveBeenCalledWith('Retry-After', '30');
  });

  it('fails closed when Redis cannot enforce the authentication limit', async () => {
    const redis = {
      eval: jest.fn().mockRejectedValue(new Error('redis unavailable')),
    } as unknown as Redis;
    const guard = new SensitiveEndpointRateLimitGuard(createConfig(), redis);

    await expect(
      guard.canActivate(contextFor('/auth/forgot-password')),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
