import { Module, forwardRef } from '@nestjs/common';
import { TelemetryService } from './telemetry.service';
import { MqttTelemetryWebhookController } from './mqtt.webhook.controller';
import { TelemetryController } from './telemetry.controller';
import { TelemetryStreamController } from './telemetry-stream.controller';
import { TelemetryAggregationController } from './telemetry-aggregation.controller';
import { TelemetryAggregationService } from './telemetry-aggregation.service';
import { TelemetryRetentionService } from './telemetry-retention.service';
import { PrismaModule } from '../prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';
import { DeviceModule } from '../device/device.module';
import { AutomationModule } from '../automation/automation.module';
import { AnalyticsModule } from '../analytics/analytics.module';

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    forwardRef(() => DeviceModule),
    // Required so TelemetryService receives the AutomationTelemetryCoordinator. The
    // injection is @Optional(), so omitting this module did not fail at boot; it made the
    // automation runtime silently dead for every ingested telemetry event.
    forwardRef(() => AutomationModule),
    // Same failure mode, same fix: without this import the optional
    // FindingsRuntimeCoordinator is undefined at runtime and the anomaly detector never
    // sees an ingested event.
    forwardRef(() => AnalyticsModule),
  ],
  controllers: [
    MqttTelemetryWebhookController,
    TelemetryController,
    TelemetryStreamController,
    TelemetryAggregationController,
  ],
  providers: [TelemetryService, TelemetryAggregationService, TelemetryRetentionService],
  exports: [TelemetryService, TelemetryAggregationService, TelemetryRetentionService],
})
export class TelemetryModule {}
