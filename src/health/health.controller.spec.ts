import type { FastifyReply } from 'fastify';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { ReadinessResult } from './health.types';

describe('HealthController', () => {
  let controller: HealthController;
  let healthService: jest.Mocked<HealthService>;

  beforeEach(() => {
    healthService = {
      checkLiveness: jest.fn().mockReturnValue({ status: 'ok' }),
      checkReadiness: jest.fn(),
    } as unknown as jest.Mocked<HealthService>;

    controller = new HealthController(healthService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should preserve the existing health endpoint', () => {
    expect(controller.check()).toEqual({ status: 'ok' });
    expect(healthService.checkLiveness).toHaveBeenCalledTimes(1);
  });

  it('should expose the liveness endpoint', () => {
    expect(controller.checkLiveness()).toEqual({ status: 'ok' });
    expect(healthService.checkLiveness).toHaveBeenCalledTimes(1);
  });

  it('should return HTTP 200 when all readiness checks pass', async () => {
    const result: ReadinessResult = {
      status: 'ready',
      timestamp: '2026-07-16T00:00:00.000Z',
      checks: {
        postgres: { status: 'up', latencyMs: 1 },
        redis: { status: 'up', latencyMs: 1 },
        mqtt: { status: 'up', latencyMs: 0 },
      },
    };
    const reply = { status: jest.fn() } as unknown as FastifyReply;
    healthService.checkReadiness.mockResolvedValue(result);

    await expect(controller.checkReadiness(reply)).resolves.toEqual(result);
    expect(reply.status).toHaveBeenCalledWith(200);
  });

  it('should return HTTP 503 when any readiness check fails', async () => {
    const result: ReadinessResult = {
      status: 'not_ready',
      timestamp: '2026-07-16T00:00:00.000Z',
      checks: {
        postgres: { status: 'up', latencyMs: 1 },
        redis: { status: 'up', latencyMs: 1 },
        mqtt: {
          status: 'down',
          latencyMs: 0,
          reason: 'publisher_not_configured',
        },
      },
    };
    const reply = { status: jest.fn() } as unknown as FastifyReply;
    healthService.checkReadiness.mockResolvedValue(result);

    await expect(controller.checkReadiness(reply)).resolves.toEqual(result);
    expect(reply.status).toHaveBeenCalledWith(503);
  });
});
