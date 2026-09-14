import { Module } from '@nestjs/common';
import { DeviceModule } from '../device/device.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AccessibleSpaceController } from './accessible-space.controller';
import { AccessibleSpaceService } from './accessible-space.service';
import { SpaceHierarchyService } from './space-hierarchy.service';
import { SpaceController } from './space.controller';

@Module({
  imports: [PrismaModule, DeviceModule],
  controllers: [SpaceController, AccessibleSpaceController],
  providers: [SpaceHierarchyService, AccessibleSpaceService],
  exports: [SpaceHierarchyService, AccessibleSpaceService],
})
export class SpaceModule {}
