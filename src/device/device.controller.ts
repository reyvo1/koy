import { Controller, Get, Post, Patch, Param, Body, UseGuards, Request } from '@nestjs/common';
import { DeviceService } from './device.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantContextGuard } from '../users/guards/tenant-context.guard';
import {
  RbacPermissionGuard,
  RequirePermission,
} from '../rbac/rbac-permission.guard';
import { CreateDeviceDto, AssignOwnerDto } from './dto/device.dto';
import { DeviceAccessGuard, RequireDeviceAccess } from './device-access.guard';

@Controller('devices')
@UseGuards(JwtAuthGuard, TenantContextGuard, RbacPermissionGuard, DeviceAccessGuard)
export class DeviceController {
  constructor(private deviceService: DeviceService) {}

  @Post(':id/provision')
  @RequirePermission('device.provision')
  async provision(@Request() req: any, @Param('id') id: string) {
    return this.deviceService.provision(req.user.tenantContext.tenantId, id);
  }

  @Patch(':id/owner')
  @RequirePermission('device.assignOwner')
  async assignOwner(@Request() req: any, @Param('id') id: string, @Body() dto: AssignOwnerDto) {
    return this.deviceService.assignOwner(req.user.tenantContext.tenantId, id, dto.userId);
  }

  @Patch(':id/revoke')
  @RequirePermission('device.update')
  async revoke(@Request() req: any, @Param('id') id: string) {
    return this.deviceService.revoke(req.user.tenantContext.tenantId, id);
  }

  @Get()
  async findAll(@Request() req: any) {
    return this.deviceService.findAll(req.user.tenantContext.tenantId, {
      userId: req.user.userId,
      membershipId: req.user.tenantContext.membershipId,
      role: req.user.tenantContext.role,
    });
  }

  @Get(':id')
  @RequireDeviceAccess('VIEW')
  async findOne(@Request() req: any, @Param('id') id: string) {
    return this.deviceService.findOne(req.user.tenantContext.tenantId, id);
  }

  @Get(':id/health')
  @RequireDeviceAccess('VIEW')
  async health(@Request() req: any, @Param('id') id: string) {
    return this.deviceService.checkHealth(req.user.tenantContext.tenantId, id);
  }

  @Post()
  @RequirePermission('device.update')
  async create(@Request() req: any, @Body() dto: CreateDeviceDto) {
    return this.deviceService.create(req.user.tenantContext.tenantId, dto);
  }
}
