import { Controller, Get, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { HealthService } from './health.service';
import { LivenessResult, ReadinessResult } from './health.types';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  check(): LivenessResult {
    return this.healthService.checkLiveness();
  }

  @Get('live')
  checkLiveness(): LivenessResult {
    return this.healthService.checkLiveness();
  }

  @Get('ready')
  async checkReadiness(
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<ReadinessResult> {
    const result = await this.healthService.checkReadiness();

    reply.status(result.status === 'ready' ? 200 : 503);

    return result;
  }
}
