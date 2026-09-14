import { Controller, Post, Get, Param, Body, Query, UseGuards, Request } from '@nestjs/common';
import { CommandService } from './command.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantContextGuard } from '../users/guards/tenant-context.guard';
import { CreateCommandDto } from './dto/create-command.dto';
import { DeviceAccessGuard, RequireDeviceAccess } from './device-access.guard';

@Controller('devices/:id/commands')
@UseGuards(JwtAuthGuard, TenantContextGuard, DeviceAccessGuard)
export class CommandController {
  constructor(private commandService: CommandService) {}

  @Post()
  @RequireDeviceAccess('CONTROL')
  async publish(@Request() req: any, @Param('id') deviceId: string, @Body() body: CreateCommandDto) {
    return this.commandService.publish(req.user.tenantContext.tenantId, deviceId, body.payload, body.idempotencyKey);
  }

  @Get()
  @RequireDeviceAccess('VIEW')
  async getHistory(@Request() req: any, @Param('id') deviceId: string, @Query('limit') limit?: any, @Query('offset') offset?: any) {
    return this.commandService.getHistory(req.user.tenantContext.tenantId, deviceId, limit, offset);
  }

  @Get(':commandId')
  @RequireDeviceAccess('VIEW')
  async getCommand(
    @Request() req: any,
    @Param('id') deviceId: string,
    @Param('commandId') commandId: string,
  ) {
    return this.commandService.getByCorrelationId(
      req.user.tenantContext.tenantId,
      deviceId,
      commandId,
    );
  }
}
