import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
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
import { RbacPermissionGuard, RequirePermission } from '../rbac/rbac-permission.guard';
import { TenantContextGuard } from '../users/guards/tenant-context.guard';
import { DashboardRequest } from './dashboard-request-context';
import { DashboardService } from './dashboard.service';
import { CreateDashboardDto, ReplaceDashboardDto } from './dto/dashboard.dto';

@ApiTags('dashboards')
@ApiBearerAuth()
@ApiHeader({
  name: 'X-Tenant-Id',
  required: true,
  description: 'Trusted tenant selector validated against active membership',
})
@Controller('dashboards')
@UseGuards(JwtAuthGuard, TenantContextGuard, RbacPermissionGuard)
// Every route declares a permission. `allowOwner` on the addressed routes lets the owner through
// while DashboardRepository keeps its existing audience rule: PERSONAL is owner-only and
// TENANT_SHARED still needs an admin role. The guard is strictly wider than the repository for a
// TENANT_SHARED dashboard, and the repository remains the authority, so this adds the audit trail
// and a tenant-scoped second check without changing who may act.
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Post()
  @RequirePermission('dashboard.create')
  @ApiOperation({ summary: 'Create a personal or tenant-shared dashboard' })
  @ApiResponse({ status: 201, description: 'Dashboard created' })
  @ApiResponse({ status: 403, description: 'Shared dashboard admin required' })
  async create(
    @Request() request: DashboardRequest,
    @Body() dto: CreateDashboardDto,
  ) {
    return this.service.create(this.context(request), dto);
  }

  @Get()
  @RequirePermission('dashboard.read')
  @ApiOperation({ summary: 'List personal and readable shared dashboards' })
  @ApiResponse({ status: 200, description: 'Bounded dashboard summaries' })
  async list(
    @Request() request: DashboardRequest,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.service.list(this.context(request), limit);
  }

  @Get(':dashboardId/resolution')
  @RequirePermission('dashboard.read', { allowOwner: true })
  @ApiOperation({
    summary: 'Resolve dashboard widgets against capability metadata',
  })
  @ApiResponse({
    status: 200,
    description: 'Capability-driven widget resolution plan',
  })
  @ApiResponse({ status: 404, description: 'Dashboard not found' })
  async resolve(
    @Request() request: DashboardRequest,
    @Param('dashboardId') dashboardId: string,
  ) {
    return this.service.resolve(this.context(request), dashboardId);
  }

  @Get(':dashboardId/widgets/:widgetId/data')
  @RequirePermission('dashboard.read', { allowOwner: true })
  @ApiOperation({
    summary: 'Execute bounded telemetry queries for one resolved widget',
  })
  @ApiResponse({
    status: 200,
    description: 'Tenant-isolated widget telemetry data',
  })
  @ApiResponse({ status: 404, description: 'Dashboard or widget not found' })
  async queryWidgetData(
    @Request() request: DashboardRequest,
    @Param('dashboardId') dashboardId: string,
    @Param('widgetId') widgetId: string,
  ) {
    return this.service.queryWidgetData(
      this.context(request),
      dashboardId,
      widgetId,
    );
  }

  @Get(':dashboardId')
  @RequirePermission('dashboard.read', { allowOwner: true })
  @ApiOperation({ summary: 'Read an authorized dashboard aggregate' })
  @ApiResponse({ status: 200, description: 'Dashboard aggregate' })
  @ApiResponse({ status: 404, description: 'Dashboard not found' })
  async findOne(
    @Request() request: DashboardRequest,
    @Param('dashboardId') dashboardId: string,
  ) {
    return this.service.findOne(this.context(request), dashboardId);
  }

  @Put(':dashboardId')
  @RequirePermission('dashboard.update', { allowOwner: true })
  @ApiOperation({ summary: 'Replace an authorized dashboard aggregate' })
  @ApiResponse({ status: 200, description: 'Dashboard updated' })
  @ApiResponse({ status: 409, description: 'Revision conflict' })
  async replace(
    @Request() request: DashboardRequest,
    @Param('dashboardId') dashboardId: string,
    @Body() dto: ReplaceDashboardDto,
  ) {
    return this.service.replace(this.context(request), dashboardId, dto);
  }

  private context(request: DashboardRequest) {
    return {
      ...request.user.tenantContext,
      userId: request.user.userId,
    };
  }

  @Delete(':dashboardId')
  @RequirePermission('dashboard.delete', { allowOwner: true })
  @ApiOperation({ summary: 'Delete an authorized dashboard aggregate' })
  @ApiResponse({ status: 200, description: 'Dashboard deleted' })
  @ApiResponse({ status: 409, description: 'Revision conflict' })
  async delete(
    @Request() request: DashboardRequest,
    @Param('dashboardId') dashboardId: string,
    @Query('expectedRevision', ParseIntPipe) expectedRevision: number,
  ) {
    return this.service.delete(
      this.context(request),
      dashboardId,
      expectedRevision,
    );
  }
}
