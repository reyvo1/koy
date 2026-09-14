import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SceneModule } from '../scene/scene.module';
import { ScheduleController } from './schedule.controller';
import { ScheduleDomainValidator } from './schedule-domain.validator';
import { ScheduleDueRunService } from './schedule-due-run.service';
import { ScheduleRuntimeWorker } from './schedule-runtime.worker';

@Module({
  imports: [PrismaModule, SceneModule],
  controllers: [ScheduleController],
  providers: [ScheduleDomainValidator, ScheduleDueRunService, ScheduleRuntimeWorker],
  exports: [ScheduleDomainValidator, ScheduleDueRunService],
})
export class SchedulerModule {}
