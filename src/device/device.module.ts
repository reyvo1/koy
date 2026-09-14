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
import { DeviceAccessGuard } from './device-access.guard';
import { DeviceAccessService } from './device-access.service';
import { DeviceTechnicalHistoryController } from './device-technical-history.controller';
import { DeviceTechnicalHistoryService } from './device-technical-history.service';

@Module({
  imports: [ConfigModule, PrismaModule, RbacModule, SharingModule, forwardRef(() => MqttModule)],
  controllers: [DeviceController, DevicePublicController, CommandController, CapabilityController, DeviceGroupController, DeviceTechnicalHistoryController],
  providers: [DeviceService, CommandService, CapabilityService, CapabilityValidator, CommandTimeoutScheduler, DeviceAccessService, DeviceAccessGuard, DeviceTechnicalHistoryService],
  exports: [DeviceService, CommandService, CapabilityService, CapabilityValidator, DeviceAccessService, DeviceAccessGuard, DeviceTechnicalHistoryService],
})
export class DeviceModule {}
