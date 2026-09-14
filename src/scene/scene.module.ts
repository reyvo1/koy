import { Module } from '@nestjs/common';
import { DeviceModule } from '../device/device.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SceneController } from './scene.controller';
import { SceneExecutionService } from './scene-execution.service';
import { SceneRepository } from './scene.repository';

@Module({
  imports: [PrismaModule, DeviceModule],
  controllers: [SceneController],
  providers: [SceneRepository, SceneExecutionService],
  exports: [SceneRepository],
})
export class SceneModule {}
