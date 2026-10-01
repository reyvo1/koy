import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantContextGuard } from '../users/guards/tenant-context.guard';
import { AdminRoleGuard } from './admin-role.guard';
import { PlatformRoleGuard } from './platform-role.guard';
import { AdminGovernanceService } from './admin-governance.service';
import { CapabilityTemplateService } from './capability-template.service';
import { AdminOperationsRequest } from './admin-operational-summary.types';

/**
 * Platform governance surfaces required by blueprint §1 but previously absent from the API:
 * the permission catalog, custom roles and their RBAC audit trail; observed capability
 * version drift; recorded runtime signals; and platform-initiated command dispatch.
 *
 * Every route is platform-guarded. The dispatch route is intentionally narrow: it requires
 * an explicit target tenant, a device that provably belongs to it, and a non-empty reason,
 * and it writes through the same CommandService the tenant path uses.
 */
@ApiTags('admin-governance')
@ApiBearerAuth()
@ApiHeader({
  name: 'X-Tenant-Id',
  required: true,
  description: 'Trusted active tenant context; platform role is still required',
})
@Controller('admin')
@UseGuards(JwtAuthGuard, TenantContextGuard, AdminRoleGuard, PlatformRoleGuard)
export class AdminGovernanceController {
  constructor(
    private readonly governance: AdminGovernanceService,
    private readonly capabilityTemplates: CapabilityTemplateService,
  ) {}

  @Get('platform-rbac/permission-catalog')
  @ApiOperation({ summary: 'Read the permission set this API actually enforces' })
  permissionCatalog() {
    return this.governance.permissionCatalog();
  }

  @Get('platform-rbac/custom-roles')
  @ApiOperation({ summary: 'Read custom roles and the members holding them' })
  listCustomRoles(@Query('tenantId') tenantId?: string) {
    return this.governance.listCustomRoles(tenantId?.trim() || undefined);
  }

  @Get('platform-rbac/audit')
  @ApiOperation({ summary: 'Read recent RBAC decisions' })
  listRbacAudit(@Query('limit') limit?: string) {
    return this.governance.listRbacAudit(limit);
  }

  @Get('platform-capabilities/versions')
  @ApiOperation({ summary: 'Read observed per-key capability schema versions and drift' })
  listCapabilityVersions(@Query('tenantId') tenantId?: string) {
    return this.governance.listCapabilityVersions(tenantId?.trim() || undefined);
  }

  /**
   * The membership id that owns an audit row.
   *
   * Read from the authenticated session, never from a request body, so an audit row cannot be
   * attributed to someone else. Every lifecycle route calls this, and
   * `scripts/validate-rescue-baseline.mjs` requires the read to be a session read on every
   * platform route that writes an audit record -- one helper keeps that guarantee in one place
   * instead of repeating `request.user.tenantContext.membershipId` at each call site.
   */
  private actorOf(request: AdminOperationsRequest): string {
    return request.user.tenantContext.membershipId;
  }

  // -- Capability template lifecycle ---------------------------------------
  //
  // `platform-capabilities/versions` above reports drift. These routes are what makes it
  // fixable. Publishing deliberately changes no device: the operator publishes a version, then
  // applies it, so a fleet-wide capability schema change is two deliberate acts rather than one
  // click on a form.

  @Get('platform-capability-templates')
  @ApiOperation({ summary: 'List capability templates and their version lifecycles' })
  listCapabilityTemplates(
    @Query('tenantId') tenantId: string,
    @Query('take') take?: string,
  ) {
    // Explicit tenant, the same rule `platform-commands/dispatch` follows: a platform read
    // that fell back to a default would show one customer's capability declarations to another.
    return this.capabilityTemplates.listTemplates(tenantId.trim(), take ? Number(take) : 100);
  }

  @Post('platform-capability-templates')
  @ApiOperation({ summary: 'Declare a capability key as a template' })
  createCapabilityTemplate(
    @Body()
    body: {
      tenantId?: string;
      key: string;
      semanticType: string;
      dataType: string;
      unit?: string;
      description?: string;
    },
    @Request() request: AdminOperationsRequest,
  ) {
    return this.capabilityTemplates.createTemplate({
      tenantId: (body.tenantId ?? '').trim(),
      key: body.key,
      semanticType: body.semanticType,
      dataType: body.dataType,
      unit: body.unit,
      description: body.description,
      // Read from the session, never the body, so the audit trail cannot be attributed to
      // someone else.
      actorMembershipId: this.actorOf(request),
    });
  }

  @Post('platform-capability-templates/:templateId/versions')
  @ApiOperation({ summary: 'Publish a version of a capability template' })
  publishCapabilityVersion(
    @Param('templateId') templateId: string,
    @Body()
    body: {
      tenantId?: string;
      version: string;
      constraints?: unknown;
      semanticType?: string;
      isReadable?: boolean;
      isWritable?: boolean;
      isReportable?: boolean;
      supersede?: boolean;
      rollback?: boolean;
    },
    @Request() request: AdminOperationsRequest,
  ) {
    return this.capabilityTemplates.publishVersion({
      tenantId: (body.tenantId ?? '').trim(),
      templateId,
      version: body.version,
      constraints: body.constraints as never,
      semanticType: body.semanticType,
      isReadable: body.isReadable,
      isWritable: body.isWritable,
      isReportable: body.isReportable,
      supersede: body.supersede,
      rollback: body.rollback,
      actorMembershipId: this.actorOf(request),
    });
  }

  @Post('platform-capability-templates/:templateId/deprecate')
  @ApiOperation({ summary: 'Deprecate a published version of a capability template' })
  deprecateCapabilityVersion(
    @Param('templateId') templateId: string,
    @Body()
    body: { tenantId?: string; version: string; reason?: string },
    @Request() request: AdminOperationsRequest,
  ) {
    return this.capabilityTemplates.deprecateVersion({
      tenantId: (body.tenantId ?? '').trim(),
      templateId,
      version: body.version,
      reason: body.reason,
      actorMembershipId: this.actorOf(request),
    });
  }

  @Post('platform-capability-versions/apply')
  @ApiOperation({
    summary:
      'Move devices onto a published capability version; bound capabilities are refused',
  })
  applyCapabilityVersion(
    @Body()
    body: { tenantId?: string; templateId: string; maxDevices?: number; dryRun?: boolean },
    @Request() request: AdminOperationsRequest,
  ) {
    return this.capabilityTemplates.applyVersion({
      tenantId: (body.tenantId ?? '').trim(),
      templateId: body.templateId,
      maxDevices: body.maxDevices,
      dryRun: body.dryRun,
      actorMembershipId: this.actorOf(request),
    });
  }

  @Get('platform-runtime-signals')
  @ApiOperation({ summary: 'Read recorded metric families and worker liveness contract' })
  runtimeSignals() {
    return this.governance.runtimeSignals();
  }

  @Post('platform-commands/dispatch')
  @ApiOperation({
    summary: 'Dispatch a command to a device in an explicitly named tenant, audited',
  })
  async dispatch(
    @Body()
    body: {
      tenantId?: string;
      deviceId?: string;
      payload?: unknown;
      idempotencyKey?: string;
      reason?: string;
    },
    @Request() request: AdminOperationsRequest,
  ) {
    // The actor membership is read from the authenticated session, never from the body, so
    // the audit trail cannot be attributed to someone else.
    return this.governance.dispatchPlatformCommand({
      tenantId: body.tenantId,
      deviceId: body.deviceId,
      payload: body.payload as never,
      idempotencyKey: body.idempotencyKey,
      reason: body.reason,
      actorMembershipId: this.actorOf(request),
    });
  }
}
