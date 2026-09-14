import { Module } from '@nestjs/common';
import { CameraOnboardingService } from './camera-onboarding.service';
import {
  CameraOnboardingController,
  CameraPairPublicController,
} from './camera-onboarding.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CameraOnboardingController, CameraPairPublicController],
  providers: [CameraOnboardingService],
  exports: [CameraOnboardingService],
})
export class CameraOnboardingModule {}
