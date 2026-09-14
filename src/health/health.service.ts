import { Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { MetricsService } from '../metrics/metrics.service';
import { MqttService } from '../mqtt/mqtt.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  DependencyHealthCheck,
  LivenessResult,
  ReadinessResult,
} from './health.types';

class DependencyCheckError extends Error {
  constructor(readonly reason: string) {
    super(reason);
  }
}

@Injectable()
export class HealthService {
  private readonly timeoutMs: number;

  constructor(
    private readonly prisma: PrismaService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
    private readonly mqttService: MqttService,
    configService: ConfigService,
    @Optional() private readonly metrics?: MetricsService,
  ) {
    this.timeoutMs = configService.get<number>('HEALTH_CHECK_TIMEOUT_MS', 1000);
  }

  checkLiveness(): LivenessResult {
    return { status: 'ok' };
  }

  async checkReadiness(): Promise<ReadinessResult> {
    const [postgres, redis, mqtt] = await Promise.all([
      this.checkDependency('postgres', async () => {
        await this.prisma.$queryRaw`SELECT 1`;
      }),
      this.checkDependency('redis', async () => {
        const response = await this.redis.ping();

        if (response !== 'PONG') {
          throw new DependencyCheckError('unexpected_response');
        }
      }),
      this.checkDependency('mqtt', async () => {
        const status = this.mqttService.getTransportReadiness();

        if (!status.ready) {
          throw new DependencyCheckError(
            status.reason ?? 'transport_unavailable',
          );
        }
      }),
    ]);

    const checks = { postgres, redis, mqtt };
    const ready = Object.values(checks).every((check) => check.status === 'up');
    const status = ready ? 'ready' : 'not_ready';

    this.metrics?.recordOverallReadiness(status);

    return {
      status,
      timestamp: new Date().toISOString(),
      checks,
    };
  }

  private async checkDependency(
    dependency: 'postgres' | 'redis' | 'mqtt',
    check: () => Promise<void>,
  ): Promise<DependencyHealthCheck> {
    const startedAt = Date.now();

    try {
      await this.withTimeout(check());

      const latencyMs = Date.now() - startedAt;

      this.metrics?.recordDependencyReadiness(
        dependency,
        'up',
        latencyMs / 1000,
      );

      return {
        status: 'up',
        latencyMs,
      };
    } catch (error) {
      const latencyMs = Date.now() - startedAt;

      this.metrics?.recordDependencyReadiness(
        dependency,
        'down',
        latencyMs / 1000,
      );

      return {
        status: 'down',
        latencyMs,
        reason:
          error instanceof DependencyCheckError ? error.reason : 'check_failed',
      };
    }
  }

  private withTimeout<T>(operation: Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new DependencyCheckError('timeout'));
      }, this.timeoutMs);

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
