import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DeviceShareService } from './device-share.service';

@Module({
  imports: [PrismaModule],
  providers: [DeviceShareService],
  exports: [DeviceShareService],
})
export class SharingModule {}
