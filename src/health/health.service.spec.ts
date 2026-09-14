import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { MetricsService } from '../metrics/metrics.service';
import { MqttService } from '../mqtt/mqtt.service';
import { PrismaService } from '../prisma/prisma.service';
import { HealthService } from './health.service';

describe('HealthService', () => {
  const createService = (timeoutMs = 1000) => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    } as unknown as jest.Mocked<PrismaService>;
    const redis = {
      ping: jest.fn().mockResolvedValue('PONG'),
    } as unknown as jest.Mocked<Redis>;
    const mqttService = {
      getTransportReadiness: jest.fn().mockReturnValue({ ready: true }),
    } as unknown as jest.Mocked<MqttService>;
    const configService = {
      get: jest.fn().mockReturnValue(timeoutMs),
    } as unknown as jest.Mocked<ConfigService>;
    const metrics = {
      recordDependencyReadiness: jest.fn(),
      recordOverallReadiness: jest.fn(),
    } as unknown as jest.Mocked<MetricsService>;

    return {
      service: new HealthService(
        prisma,
        redis,
        mqttService,
        configService,
        metrics,
      ),
      prisma,
      redis,
      mqttService,
      metrics,
    };
  };

  it('should return liveness without checking dependencies', () => {
    const { service, prisma, redis, mqttService } = createService();

    expect(service.checkLiveness()).toEqual({ status: 'ok' });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(redis.ping).not.toHaveBeenCalled();
    expect(mqttService.getTransportReadiness).not.toHaveBeenCalled();
  });

  it('should report ready when all dependencies are available', async () => {
    const { service, metrics } = createService();

    const result = await service.checkReadiness();

    expect(result.status).toBe('ready');
    expect(result.timestamp).toEqual(expect.any(String));
    expect(result.checks).toEqual({
      postgres: { status: 'up', latencyMs: expect.any(Number) },
      redis: { status: 'up', latencyMs: expect.any(Number) },
      mqtt: { status: 'up', latencyMs: expect.any(Number) },
    });
    expect(metrics.recordDependencyReadiness).toHaveBeenCalledTimes(3);
    expect(metrics.recordOverallReadiness).toHaveBeenCalledWith('ready');
  });

  it('should isolate a PostgreSQL failure', async () => {
    const { service, prisma, metrics } = createService();
    prisma.$queryRaw.mockRejectedValue(new Error('database unavailable'));

    const result = await service.checkReadiness();

    expect(result.status).toBe('not_ready');
    expect(result.checks.postgres).toEqual({
      status: 'down',
      latencyMs: expect.any(Number),
      reason: 'check_failed',
    });
    expect(result.checks.redis.status).toBe('up');
    expect(result.checks.mqtt.status).toBe('up');
    expect(metrics.recordDependencyReadiness).toHaveBeenCalledWith(
      'postgres',
      'down',
      expect.any(Number),
    );
    expect(metrics.recordOverallReadiness).toHaveBeenCalledWith('not_ready');
  });

  it('should isolate an unexpected Redis response', async () => {
    const { service, redis } = createService();
    redis.ping.mockResolvedValue('LOADING');

    const result = await service.checkReadiness();

    expect(result.status).toBe('not_ready');
    expect(result.checks.redis).toEqual({
      status: 'down',
      latencyMs: expect.any(Number),
      reason: 'unexpected_response',
    });
    expect(result.checks.postgres.status).toBe('up');
    expect(result.checks.mqtt.status).toBe('up');
  });

  it('should expose the honest MQTT placeholder status', async () => {
    const { service, mqttService } = createService();
    mqttService.getTransportReadiness.mockReturnValue({
      ready: false,
      reason: 'publisher_not_configured',
    });

    const result = await service.checkReadiness();

    expect(result.status).toBe('not_ready');
    expect(result.checks.mqtt).toEqual({
      status: 'down',
      latencyMs: expect.any(Number),
      reason: 'publisher_not_configured',
    });
  });

  it('should time out a dependency check without blocking other checks', async () => {
    jest.useFakeTimers();
    const { service, prisma } = createService(25);
    prisma.$queryRaw.mockReturnValue(new Promise(() => undefined) as any);

    const readinessPromise = service.checkReadiness();
    await jest.advanceTimersByTimeAsync(25);
    const result = await readinessPromise;

    expect(result.status).toBe('not_ready');
    expect(result.checks.postgres).toEqual({
      status: 'down',
      latencyMs: expect.any(Number),
      reason: 'timeout',
    });
    expect(result.checks.redis.status).toBe('up');
    expect(result.checks.mqtt.status).toBe('up');

    jest.useRealTimers();
  });
});
