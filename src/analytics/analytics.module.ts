import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { DeviceModule } from '../device/device.module';
import { NotificationModule } from '../notification/notification.module';
import { AccessibleAnalyticsController } from './accessible-analytics.controller';
import { AccessibleAnalyticsService } from './accessible-analytics.service';
import { AnalyticsIngestionService } from './analytics-ingestion.service';
import { FindingsRuntimeCoordinator } from './findings-runtime.coordinator';
import { TelemetryAnomalyDetector } from './telemetry-anomaly-detector.service';
import { DeviceHealthScoringService } from './device-health-scoring.service';
import { DeviceRiskForecastingService } from './device-risk-forecasting.service';
import { EnergyIntelligenceService } from './energy-intelligence.service';
import { CrossRegionOperationsService } from './cross-region-operations.service';

@Module({
  imports: [PrismaModule, DeviceModule, ConfigModule, NotificationModule],
  controllers: [AccessibleAnalyticsController],
  providers: [AnalyticsIngestionService, AccessibleAnalyticsService, TelemetryAnomalyDetector, FindingsRuntimeCoordinator, DeviceHealthScoringService,
    DeviceRiskForecastingService,
    EnergyIntelligenceService,
    CrossRegionOperationsService],
  exports: [
    AnalyticsIngestionService,
    AccessibleAnalyticsService,
    TelemetryAnomalyDetector,
    FindingsRuntimeCoordinator,
    DeviceHealthScoringService,
    DeviceRiskForecastingService,
    EnergyIntelligenceService,
    CrossRegionOperationsService,
  ],
})
export class AnalyticsModule {}
