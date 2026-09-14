import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MetricsAccessGuard } from './metrics-access.guard';

function contextWithAuthorization(authorization?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        headers: { authorization },
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('MetricsAccessGuard', () => {
  it('allows a matching bearer token', () => {
    const config = {
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          NODE_ENV: 'production',
          METRICS_ACCESS_TOKEN: 'metrics-secret',
        };
        return values[key];
      }),
    } as unknown as ConfigService;
    const guard = new MetricsAccessGuard(config);

    expect(
      guard.canActivate(contextWithAuthorization('Bearer metrics-secret')),
    ).toBe(true);
  });

  it.each([undefined, '', 'Basic metrics-secret', 'Bearer wrong-secret'])(
    'rejects invalid authorization value %s',
    (authorization) => {
      const config = {
        get: jest.fn((key: string) =>
          key === 'METRICS_ACCESS_TOKEN' ? 'metrics-secret' : 'production',
        ),
      } as unknown as ConfigService;
      const guard = new MetricsAccessGuard(config);

      expect(() =>
        guard.canActivate(contextWithAuthorization(authorization)),
      ).toThrow(UnauthorizedException);
    },
  );

  it('allows local development when no metrics token is configured', () => {
    const config = {
      get: jest.fn((key: string) =>
        key === 'NODE_ENV' ? 'development' : undefined,
      ),
    } as unknown as ConfigService;

    expect(
      new MetricsAccessGuard(config).canActivate(
        contextWithAuthorization(undefined),
      ),
    ).toBe(true);
  });

  it('fails closed in production when the token is unexpectedly missing', () => {
    const config = {
      get: jest.fn((key: string) =>
        key === 'NODE_ENV' ? 'production' : undefined,
      ),
    } as unknown as ConfigService;

    expect(() =>
      new MetricsAccessGuard(config).canActivate(
        contextWithAuthorization(undefined),
      ),
    ).toThrow(UnauthorizedException);
  });
});
