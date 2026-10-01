import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DeviceShareController } from './device-share.controller';
import { DeviceShareService } from './device-share.service';

@Module({
  imports: [PrismaModule],
  controllers: [DeviceShareController],
  providers: [DeviceShareService],
  exports: [DeviceShareService],
})
export class SharingModule {}
