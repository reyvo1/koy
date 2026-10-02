import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DeviceModule } from '../device/device.module';
import { AccessibleAnalyticsController } from './accessible-analytics.controller';
import { AccessibleAnalyticsService } from './accessible-analytics.service';
import { AnalyticsIngestionService } from './analytics-ingestion.service';
import { TelemetryAnomalyDetector } from './telemetry-anomaly-detector.service';

@Module({
  imports: [PrismaModule, DeviceModule],
  controllers: [AccessibleAnalyticsController],
  providers: [AnalyticsIngestionService, AccessibleAnalyticsService, TelemetryAnomalyDetector],
  exports: [AnalyticsIngestionService, AccessibleAnalyticsService, TelemetryAnomalyDetector],
})
export class AnalyticsModule {}
