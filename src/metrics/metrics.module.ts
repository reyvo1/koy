import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { MetricsController } from './metrics.controller';
import { MetricsInterceptor } from './metrics.interceptor';
import { MetricsService } from './metrics.service';
import { MetricsAccessGuard } from './metrics-access.guard';

@Global()
@Module({
  imports: [ConfigModule],
  controllers: [MetricsController],
  providers: [
    MetricsService,
    MetricsAccessGuard,
    {
      provide: APP_INTERCEPTOR,
      useClass: MetricsInterceptor,
    },
  ],
  exports: [MetricsService],
})
export class MetricsModule {}
