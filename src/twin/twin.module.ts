import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DeviceTwinService } from './device-twin.service';

/**
 * Wave 12 -- the digital twin as reconciliation (ADR-011).
 *
 * No simulation engine ships here. This compares what the platform believes against what the device last
 * reported, and it is allowed to say it does not know.
 */
@Module({
  imports: [PrismaModule],
  providers: [DeviceTwinService],
  exports: [DeviceTwinService],
})
export class TwinModule {}