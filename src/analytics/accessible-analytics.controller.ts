import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantContextGuard } from '../users/guards/tenant-context.guard';
import { AccessibleAnalyticsService } from './accessible-analytics.service';

@ApiTags('analytics')
@ApiBearerAuth()
@ApiHeader({
  name: 'X-Tenant-Id',
  required: true,
  description: 'Trusted tenant selector validated against active membership',
})
@Controller('analytics/alerts')
@UseGuards(JwtAuthGuard, TenantContextGuard)
export class AccessibleAnalyticsController {
  constructor(private readonly accessibleAnalytics: AccessibleAnalyticsService) {}

  @Get('accessible')
  @ApiOperation({
    summary: 'List WARNING/CRITICAL analytics findings for accessible devices',
  })
  @ApiResponse({ status: 200, description: 'Authorized analytics alert read model' })
  async list(@Request() request: any, @Query('limit') rawLimit?: string) {
    const parsed = Number.parseInt(rawLimit ?? '50', 10);
    const limit = Number.isFinite(parsed) ? parsed : 50;
    return this.accessibleAnalytics.listAlerts(
      {
        tenantId: request.user.tenantContext.tenantId,
        membershipId: request.user.tenantContext.membershipId,
        userId: request.user.userId,
        role: request.user.tenantContext.role,
      },
      limit,
    );
  }
}
