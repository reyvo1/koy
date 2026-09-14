import { Controller, Get, Post, Param, Body, UseGuards, Request, UsePipes, ValidationPipe } from '@nestjs/common';
import { CapabilityService } from './capability.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantContextGuard } from '../users/guards/tenant-context.guard';
import { CreateCapabilityDto } from './dto/create-capability.dto';
import { DeviceAccessGuard, RequireDeviceAccess } from './device-access.guard';
import { RbacPermissionGuard, RequirePermission } from '../rbac/rbac-permission.guard';

@Controller('devices/:deviceId/capabilities')
@UseGuards(JwtAuthGuard, TenantContextGuard, RbacPermissionGuard, DeviceAccessGuard)
export class CapabilityController {
  constructor(private capabilityService: CapabilityService) {}

  @Post()
  @RequirePermission('device.update')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async create(@Request() req: any, @Param('deviceId') deviceId: string, @Body() dto: CreateCapabilityDto) {
    return this.capabilityService.create(req.user.tenantContext.tenantId, deviceId, dto);
  }

  @Get()
  @RequireDeviceAccess('VIEW')
  async findAll(@Request() req: any, @Param('deviceId') deviceId: string) {
    return this.capabilityService.findAll(req.user.tenantContext.tenantId, deviceId);
  }
}
