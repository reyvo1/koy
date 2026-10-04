import { Body, Controller, Delete, Get, Param, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantContextGuard } from '../users/guards/tenant-context.guard';
import { PlatformRoleGuard } from '../admin-operations/platform-role.guard';
import { AdminRoleGuard } from '../admin-operations/admin-role.guard';
import {
  DomainBadRequestException,
  DomainConflictException,
  DomainForbiddenException,
  DomainNotFoundException,
} from '../common/errors/domain-exceptions';
import { ERROR_CODES } from '../common/errors/error-code';
import { AddBranchDto, CreateOrganizationDto } from './dto/organization.dto';
import { OrganizationService } from './organization.service';

/**
 * Module 19 REST surface.
 *
 * `OrganizationService` shipped complete — 1:1 branch/tenant mapping, owner-only branch
 * addition, and an explicit cross-organization tenant conflict instead of an opaque unique
 * violation — but had no controller, so `createOrganization` and `addBranch` had no caller
 * outside their own spec. This exposes them.
 *
 * Guard choice: organizations group whole tenants, so creating, listing and extending an
 * organization are platform actions (`PlatformRoleGuard`). Tenant admins may read branches of
 * an organization their tenant belongs to through the separate read route, but cannot move a
 * tenant between organization boundaries. The service independently keeps the owner check on
 * branch writes so the invariant does not rest on the guard alone.
 */
@Controller('organizations')
export class OrganizationController {
  constructor(private readonly organizationService: OrganizationService) {}

  @Get()
  @UseGuards(JwtAuthGuard, TenantContextGuard, PlatformRoleGuard)
  async list(@Request() req: any) {
    return this.organizationService.listOrganizations(this.membership(req));
  }

  @Post()
  @UseGuards(JwtAuthGuard, TenantContextGuard, PlatformRoleGuard)
  async create(@Request() req: any, @Body() dto: CreateOrganizationDto) {
    return this.translated(() =>
      this.organizationService.createOrganization({
        ownerMembershipId: this.membership(req),
        name: dto.name,
        firstBranchTenantId: dto.firstBranchTenantId,
        firstBranchLabel: dto.firstBranchLabel,
      }),
    );
  }

  @Get('current')
  @UseGuards(JwtAuthGuard, TenantContextGuard, AdminRoleGuard)
  async current(@Request() req: any) {
    return {
      organization: await this.organizationService.getTenantOrganization(this.tenant(req)),
    };
  }

  /**
   * `AdminRoleGuard` is necessary but not sufficient here, and the distinction is the point:
   * a branch row carries a `tenantId`, so this response is a statement about which tenants
   * belong to which organization. "Is this caller a tenant admin" says nothing about whether
   * the organization is theirs to read. `OrganizationService` decides that — the owner and
   * members of a branch tenant may read; everyone else is refused.
   */
  @Get(':id/branches')
  @UseGuards(JwtAuthGuard, TenantContextGuard, AdminRoleGuard)
  async branches(@Request() req: any, @Param('id') id: string) {
    return this.translated(() =>
      this.organizationService.listBranches({
        organizationId: id,
        actorMembershipId: this.membership(req),
        actorTenantId: this.tenant(req),
      }),
    );
  }

  @Post('branches')
  @UseGuards(JwtAuthGuard, TenantContextGuard, PlatformRoleGuard)
  async addBranch(@Request() req: any, @Body() dto: AddBranchDto) {
    return this.translated(() =>
      this.organizationService.addBranch({
        actorMembershipId: this.membership(req),
        organizationId: dto.organizationId,
        tenantId: dto.tenantId,
        label: dto.label,
      }),
    );
  }

  @Delete(':id/branches/:tenantId')
  @UseGuards(JwtAuthGuard, TenantContextGuard, PlatformRoleGuard)
  async removeBranch(
    @Request() req: any,
    @Param('id') organizationId: string,
    @Param('tenantId') tenantId: string,
  ) {
    return this.translated(() =>
      this.organizationService.removeBranch({
        actorMembershipId: this.membership(req),
        organizationId,
        tenantId,
      }),
    );
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, TenantContextGuard, PlatformRoleGuard)
  async remove(@Request() req: any, @Param('id') organizationId: string) {
    return this.translated(() =>
      this.organizationService.deleteOrganization({
        actorMembershipId: this.membership(req),
        organizationId,
      }),
    );
  }

  /**
   * The tenant comes from the authenticated context and nowhere else. A malformed value is
   * refused rather than passed on, so a caller cannot present an arbitrary tenant id for the
   * service to compare itself against — the check would then be a caller re-asserting the
   * identity it is meant to be tested on.
   */
  private tenant(req: any): string {
    const tenantId = req.user?.tenantContext?.tenantId;
    if (typeof tenantId !== 'string' || tenantId.length === 0) {
      throw new DomainForbiddenException(
        ERROR_CODES.Forbidden,
        'Tenant context is required to read an organization.',
      );
    }
    return tenantId;
  }

  private membership(req: any): string {
    const membershipId = req.user?.tenantContext?.membershipId;
    if (typeof membershipId !== 'string' || membershipId.length === 0) {
      throw new DomainForbiddenException(
        ERROR_CODES.Forbidden,
        'Membership context is required to manage organizations.',
      );
    }
    return membershipId;
  }

  /**
   * OrganizationService signals refusals with a plain Error carrying a `code`, and
   * `GlobalExceptionFilter` maps only HttpException. Without this translation every refusal
   * would reach the client as 500 — a permission or conflict problem reported as a server
   * fault.
   */
  private async translated<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      throw this.toDomainError(error);
    }
  }

  private toDomainError(error: unknown): unknown {
    const code = (error as { code?: unknown } | null)?.code;
    switch (code) {
      case ERROR_CODES.ValidationFailed:
        return new DomainBadRequestException(code, (error as Error)?.message ?? 'Invalid organization input.');
      case ERROR_CODES.OrgAlreadyExists:
        return new DomainConflictException(code, 'This owner already has an organization.');
      case ERROR_CODES.OrgNotOwner:
        return new DomainForbiddenException(
          code,
          'Only the organization owner may manage this organization.',
        );
      case ERROR_CODES.OrgNotAMember:
        return new DomainForbiddenException(
          code,
          'You are not a member of this organization.',
        );
      case ERROR_CODES.OrgNotFound:
        return new DomainNotFoundException(
          code,
          'Organization not found.',
        );
      case ERROR_CODES.OrgBranchTenantConflict:
        return new DomainConflictException(
          code,
          'This tenant already belongs to another organization.',
        );
      case ERROR_CODES.OrgBranchAlreadyMember:
        return new DomainConflictException(
          code,
          'This tenant is already a branch of this organization.',
        );
      case ERROR_CODES.OrgBranchNotFound:
        return new DomainNotFoundException(code, 'Organization branch not found.');
      case ERROR_CODES.OrgPrimaryBranchRemovalForbidden:
        return new DomainConflictException(
          code,
          'Primary branch cannot be removed directly; delete the organization instead.',
        );
      case ERROR_CODES.OrgBranchTenantNotFound:
        return new DomainNotFoundException(
          code,
          'Branch tenant not found.',
        );
      default:
        return error;
    }
  }
}
