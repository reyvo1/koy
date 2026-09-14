import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TelemetryModule } from '../telemetry/telemetry.module';
import { DeviceModule } from '../device/device.module';
import { DashboardRepository } from './dashboard.repository';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { DashboardWidgetResolver } from './dashboard-widget.resolver';
import { DashboardWidgetQueryService } from './dashboard-widget-query.service';

@Module({
  imports: [PrismaModule, TelemetryModule, DeviceModule],
  controllers: [DashboardController],
  providers: [
    DashboardRepository,
    DashboardService,
    DashboardWidgetResolver,
    DashboardWidgetQueryService,
  ],
  exports: [DashboardRepository],
})
export class DashboardModule {}
