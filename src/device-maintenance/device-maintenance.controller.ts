import { MaintenancePlanService } from './maintenance-plan.service';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Patch,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MaintenanceStatus } from '@prisma/client';

import { DomainBadRequestException } from '../common/errors/domain-exceptions';
import { ERROR_CODES } from '../common/errors/error-code';
import { AdminRoleGuard } from '../admin-operations/admin-role.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantContextGuard } from '../users/guards/tenant-context.guard';
import {
  DeviceMaintenanceService,
  type MaintenanceWindowRow,
} from './device-maintenance.service';
import {
  isMaintenanceStatus,
  openMaintenanceBody,
  resolveMaintenanceBody,
} from './device-maintenance.dto';

/**
 * The default is named here rather than reached for inside the service's signature, because a
 * defaulted parameter typed as its literal (`limit = 50` infers `50`, not `number`) silently refuses
 * every value a caller computes. The constant keeps the type `number`.
 */
const MAINTENANCE_DEFAULT_LIMIT = 50;

export interface MaintenanceRequest {
  user: {
    userId: string;
    tenantContext: { tenantId: string; membershipId: string; role: string };
  };
}

/**
 * Technician maintenance, REST surface.
 *
 * ## Gating: `AdminRoleGuard`, not `@RequirePermission`
 *
 * A maintenance window does not have an owner — the device does, but the device's owner is who uses
 * it, not who maintains it, and a device may legitimately need maintenance while its owner is
 * elsewhere. An owner-or-admin rule is therefore not expressible. Scene/Schedule are likewise
 * ownerless, but they derive VIEW/CONTROL from referenced devices instead of using this admin gate.
 *
 * It is still gated, because "any member may take a device off the floor" is not acceptable, and the
 * precedent for a tenant-wide action with wide blast radius is this one: role-gated and
 * tenant-scoped. The catalog has no `maintenance.*` permission, and inventing one would change the
 * authorisation contract rather than expose an existing one — so it is deliberately not done.
 *
 * ## Tenant scope
 *
 * Taken from the verified `tenantContext` and never from a body field. A caller that could name its
 * own tenant could open a window on, or resolve, a window belonging to another tenant.
 */
@ApiTags('device-maintenance')
@ApiBearerAuth()
@ApiHeader({
  name: 'X-Tenant-Id',
  required: true,
  description: 'Trusted tenant selector validated against active membership',
})
@Controller('device-maintenance')
@UseGuards(JwtAuthGuard, TenantContextGuard, AdminRoleGuard)
export class DeviceMaintenanceController {
  constructor(private readonly maintenance: DeviceMaintenanceService, private readonly plans: MaintenancePlanService) {}

  @Get('plans')
  async listPlans(@Request() req: MaintenanceRequest) { return this.plans.list(this.tenantId(req)); }
  @Post('plans')
  async createPlan(@Request() req: MaintenanceRequest, @Body() body: unknown) { return this.plans.create(req, body); }
  @Patch('plans/:planId')
  async updatePlan(@Request() req: MaintenanceRequest, @Param('planId') id: string, @Body() body: { enabled?: unknown }) { return this.plans.setEnabled(req, id, body?.enabled); }

  @Get()
  @ApiOperation({ summary: 'List this tenant’s maintenance windows' })
  async list(
    @Request() request: MaintenanceRequest,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
  ): Promise<{ items: MaintenanceWindowRow[]; total: number }> {
    // An unknown status is refused rather than dropped. Silently ignoring it returns every window
    // while the operator believes they are looking at one filtered set -- the same lie this domain
    // is meant not to tell.
    if (status !== undefined && status !== '' && !isMaintenanceStatus(status)) {
      throw new DomainBadRequestException(
        ERROR_CODES.BadRequest,
        `Unknown maintenance status "${status}". Accepted values: ${Object.values(MaintenanceStatus).join(', ')}.`,
      );
    }

    const parsedLimit = limit === undefined ? undefined : Number(limit);
    if (parsedLimit !== undefined && !Number.isInteger(parsedLimit)) {
      throw new DomainBadRequestException(ERROR_CODES.BadRequest, 'limit must be an integer.');
    }

    return this.maintenance.listForTenant(
      this.tenantId(request),
      (status as MaintenanceStatus | undefined) || undefined,
      parsedLimit ?? MAINTENANCE_DEFAULT_LIMIT,
    );
  }

  @Post('devices/:deviceId')
  @ApiOperation({ summary: 'Open a maintenance window for one device' })
  async open(
    @Request() request: MaintenanceRequest,
    @Param('deviceId') deviceId: string,
    @Body() body: unknown,
  ): Promise<MaintenanceWindowRow> {
    const dto = openMaintenanceBody(body);
    return this.maintenance.openForDevice(
      {
        tenantId: this.tenantId(request),
        deviceId,
        reason: dto.reason,
        userId: request.user.userId,
      },
      request.user.tenantContext.membershipId,
    );
  }

  @Delete(':maintenanceId')
  @ApiOperation({ summary: 'Resolve a maintenance window' })
  async resolve(
    @Request() request: MaintenanceRequest,
    @Param('maintenanceId') maintenanceId: string,
    @Body() body: unknown,
  ): Promise<MaintenanceWindowRow> {
    const dto = resolveMaintenanceBody(body);
    return this.maintenance.resolve(
      {
        tenantId: this.tenantId(request),
        maintenanceId,
        resolutionNote: dto.resolutionNote,
        userId: request.user.userId,
      },
      request.user.tenantContext.membershipId,
    );
  }

  private tenantId(request: MaintenanceRequest): string {
    const tenantId = request.user?.tenantContext?.tenantId;
    if (!tenantId) {
      throw new DomainBadRequestException(
        ERROR_CODES.BadRequest,
        'Tenant context is missing from the verified session.',
      );
    }
    return tenantId;
  }
}