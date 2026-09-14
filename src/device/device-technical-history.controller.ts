import { Controller, Get, Param, Request, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantContextGuard } from '../users/guards/tenant-context.guard';
import { DeviceAccessGuard, RequireDeviceAccess } from './device-access.guard';
import { DeviceTechnicalHistoryService } from './device-technical-history.service';

@ApiTags('devices')
@ApiBearerAuth()
@ApiHeader({
  name: 'X-Tenant-Id',
  required: true,
  description: 'Trusted tenant selector validated against active membership',
})
@Controller('devices/:deviceId/technical-history')
@UseGuards(JwtAuthGuard, TenantContextGuard, DeviceAccessGuard)
export class DeviceTechnicalHistoryController {
  constructor(private readonly technicalHistory: DeviceTechnicalHistoryService) {}

  @Get()
  @RequireDeviceAccess('VIEW')
  @ApiOperation({
    summary: 'Read bounded firmware/update/findings evidence for Device Detail',
  })
  @ApiResponse({ status: 200, description: 'Truthful bounded technical evidence' })
  async read(@Request() request: any, @Param('deviceId') deviceId: string) {
    return this.technicalHistory.read(
      request.user.tenantContext.tenantId,
      deviceId,
    );
  }
}
