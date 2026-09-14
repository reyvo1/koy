import Redis from 'ioredis';
import {
  REDIS_SHUTDOWN_TIMEOUT_MS,
  RedisLifecycleService,
} from './redis-lifecycle.service';

function createRedisMock(overrides: Partial<Redis> = {}): Redis {
  return {
    status: 'ready',
    quit: jest.fn().mockResolvedValue('OK'),
    disconnect: jest.fn(),
    ...overrides,
  } as unknown as Redis;
}

describe('RedisLifecycleService', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('quits Redis once during repeated shutdown notifications', async () => {
    const redis = createRedisMock();
    const service = new RedisLifecycleService(redis);

    await Promise.all([
      service.onApplicationShutdown(),
      service.onApplicationShutdown(),
    ]);

    expect(redis.quit).toHaveBeenCalledTimes(1);
    expect(redis.disconnect).not.toHaveBeenCalled();
  });

  it('does nothing when Redis is already closed', async () => {
    const redis = createRedisMock({ status: 'end' });
    const service = new RedisLifecycleService(redis);

    await service.onApplicationShutdown();

    expect(redis.quit).not.toHaveBeenCalled();
    expect(redis.disconnect).not.toHaveBeenCalled();
  });

  it('force disconnects when graceful Redis shutdown fails', async () => {
    const redis = createRedisMock({
      quit: jest.fn().mockRejectedValue(new Error('quit failed')),
    });
    const service = new RedisLifecycleService(redis);

    await service.onApplicationShutdown();

    expect(redis.disconnect).toHaveBeenCalledWith(false);
  });

  it('bounds Redis shutdown and force disconnects after timeout', async () => {
    jest.useFakeTimers();
    const redis = createRedisMock({
      quit: jest.fn().mockReturnValue(new Promise(() => undefined)),
    });
    const service = new RedisLifecycleService(redis);

    const shutdown = service.onApplicationShutdown();
    await jest.advanceTimersByTimeAsync(REDIS_SHUTDOWN_TIMEOUT_MS);
    await shutdown;

    expect(redis.disconnect).toHaveBeenCalledWith(false);
  });
});
