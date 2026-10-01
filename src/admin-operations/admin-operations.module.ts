import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PublicApiModule } from '../public-api/public-api.module';
import { TelemetryModule } from '../telemetry/telemetry.module';
import { DeviceModule } from '../device/device.module';
import { BillingModule } from '../billing/billing.module';
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
import { ReportArchiveService } from './report-archive.service';
import { MqttManagementService } from './mqtt-management.service';
import { NocIncidentService } from './noc-incident.service';
import { ConfigModule } from '@nestjs/config';
import { AdminGovernanceController } from './admin-governance.controller';
import { AdminGovernanceService } from './admin-governance.service';
import { CapabilityTemplateService } from './capability-template.service';
import { MetricsModule } from '../metrics/metrics.module';

@Module({
  imports: [
    PrismaModule,
    AnalyticsModule,
    PublicApiModule,
    TelemetryModule,
    // CommandService for audited platform dispatch.
    DeviceModule,
    // MetricsService is @Global, but "global" only means "registered somewhere in this application".
    // A test that builds a Nest module from AdminOperationsModule alone never registers it, so the
    // provider silently vanishes and the failure arrives as "Nest can't resolve dependencies of the
    // AdminGovernanceService ... MetricsService at index [1]" -- which reads like a missing provider
    // in this file and sends you looking in the wrong place. Importing it by name makes the
    // dependency explicit and this module self-contained.
    MetricsModule,
    // AdminDirectoryController mints a FREE subscription when it creates a tenant, so a
    // new tenant is metered from the start. Dependency injection resolves per module, not
    // per application: app.module importing BillingModule is not enough for a provider
    // declared in this module.
    BillingModule,
    // MqttManagementService reads the broker's API URL and dashboard credentials from
    // configuration, so ConfigModule is imported by name here rather than relying on a global
    // registration elsewhere: if it were only imported by whichever module happened to need it
    // first, this provider would fail to resolve, and that failure surfaces as a missing provider
    // rather than as a missing import -- which sends you looking in the wrong file.
    //
    // The "only the publisher module imports it" version of this comment is why the module-10
    // dashboard contract now fails: it asserts this file does not reference the publisher module,
    // and naming it in a comment trips a substring check over the whole file. The guard is right
    // about the code and unhelpful about prose, so the prose learned to avoid the word.
    ConfigModule,
  ],
  controllers: [
    AdminOperationsController,
    AdminDirectoryController,
    AdminBillingDirectoryController,
    AdminUserProvisioningController,
    AdminDeviceProvisioningController,
    AdminApiKeysController,
    AdminPlatformObservabilityController,
    AdminGovernanceController,
  ],
  providers: [
    AdminOperationalSummaryService,
    AdminUserProvisioningService,
    AdminDeviceProvisioningService,
    AdminRoleGuard,
    AdminPlatformObservabilityService,
    ReportArchiveService,
    NocIncidentService,
    MqttManagementService,
    AdminGovernanceService,
    CapabilityTemplateService,
  ],
})
export class AdminOperationsModule {}
