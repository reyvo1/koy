import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PublicApiModule } from '../public-api/public-api.module';
import { TelemetryModule } from '../telemetry/telemetry.module';
import { AdminOperationalSummaryService } from './admin-operational-summary.service';
import { AdminOperationsController } from './admin-operations.controller';
import { AdminDirectoryController } from './admin-directory.controller';
import { AdminBillingDirectoryController } from './admin-billing-directory.controller';
import { AdminUserProvisioningController } from './admin-user-provisioning.controller';
import { AdminUserProvisioningService } from './admin-user-provisioning.service';
import { AdminDeviceProvisioningController } from './admin-device-provisioning.controller';
import { AdminDeviceProvisioningService } from './admin-device-provisioning.service';
import { AdminApiKeysController } from './admin-api-keys.controller';
import { AdminRoleGuard } from './admin-role.guard';
import { AdminPlatformObservabilityController } from './admin-platform-observability.controller';
import { AdminPlatformObservabilityService } from './admin-platform-observability.service';

@Module({
  imports: [PrismaModule, AnalyticsModule, PublicApiModule, TelemetryModule],
  controllers: [
    AdminOperationsController,
    AdminDirectoryController,
    AdminBillingDirectoryController,
    AdminUserProvisioningController,
    AdminDeviceProvisioningController,
    AdminApiKeysController,
    AdminPlatformObservabilityController,
  ],
  providers: [
    AdminOperationalSummaryService,
    AdminUserProvisioningService,
    AdminDeviceProvisioningService,
    AdminRoleGuard,
    AdminPlatformObservabilityService,
  ],
})
export class AdminOperationsModule {}
