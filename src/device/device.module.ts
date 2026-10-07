import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DeviceService } from './device.service';
import { DeviceController } from './device.controller';
import { DevicePublicController } from './device-public.controller';
import { CommandService } from './command.service';
import { CommandController } from './command.controller';
import { CapabilityService } from './capability.service';
import { CapabilityController } from './capability.controller';
import { DeviceGroupController } from './device-group.controller';
import { CapabilityValidator } from './capability.validator';
import { PrismaModule } from '../prisma/prisma.module';
import { MqttModule } from '../mqtt/mqtt.module';
import { CommandTimeoutScheduler } from './command-timeout.scheduler';
import { RbacModule } from '../rbac/rbac.module';
import { SharingModule } from '../sharing/sharing.module';
import { WebhookModule } from '../webhook/webhook.module';
import { DeviceAccessGuard } from './device-access.guard';
import { DeviceAccessService } from './device-access.service';
import { DeviceTechnicalHistoryController } from './device-technical-history.controller';
import { DeviceTechnicalHistoryService } from './device-technical-history.service';
import { DeviceCommandLogService } from './device-command-log.service';
import { DeviceLocationService } from './device-location.service';
import { BillingModule } from '../billing/billing.module';

@Module({
  // BillingModule is required for the device quota check in DeviceController.create.
  // forwardRef: BillingModule does not import DeviceModule today, but a direct import
  // would create a cycle the moment billing gains any device-aware read.
  imports: [
    ConfigModule,
    PrismaModule,
    RbacModule,
    SharingModule,
    WebhookModule,
    forwardRef(() => MqttModule),
    forwardRef(() => BillingModule),
  ],
  controllers: [DeviceController, DevicePublicController, CommandController, CapabilityController, DeviceGroupController, DeviceTechnicalHistoryController],
  providers: [DeviceService, CommandService, CapabilityService, CapabilityValidator, CommandTimeoutScheduler, DeviceAccessService, DeviceAccessGuard, DeviceTechnicalHistoryService, DeviceCommandLogService, DeviceLocationService],
  exports: [DeviceLocationService, DeviceService, CommandService, CapabilityService, CapabilityValidator, DeviceAccessService, DeviceAccessGuard, DeviceTechnicalHistoryService],
})
export class DeviceModule {}
