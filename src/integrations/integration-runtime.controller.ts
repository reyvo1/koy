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
import { AdminRoleGuard } from '../admin-operations/admin-role.guard';
import { IntegrationRuntimeService } from './integration-runtime.service';
@Controller('admin/integrations')
@UseGuards(JwtAuthGuard, TenantContextGuard, AdminRoleGuard)
export class IntegrationRuntimeController {
  constructor(private readonly runtime: IntegrationRuntimeService) {}
  @Get(':integrationId/runtime')
  async status(@Request() req: any, @Param('integrationId') id: string) {
    return this.runtime.status(req.user.tenantContext.tenantId, id);
  }
  @Post(':integrationId/connect')
  async connect(@Request() req: any, @Param('integrationId') id: string) {
    return this.runtime.connect(req.user.tenantContext.tenantId, id);
  }
  @Post(':integrationId/sync')
  async sync(
    @Request() req: any,
    @Param('integrationId') id: string,
    @Body() body: { deviceId?: unknown },
  ) {
    return this.runtime.syncDevice(
      req.user.tenantContext.tenantId,
      id,
      body?.deviceId,
    );
  }
  @Post(':integrationId/disconnect')
  async disconnect(@Request() req: any, @Param('integrationId') id: string) {
    return this.runtime.disable(req.user.tenantContext.tenantId, id);
  }
}
