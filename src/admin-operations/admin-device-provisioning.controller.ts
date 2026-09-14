import { Body, Controller, Get, Param, Patch, Post, Query, Request, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { DeviceStatus } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantContextGuard } from '../users/guards/tenant-context.guard';
import { PrismaService } from '../prisma/prisma.service';
import { AdminRoleGuard } from './admin-role.guard';
import { PlatformRoleGuard } from './platform-role.guard';
import { AdminDeviceProvisioningService } from './admin-device-provisioning.service';
import { AdminUserProvisioningService } from './admin-user-provisioning.service';
import {
  PlatformProvisionDeviceDto,
  TenantProvisionDeviceDto,
} from './dto/admin-user-management.dto';
import { AdminOperationsRequest } from './admin-operational-summary.types';
import {
  DomainNotFoundException,
} from '../common/errors/domain-exceptions';
import { ERROR_CODES } from '../common/errors/error-code';
import { TelemetryAggregationService } from '../telemetry/telemetry-aggregation.service';

@ApiTags('admin-operations')
@ApiBearerAuth()
@ApiHeader({
  name: 'X-Tenant-Id',
  required: true,
  description: 'Trusted tenant selector validated against active membership',
})
@Controller('admin')
export class AdminDeviceProvisioningController {
  constructor(
    private readonly devices: AdminDeviceProvisioningService,
    private readonly users: AdminUserProvisioningService,
    private readonly prisma: PrismaService,
    private readonly telemetryAggregation: TelemetryAggregationService,
  ) {}

  @Patch('platform-devices/:deviceId/revoke')
  @UseGuards(JwtAuthGuard, TenantContextGuard, AdminRoleGuard, PlatformRoleGuard)
  @ApiOperation({ summary: 'Deactivate any device (platform admin)' })
  async revokePlatformDevice(@Param('deviceId') deviceId: string) {
    const device = await this.prisma.device.findUnique({
      where: { id: deviceId },
      select: { id: true, status: true },
    });
    if (!device) {
      throw new DomainNotFoundException(ERROR_CODES.NotFound, 'Perangkat tidak ditemukan');
    }
    await this.prisma.device.update({
      where: { id: deviceId },
      data: { status: DeviceStatus.REVOKED },
    });
    return { id: deviceId, status: DeviceStatus.REVOKED, message: 'Perangkat dinonaktifkan' };
  }

  @Get('platform-capabilities')
  @UseGuards(JwtAuthGuard, TenantContextGuard, AdminRoleGuard, PlatformRoleGuard)
  @ApiOperation({ summary: 'Capability registry across tenants (platform admin)' })
  async listPlatformCapabilities() {
    const caps = await this.prisma.capability.findMany({
      orderBy: [{ key: 'asc' }, { id: 'asc' }],
      take: 400,
      select: {
        id: true,
        key: true,
        semanticType: true,
        dataType: true,
        isReadable: true,
        isWritable: true,
        isReportable: true,
        unit: true,
        constraints: true,
        schemaVersion: true,
        createdAt: true,
        updatedAt: true,
        device: { select: { id: true, name: true, tenant: { select: { name: true } } } },
      },
    });
    return {
      total: caps.length,
      items: caps.map((cap) => ({
        id: cap.id,
        key: cap.key,
        semanticType: cap.semanticType,
        dataType: cap.dataType,
        isReadable: cap.isReadable,
        isWritable: cap.isWritable,
        isReportable: cap.isReportable,
        unit: cap.unit,
        constraints: cap.constraints,
        schemaVersion: cap.schemaVersion,
        createdAt: cap.createdAt.toISOString(),
        updatedAt: cap.updatedAt.toISOString(),
        deviceId: cap.device?.id ?? null,
        deviceName: cap.device?.name ?? null,
        tenantName: cap.device?.tenant?.name ?? null,
      })),
    };
  }

  @Get('platform-devices/:deviceId/telemetry/aggregate')
  @UseGuards(JwtAuthGuard, TenantContextGuard, AdminRoleGuard, PlatformRoleGuard)
  @ApiOperation({ summary: 'Read telemetry aggregate for any platform device (platform admin)' })
  async getPlatformTelemetryAggregate(
    @Param('deviceId') deviceId: string,
    @Query('capability') capability?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('bucket') bucket?: string,
  ) {
    const device = await this.prisma.device.findUnique({
      where: { id: deviceId },
      select: { tenantId: true },
    });
    if (!device) {
      throw new DomainNotFoundException(ERROR_CODES.NotFound, 'Perangkat tidak ditemukan');
    }
    return this.telemetryAggregation.getAggregate(
      device.tenantId,
      deviceId,
      capability,
      from,
      to,
      bucket,
    );
  }

  @Get('platform-devices')
  @UseGuards(JwtAuthGuard, TenantContextGuard, AdminRoleGuard, PlatformRoleGuard)
  @ApiOperation({ summary: 'List devices across tenants (platform admin)' })
  async listPlatformDevices(@Query('tenantId') tenantId?: string) {
    return this.devices.listDevices(tenantId || undefined);
  }

  @Post('platform-devices')
  @UseGuards(JwtAuthGuard, TenantContextGuard, AdminRoleGuard, PlatformRoleGuard)
  @ApiOperation({ summary: 'Provision a device with one-time claim token (platform admin)' })
  async provisionPlatformDevice(@Body() dto: PlatformProvisionDeviceDto) {
    return this.devices.provisionDevice({
      tenantId: dto.tenantId,
      name: dto.name,
      type: dto.type,
    });
  }

  @Get('tenant-devices')
  @UseGuards(JwtAuthGuard, TenantContextGuard, AdminRoleGuard)
  @ApiOperation({ summary: 'List devices of the active tenant (tenant admin)' })
  async listTenantDevices(@Request() request: AdminOperationsRequest) {
    return this.devices.listDevices(request.user.tenantContext.tenantId);
  }

  @Post('tenant-devices')
  @UseGuards(JwtAuthGuard, TenantContextGuard, AdminRoleGuard)
  @ApiOperation({ summary: 'Provision a device in the active tenant (tenant admin)' })
  async provisionTenantDevice(
    @Request() request: AdminOperationsRequest,
    @Body() dto: TenantProvisionDeviceDto,
  ) {
    return this.devices.provisionDevice({
      tenantId: request.user.tenantContext.tenantId,
      name: dto.name,
      type: dto.type,
    });
  }

  @Get('platform-findings')
  @UseGuards(JwtAuthGuard, TenantContextGuard, AdminRoleGuard, PlatformRoleGuard)
  @ApiOperation({ summary: 'List analytics findings across tenants (platform admin)' })
  async listPlatformFindings(@Query('limit') limit?: string) {
    const parsed = Number.parseInt(limit ?? '', 10);
    return this.users.listAllFindings(Number.isNaN(parsed) ? undefined : parsed);
  }
}
