import { Module } from '@nestjs/common';
import { DeviceModule } from '../device/device.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AutomationCommandDispatcher } from './automation-command-dispatcher';
import { AutomationController } from './automation.controller';
import { AutomationEvaluator } from './automation-evaluator';
import { AutomationExecutionRepository } from './automation-execution.repository';
import { AutomationExecutionTransitionRepository } from './automation-execution-transition.repository';
import { AutomationRepository } from './automation.repository';
import { AutomationRuntimeReadRepository } from './automation-runtime-read.repository';
import { AutomationRetryReservationService } from './automation-retry-reservation.service';
import { AutomationRetryWorker } from './automation-retry.worker';
import { AutomationTelemetryCoordinator } from './automation-telemetry-coordinator';

@Module({
  imports: [PrismaModule, DeviceModule],
  providers: [
    AutomationCommandDispatcher,
    AutomationEvaluator,
    AutomationExecutionRepository,
    AutomationExecutionTransitionRepository,
    AutomationRepository,
    AutomationRetryReservationService,
    AutomationRetryWorker,
    AutomationRuntimeReadRepository,
    AutomationTelemetryCoordinator,
  ],
  controllers: [AutomationController],
  exports: [
    AutomationCommandDispatcher,
    AutomationEvaluator,
    AutomationExecutionRepository,
    AutomationExecutionTransitionRepository,
    AutomationRepository,
  ],
})
export class AutomationModule {}
