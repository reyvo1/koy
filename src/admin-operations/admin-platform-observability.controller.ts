import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantContextGuard } from '../users/guards/tenant-context.guard';
import { AdminRoleGuard } from './admin-role.guard';
import { PlatformRoleGuard } from './platform-role.guard';
import { AdminPlatformObservabilityService } from './admin-platform-observability.service';

@ApiTags('admin-platform-observability')
@ApiBearerAuth()
@ApiHeader({
  name: 'X-Tenant-Id',
  required: true,
  description: 'Trusted active tenant context; platform role is still required',
})
@Controller('admin')
@UseGuards(JwtAuthGuard, TenantContextGuard, AdminRoleGuard, PlatformRoleGuard)
export class AdminPlatformObservabilityController {
  constructor(private readonly platform: AdminPlatformObservabilityService) {}

  @Get('platform-device-groups')
  @ApiOperation({ summary: 'Read bounded device-group directory across tenants' })
  async listDeviceGroups(@Query('tenantId') tenantId?: string) {
    return this.platform.listDeviceGroups(tenantId?.trim() || undefined);
  }

  @Get('platform-device-credentials')
  @ApiOperation({ summary: 'Read non-secret device credential metadata across tenants' })
  async listDeviceCredentials(@Query('tenantId') tenantId?: string) {
    return this.platform.listDeviceCredentials(tenantId?.trim() || undefined);
  }

  @Get('platform-commands')
  @ApiOperation({ summary: 'Read platform command queue/ACK/history without dispatch capability' })
  async listCommands(
    @Query('tenantId') tenantId?: string,
    @Query('deviceId') deviceId?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
  ) {
    return this.platform.listCommands({ tenantId, deviceId, status, limit });
  }

  @Get('platform-telemetry/explorer')
  @ApiOperation({ summary: 'Explore bounded telemetry evidence for a selected platform device' })
  async exploreTelemetry(
    @Query('deviceId') deviceId?: string,
    @Query('capability') capability?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    return this.platform.exploreTelemetry({ deviceId, capability, from, to, limit });
  }

  @Get('platform-reports/tenant-summary')
  @ApiOperation({ summary: 'Read bounded cross-tenant operational report rows' })
  async tenantSummary(@Query('hours') hours?: string) {
    return this.platform.getTenantSummaryReport(hours);
  }
}
