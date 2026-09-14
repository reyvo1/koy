import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import Redis from 'ioredis';

export const REDIS_SHUTDOWN_TIMEOUT_MS = 5000;

@Injectable()
export class RedisLifecycleService implements OnApplicationShutdown {
  private shutdownPromise?: Promise<void>;

  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    this.shutdownPromise ??= this.closeRedisClient();
    await this.shutdownPromise;
  }

  private async closeRedisClient(): Promise<void> {
    if (this.redis.status === 'end') {
      return;
    }

    try {
      await this.withTimeout(this.redis.quit());
    } catch {
      this.redis.disconnect(false);
    }
  }

  private withTimeout<T>(operation: Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('redis_shutdown_timeout'));
      }, REDIS_SHUTDOWN_TIMEOUT_MS);

      operation.then(
        (result) => {
          clearTimeout(timeout);
          resolve(result);
        },
        (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      );
    });
  }
}
