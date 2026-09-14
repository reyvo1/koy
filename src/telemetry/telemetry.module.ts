import { Module, forwardRef } from '@nestjs/common';
import { TelemetryService } from './telemetry.service';
import { MqttTelemetryWebhookController } from './mqtt.webhook.controller';
import { TelemetryController } from './telemetry.controller';
import { TelemetryStreamController } from './telemetry-stream.controller';
import { TelemetryAggregationController } from './telemetry-aggregation.controller';
import { TelemetryAggregationService } from './telemetry-aggregation.service';
import { PrismaModule } from '../prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';
import { DeviceModule } from '../device/device.module';

@Module({
  imports: [PrismaModule, ConfigModule, forwardRef(() => DeviceModule)],
  controllers: [
    MqttTelemetryWebhookController,
    TelemetryController,
    TelemetryStreamController,
    TelemetryAggregationController,
  ],
  providers: [TelemetryService, TelemetryAggregationService],
  exports: [TelemetryService, TelemetryAggregationService],
})
export class TelemetryModule {}
