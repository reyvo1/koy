import { Controller, Get, Res, UseGuards } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { MetricsService } from './metrics.service';
import { MetricsAccessGuard } from './metrics-access.guard';

export const PROMETHEUS_CONTENT_TYPE =
  'text/plain; version=0.0.4; charset=utf-8';

@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  @UseGuards(MetricsAccessGuard)
  getMetrics(@Res({ passthrough: true }) reply: FastifyReply): string {
    reply.header('Content-Type', PROMETHEUS_CONTENT_TYPE);
    return this.metrics.renderPrometheus();
  }
}
