import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantContextGuard } from '../users/guards/tenant-context.guard';
import { CameraOnboardingService } from './camera-onboarding.service';
import { CreateCameraDto, CameraPairDto } from './dto/camera.dto';

/**
 * Tenant-authorized camera onboarding endpoints.
 * Pairing itself is device-authorized (camera password), mirroring devices/:id/pair.
 */
@Controller('cameras')
@UseGuards(JwtAuthGuard, TenantContextGuard)
export class CameraOnboardingController {
  constructor(private cameraService: CameraOnboardingService) {}

  @Post()
  async register(@Request() req: any, @Body() dto: CreateCameraDto) {
    return this.cameraService.register(req.user.tenantContext.tenantId, dto);
  }

  @Get()
  async list(@Request() req: any) {
    return this.cameraService.listCameras(
      req.user.tenantContext.tenantId,
    );
  }

  @Get(':id')
  async findOne(@Request() req: any, @Param('id') id: string) {
    return this.cameraService.findOneCamera(
      req.user.tenantContext.tenantId,
      id,
    );
  }
}

/** Device-side pairing endpoint (scanned QR token + device password auth). */
@Controller('cameras')
export class CameraPairPublicController {
  constructor(private cameraService: CameraOnboardingService) {}

  @Post(':id/pair')
  async pair(
    @Param('id') id: string,
    @Body() dto: CameraPairDto & { password?: string },
  ) {
    return this.cameraService.pair(id, dto.token, dto.password ?? 'camera-paired');
  }
}
