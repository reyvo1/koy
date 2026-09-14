import {
  Controller,
  Get,
  Param,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantContextGuard } from '../users/guards/tenant-context.guard';
import { TelemetryAggregationService } from './telemetry-aggregation.service';
import { DeviceAccessGuard, RequireDeviceAccess } from '../device/device-access.guard';

@Controller('devices/:deviceId/telemetry')
@UseGuards(JwtAuthGuard, TenantContextGuard, DeviceAccessGuard)
export class TelemetryAggregationController {
  constructor(
    private readonly telemetryAggregationService: TelemetryAggregationService,
  ) {}

  @Get('aggregate')
  @RequireDeviceAccess('VIEW')
  async getAggregate(
    @Request() request: any,
    @Param('deviceId') deviceId: string,
    @Query('capability') capability?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('bucket') bucket?: string,
  ) {
    return this.telemetryAggregationService.getAggregate(
      request.user.tenantContext.tenantId,
      deviceId,
      capability,
      from,
      to,
      bucket,
    );
  }
}
