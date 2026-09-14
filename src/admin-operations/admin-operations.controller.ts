import {
  Controller,
  Get,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantContextGuard } from '../users/guards/tenant-context.guard';
import { AnalyticsIngestionService } from '../analytics/analytics-ingestion.service';
import { AdminOperationalSummaryService } from './admin-operational-summary.service';
import { AdminOperationsRequest } from './admin-operational-summary.types';
import { AdminRoleGuard } from './admin-role.guard';

const MAX_FINDINGS_QUERY_LIMIT = 100;

@ApiTags('admin-operations')
@ApiBearerAuth()
@ApiHeader({
  name: 'X-Tenant-Id',
  required: true,
  description: 'Trusted tenant selector validated against active membership',
})
@Controller('admin')
@UseGuards(JwtAuthGuard, TenantContextGuard, AdminRoleGuard)
export class AdminOperationsController {
  constructor(
    private readonly summary: AdminOperationalSummaryService,
    private readonly analytics: AnalyticsIngestionService,
  ) {}

  @Get('operational-summary')
  @ApiOperation({ summary: 'Read a bounded tenant operational summary' })
  @ApiResponse({ status: 200, description: 'Tenant operational summary' })
  @ApiResponse({ status: 403, description: 'Active ADMIN membership required' })
  async getOperationalSummary(@Request() request: AdminOperationsRequest) {
    return this.summary.summarize(request.user.tenantContext.tenantId);
  }

  @Get('analytics-findings')
  @ApiOperation({
    summary: 'List recent provider-neutral analytics findings (Module 16)',
  })
  @ApiResponse({ status: 200, description: 'Bounded recent findings list' })
  @ApiResponse({ status: 403, description: 'Active ADMIN membership required' })
  async getAnalyticsFindings(
    @Request() request: AdminOperationsRequest,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = Number.parseInt(limit ?? '', 10);
    const boundedLimit =
      Number.isNaN(parsedLimit) || parsedLimit < 1
        ? 50
        : Math.min(parsedLimit, MAX_FINDINGS_QUERY_LIMIT);

    return this.analytics.listRecent(
      request.user.tenantContext.tenantId,
      boundedLimit,
    );
  }
}
