import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RbacPermissionGuard, RequirePermission } from '../rbac/rbac-permission.guard';
import { TenantContextGuard } from '../users/guards/tenant-context.guard';
import { AutomationRepository } from './automation.repository';
import {
  DomainBadRequestException,
  DomainConflictException,
  DomainForbiddenException,
  DomainNotFoundException,
  DomainServiceUnavailableException,
} from '../common/errors/domain-exceptions';
import { ERROR_CODES } from '../common/errors/error-code';
import {
  AUTOMATION_PERSISTENCE_ERROR_CODES,
  AutomationPersistenceError,
} from './automation.persistence.error';
import { isAutomationRuntimeEnabled } from './automation-runtime-policy';

/**
 * Automation rule CRUD (blueprint §2 Automation) — exposes the Modul 14
 * persistence foundation over HTTP. Rules are created disabled and can only
 * be activated explicitly by their owner while the operator runtime flag is
 * enabled. The runtime itself remains double-gated by persisted enabled state
 * and AUTOMATION_RUNTIME_ENABLED=true.
 */

interface TenantRequest {
  user: {
    tenantContext: { tenantId: string; membershipId: string; role: string };
  };
}

class QueryLimitPipe {
  transform(value?: string): number {
    const parsed = Number.parseInt(value ?? '', 10);
    if (Number.isNaN(parsed) || parsed < 1) return 50;
    return Math.min(parsed, 100);
  }
}

@Controller('automations')
@UseGuards(JwtAuthGuard, TenantContextGuard, RbacPermissionGuard)
// Every route below declares a permission. `allowOwner` is set on the addressed routes because
// AutomationRepository already filters by ownerMembershipId: a plain member keeps full access to
// their own automations, and the guard now records who acted instead of leaving no trace. The
// repository remains the authority — this adds an audit trail and a second, tenant-scoped
// check, it does not widen what any caller may do.
export class AutomationController {
  constructor(private readonly automations: AutomationRepository) {}

  @Post()
  @RequirePermission('automation.create')
  async create(@Request() request: TenantRequest, @Body() body: { definition?: unknown }) {
    try {
      return await this.automations.createOwnedAutomation({
        tenantId: request.user.tenantContext.tenantId,
        ownerMembershipId: request.user.tenantContext.membershipId,
        definition: body?.definition as never,
      });
    } catch (cause) {
      // createOwnedAutomation runs the same validator as replace, so an unresolvable
      // trigger or a non-writable action target reaches here too — 400, not 500.
      this.mapPersistenceError(cause);
    }
  }

  @Get()
  @RequirePermission('automation.read')
  async list(
    @Request() request: TenantRequest,
    @Query('limit', new QueryLimitPipe()) limit: number,
  ) {
    const items = await this.automations.listOwnedAutomations(
      request.user.tenantContext.tenantId,
      request.user.tenantContext.membershipId,
      limit,
    );
    return {
      total: items.length,
      items,
      runtimeEnabled: isAutomationRuntimeEnabled(),
    };
  }

  @Post(':automationId/activate')
  @RequirePermission('automation.update', { allowOwner: true })
  async activate(
    @Request() request: TenantRequest,
    @Param('automationId') automationId: string,
    @Body() body: { expectedRevision?: number },
  ) {
    if (!isAutomationRuntimeEnabled()) {
      throw new DomainServiceUnavailableException(
        ERROR_CODES.ServiceUnavailable,
        'Runtime otomasi belum diaktifkan oleh operator.',
      );
    }
    return this.setEnabled(request, automationId, body?.expectedRevision, true);
  }

  @Post(':automationId/deactivate')
  @RequirePermission('automation.update', { allowOwner: true })
  async deactivate(
    @Request() request: TenantRequest,
    @Param('automationId') automationId: string,
    @Body() body: { expectedRevision?: number },
  ) {
    return this.setEnabled(request, automationId, body?.expectedRevision, false);
  }

  @Get(':automationId')
  @RequirePermission('automation.read', { allowOwner: true })
  async get(
    @Request() request: TenantRequest,
    @Param('automationId') automationId: string,
  ) {
    return this.loadOwned(request, automationId);
  }

