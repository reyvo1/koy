import {
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantContextGuard } from '../users/guards/tenant-context.guard';
import { TelemetryService } from './telemetry.service';
import { DeviceAccessGuard, RequireDeviceAccess } from '../device/device-access.guard';

@Controller('devices/:deviceId/telemetry')
@UseGuards(JwtAuthGuard, TenantContextGuard, DeviceAccessGuard)
export class TelemetryController {
  constructor(private readonly telemetryService: TelemetryService) {}

  @Get('latest')
  @RequireDeviceAccess('VIEW')
  async getLatest(
    @Request() request: any,
    @Param('deviceId') deviceId: string,
  ) {
    return this.telemetryService.getLatest(
      request.user.tenantContext.tenantId,
      deviceId,
    );
  }

  @Get('history')
  @RequireDeviceAccess('VIEW')
  async getHistory(
    @Request() request: any,
    @Param('deviceId') deviceId: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('cursor') cursor?: string,
  ) {
    return this.telemetryService.getHistory(
      request.user.tenantContext.tenantId,
      deviceId,
      limit,
      cursor,
    );
  }
}
