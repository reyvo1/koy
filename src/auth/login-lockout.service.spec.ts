import { jest } from '@jest/globals';
import type Redis from 'ioredis';
import {
  LOCKOUT_MAX_FAILURES,
  LoginLockoutService,
} from './login-lockout.service';

function redisMock(overrides: Partial<Record<'get' | 'eval' | 'del', unknown>> = {}) {
  const client = {
    get: jest.fn<() => Promise<string | null>>().mockResolvedValue(null),
    eval: jest
      .fn<() => Promise<[number, number]>>()
      .mockResolvedValue([1, 1000]),
    del: jest.fn<() => Promise<number>>().mockResolvedValue(1),
  };
  for (const [k, v] of Object.entries(overrides)) {
    (client as unknown as Record<string, unknown>)[k] = v;
  }
  return client as unknown as Redis;
}

describe('LoginLockoutService', () => {
  it('reports locked when failure counter reaches the threshold', async () => {
    const service = new LoginLockoutService(
      redisMock({ get: jest.fn<() => Promise<string | null>>().mockResolvedValue(String(LOCKOUT_MAX_FAILURES)) }),
    );
    expect(await service.isLockedOut('tenant:email')).toBe(true);
  });

  it('reports unlocked below the threshold and on redis errors (fail-open)', async () => {
    const below = new LoginLockoutService(
      redisMock({ get: jest.fn<() => Promise<string | null>>().mockResolvedValue(String(LOCKOUT_MAX_FAILURES - 1)) }),
    );
    expect(await below.isLockedOut('tenant:email')).toBe(false);

    const failing = new LoginLockoutService(
      redisMock({ get: jest.fn<() => Promise<never>>().mockRejectedValue(new Error('down')) }),
    );
    expect(await failing.isLockedOut('tenant:email')).toBe(false);
  });

  it('records failures with a sliding window and clears on success', async () => {
    const client = redisMock();
    const service = new LoginLockoutService(client);

    await service.recordFailure('tenant:email');
    expect(client.eval).toHaveBeenCalledTimes(1);
    const args = (client.eval as jest.Mock).mock.calls[0] as unknown[];
    expect(String(args[args.length - 1])).toBe('900000'); // 15 min window

    await service.clearFailures('tenant:email');
    expect(client.del).toHaveBeenCalledWith('iot:login-lockout:tenant:email');
  });

  it('never throws when redis rejects a write', async () => {
    const service = new LoginLockoutService(
      redisMock({
        eval: jest.fn<() => Promise<never>>().mockRejectedValue(new Error('down')),
        del: jest.fn<() => Promise<never>>().mockRejectedValue(new Error('down')),
      }),
    );
    await expect(service.recordFailure('k')).resolves.toBeUndefined();
    await expect(service.clearFailures('k')).resolves.toBeUndefined();
  });
});