  @Put(':automationId')
  @RequirePermission('automation.update', { allowOwner: true })
  async replace(
    @Request() request: TenantRequest,
    @Param('automationId') automationId: string,
    @Body() body: { expectedRevision?: number; definition?: unknown },
  ) {
    const expectedRevision = Number(body?.expectedRevision);
    if (!Number.isInteger(expectedRevision)) {
      throw new DomainBadRequestException(
        ERROR_CODES.DashboardInvalidInput,
        'expectedRevision wajib angka',
      );
    }
    try {
      return await this.automations.replaceOwnedAutomation({
        tenantId: request.user.tenantContext.tenantId,
        ownerMembershipId: request.user.tenantContext.membershipId,
        automationId,
        expectedRevision,
        definition: body.definition as never,
      });
    } catch (cause) {
      // Without this the error reaches the global filter, which only understands
      // HttpException, so a stale revision or a vanished automation surfaced as
      // 500 Internal Server Error. The console then told the operator the server was
      // broken, when the real answer is "someone else edited this first" (409) or
      // "it is gone" (404) — and activate/deactivate already answered correctly.
      this.mapPersistenceError(cause);
    }
  }

  @Delete(':automationId')
  @RequirePermission('automation.delete', { allowOwner: true })
  async remove(
    @Request() request: TenantRequest,
    @Param('automationId') automationId: string,
  ) {
    const aggregate = await this.loadOwned(request, automationId);
    try {
      await this.automations.deleteOwnedAutomation(
        request.user.tenantContext.tenantId,
        request.user.tenantContext.membershipId,
        automationId,
        aggregate.revision,
      );
    } catch (cause) {
      // Same leak as replace: the revision read above can go stale between the read and
      // the delete, which is precisely when this throws, so the conflict is a normal
      // outcome of a correct optimistic-concurrency check — not a server fault.
      this.mapPersistenceError(cause);
    }
    return { id: automationId, deleted: true };
  }

  private async loadOwned(request: TenantRequest, automationId: string) {
    const aggregate = await this.automations.findOwnedAutomation(
      request.user.tenantContext.tenantId,
      request.user.tenantContext.membershipId,
      automationId,
    );
    if (!aggregate) {
      throw new DomainNotFoundException(ERROR_CODES.NotFound, 'Otomasi tidak ditemukan');
    }
    return aggregate;
  }

  private async setEnabled(
    request: TenantRequest,
    automationId: string,
    expectedRevisionValue: number | undefined,
    enabled: boolean,
  ) {
    const expectedRevision = Number(expectedRevisionValue);
    if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
      throw new DomainBadRequestException(
        ERROR_CODES.DashboardInvalidInput,
        'expectedRevision wajib bilangan bulat positif',
      );
    }

    try {
      return await this.automations.setOwnedAutomationEnabled({
        tenantId: request.user.tenantContext.tenantId,
        ownerMembershipId: request.user.tenantContext.membershipId,
        automationId,
        expectedRevision,
        enabled,
      });
    } catch (cause) {
      this.mapPersistenceError(cause);
    }
  }

  private mapPersistenceError(cause: unknown): never {
    if (!(cause instanceof AutomationPersistenceError)) throw cause;

    switch (cause.code) {
      case AUTOMATION_PERSISTENCE_ERROR_CODES.AutomationNotFound:
        throw new DomainNotFoundException(ERROR_CODES.NotFound, 'Otomasi tidak ditemukan');
      case AUTOMATION_PERSISTENCE_ERROR_CODES.MembershipInvalid:
        throw new DomainForbiddenException(
          ERROR_CODES.Forbidden,
          'Membership owner otomasi tidak aktif.',
        );
      case AUTOMATION_PERSISTENCE_ERROR_CODES.RevisionConflict:
        throw new DomainConflictException(
          ERROR_CODES.Conflict,
          'Otomasi berubah sejak terakhir dimuat. Muat ulang sebelum mengubah status.',
        );
      case AUTOMATION_PERSISTENCE_ERROR_CODES.InvalidInput:
      case AUTOMATION_PERSISTENCE_ERROR_CODES.TargetInvalid:
      case AUTOMATION_PERSISTENCE_ERROR_CODES.ActivationNotApproved:
        throw new DomainBadRequestException(ERROR_CODES.BadRequest, cause.message);
    }
    throw cause;
  }
}