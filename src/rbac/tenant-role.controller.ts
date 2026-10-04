import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantContextGuard } from '../users/guards/tenant-context.guard';
import { AdminRoleGuard } from '../admin-operations/admin-role.guard';
import { RBAC_BASE_ROLE_MODEL, RBAC_PERMISSION_CATALOG } from './rbac-permission-catalog';
import {
  DomainBadRequestException,
  DomainConflictException,
  DomainNotFoundException,
} from '../common/errors/domain-exceptions';
import { ERROR_CODES } from '../common/errors/error-code';

const PERMISSION_NAMES = new Set(RBAC_PERMISSION_CATALOG.map((p) => p.permission));

class CreateRoleDto {
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(64)
  @IsString({ each: true })
  permissions: string[];
}

class AssignRoleDto {
  @IsUUID()
  roleId: string;
}

/**
 * Where a permission check should fail. `@nestjs/common` ships no 400-class DTO failure for an
 * unknown enum value, so the catalog is enforced here rather than by `@IsIn` — the list is
 * derived from the catalog, which keeps the API and the catalog from describing different
 * things.
 */
const catalogReject = (value: string) =>
  new DomainBadRequestException(
    ERROR_CODES.ValidationFailed,
    `Permission tidak dikenal: ${value}`,
  );

/**
 * Tenant-scoped management of `custom_roles` and `membership_role_overrides`.
 *
 * These two tables already existed and `RbacPolicyService.evaluate()` already read them to
 * decide what a MEMBER may do. Nothing ever wrote them: `membershipRoleOverride` appeared in
 * the repository in exactly one place, a `findMany`. The consequence was that a MEMBER's
 * permission set was always empty, so every permission-gated route refused every member, and
 * the catalog's own descriptions — "dashboard PERSONAL milik pemanggil sendiri" — described an
 * actor who could not perform any of those actions. This controller is the missing writer.
 *
 * Scope note: this is deliberately tenant-only. It is not reachable from a platform admin,
 * because granting permissions inside a tenant is a tenant decision, and a route that could
 * write another tenant's roles would be exactly the hazard the rest of the RBAC layer avoids.
 */
@ApiTags('rbac')
@ApiBearerAuth()
@ApiHeader({
  name: 'X-Tenant-Id',
  required: true,
  description: 'Trusted tenant selector validated against active membership',
})
@Controller('admin/roles')
@UseGuards(JwtAuthGuard, TenantContextGuard, AdminRoleGuard)
export class TenantRoleController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('catalog')
  @ApiOperation({ summary: 'Read the permission catalog available to tenant custom roles' })
  permissionCatalog() {
    return { permissions: RBAC_PERMISSION_CATALOG, baseRoleModel: RBAC_BASE_ROLE_MODEL };
  }

  @Get()
  @ApiOperation({ summary: 'List the active tenant’s custom roles (tenant admin)' })
  async listRoles(@Request() request: { user: { tenantContext: { tenantId: string } } }) {
    const roles = await this.prisma.customRole.findMany({
      where: { tenantId: request.user.tenantContext.tenantId },
      orderBy: [{ name: 'asc' }],
      take: 200,
      select: {
        id: true,
        name: true,
        permissions: true,
        createdAt: true,
        _count: { select: { overrides: true } },
        overrides: {
          orderBy: { createdAt: 'asc' },
          take: 200,
          select: {
            membershipId: true,
            membership: { select: { user: { select: { email: true, name: true } } } },
          },
        },
      },
    });
    return {
      items: roles.map(({ _count, overrides, ...role }) => ({
        ...role,
        permissions: Array.isArray(role.permissions) ? role.permissions : [],
        createdAt: role.createdAt.toISOString(),
        memberCount: _count.overrides,
        members: overrides.map((assignment) => ({
          membershipId: assignment.membershipId,
          email: assignment.membership.user.email,
          name: assignment.membership.user.name,
        })),
        assignmentsBounded: _count.overrides > overrides.length,
      })),
    };
  }

  @Post()
  @ApiOperation({ summary: 'Create a custom role for the active tenant (tenant admin)' })
  async createRole(
    @Request() request: { user: { tenantContext: { tenantId: string } } },
    @Body() dto: CreateRoleDto,
  ) {
    const roleName = dto.name.trim();
    if (roleName.length < 2 || roleName.length > 60) {
      throw new DomainBadRequestException(
        ERROR_CODES.ValidationFailed,
        'Nama role harus 2-60 karakter non-spasi.',
      );
    }
    const unknown = dto.permissions.filter((p) => !PERMISSION_NAMES.has(p));
    if (unknown.length > 0) throw catalogReject(unknown[0]);
    // Checked here as well as on the DTO. `@ArrayMinSize(1)` only runs through Nest's
    // ValidationPipe, so a caller that reaches this method directly — another controller, a
    // test, a future internal caller — would otherwise store a role that grants nothing and
    // reads as "assigned but ineffective".
    if (dto.permissions.length === 0) {
      throw new DomainBadRequestException(
        ERROR_CODES.ValidationFailed,
        'Role harus punya minimal satu permission.',
      );
    }
    if (dto.permissions.length !== new Set(dto.permissions).size) {
      throw new DomainBadRequestException(
        ERROR_CODES.ValidationFailed,
        'Permission duplikat dalam daftar.',
      );
    }

    try {
      const role = await this.prisma.customRole.create({
        data: {
          // From the verified context, never from the body.
          tenantId: request.user.tenantContext.tenantId,
          name: roleName,
          permissions: [...dto.permissions],
        },
        select: { id: true, name: true, permissions: true, createdAt: true },
      });
      return { ...role, createdAt: role.createdAt.toISOString() };
    } catch (error) {
      // `CustomRole` is unique on (tenantId, name), so a repeated name is a client mistake.
      // Prisma raises it as P2002, which the global filter does not recognise, and a 500
      // invites a retry — which is the wrong advice for a conflict.
      if ((error as { code?: string })?.code === 'P2002') {
        throw new DomainConflictException(
          ERROR_CODES.Conflict,
          `Role dengan nama "${roleName}" sudah ada di tenant ini.`,
        );
      }
      throw error;
    }
  }

  @Delete(':roleId')
  @ApiOperation({ summary: 'Delete a custom role and every assignment of it (tenant admin)' })
  async deleteRole(
    @Request() request: { user: { tenantContext: { tenantId: string } } },
    @Param('roleId') roleId: string,
  ) {
    const role = await this.prisma.customRole.findFirst({
      where: { id: roleId, tenantId: request.user.tenantContext.tenantId },
      select: { id: true },
    });
    if (!role) {
      throw new DomainNotFoundException(ERROR_CODES.NotFound, 'Role tidak ditemukan');
    }
    // MembershipRoleOverride cascades on delete, so the members holding it lose the grant.
    // `deleteMany` keeps the tenant predicate at the mutation boundary and turns a concurrent
    // delete into a stable 404 rather than leaking Prisma P2025 as HTTP 500.
    const deleted = await this.prisma.customRole.deleteMany({
      where: { id: role.id, tenantId: request.user.tenantContext.tenantId },
    });
    if (deleted.count !== 1) {
      throw new DomainNotFoundException(ERROR_CODES.NotFound, 'Role tidak ditemukan');
    }
    return { id: role.id, deleted: true, note: 'Assignment role ikut terhapus.' };
  }

  @Post('members/:membershipId')
  @ApiOperation({ summary: 'Grant a custom role to a member of the active tenant (tenant admin)' })
  async assignRole(
    @Request() request: { user: { tenantContext: { tenantId: string } } },
    @Param('membershipId') membershipId: string,
    @Body() dto: AssignRoleDto,
  ) {
    const tenantId = request.user.tenantContext.tenantId;

    // Both lookups are tenant-scoped. A role or a membership from another tenant is reported
    // as not found rather than forbidden, so the response does not confirm that the id exists.
    const [role, membership] = await Promise.all([
      this.prisma.customRole.findFirst({
        where: { id: dto.roleId, tenantId },
        select: { id: true },
      }),
      this.prisma.membership.findFirst({
        where: { id: membershipId, tenantId },
        select: { id: true, role: true, status: true },
      }),
    ]);
    if (!role) throw new DomainNotFoundException(ERROR_CODES.NotFound, 'Role tidak ditemukan');
    if (!membership) {
      throw new DomainNotFoundException(ERROR_CODES.NotFound, 'Member tidak ditemukan');
    }
    if (membership.status !== 'ACTIVE') {
      throw new DomainBadRequestException(
        ERROR_CODES.ValidationFailed,
        'Custom role hanya dapat diberikan ke membership ACTIVE.',
      );
    }
    if (membership.role !== 'MEMBER') {
      throw new DomainBadRequestException(
        ERROR_CODES.ValidationFailed,
        'Custom role hanya dapat diberikan ke MEMBER.',
      );
    }

    const existing = await this.prisma.membershipRoleOverride.findFirst({
      where: { membershipId, roleId: role.id, tenantId },
      select: { id: true },
    });
    if (existing) {
      return { membershipId, roleId: role.id, alreadyAssigned: true };
    }

    try {
      await this.prisma.membershipRoleOverride.create({
        data: { tenantId, membershipId: membership.id, roleId: role.id },
      });
      return { membershipId, roleId: role.id, alreadyAssigned: false };
    } catch (error) {
      if ((error as { code?: string })?.code === 'P2002') {
        // A concurrent grant of the same role is equivalent to the idempotent existing path.
        return { membershipId, roleId: role.id, alreadyAssigned: true };
      }
      throw error;
    }
  }

  @Delete('members/:membershipId/:roleId')
  @ApiOperation({ summary: 'Revoke a custom role from a member (tenant admin)' })
  async revokeRole(
    @Request() request: { user: { tenantContext: { tenantId: string } } },
    @Param('membershipId') membershipId: string,
    @Param('roleId') roleId: string,
  ) {
    const override = await this.prisma.membershipRoleOverride.findFirst({
      where: { membershipId, roleId, tenantId: request.user.tenantContext.tenantId },
      select: { id: true },
    });
    if (!override) {
      throw new DomainNotFoundException(ERROR_CODES.NotFound, 'Member tidak memegang role itu');
    }
    const revoked = await this.prisma.membershipRoleOverride.deleteMany({
      where: {
        id: override.id,
        membershipId,
        roleId,
        tenantId: request.user.tenantContext.tenantId,
      },
    });
    if (revoked.count !== 1) {
      throw new DomainNotFoundException(ERROR_CODES.NotFound, 'Member tidak memegang role itu');
    }
    return { membershipId, roleId, revoked: true };
  }
}

/** Exported for the DTO-less surface of the seeded fixtures and for the contract spec. */
export const TENANT_ROLE_ROUTES = {
  catalog: 'GET /admin/roles/catalog',
  list: 'GET /admin/roles',
  create: 'POST /admin/roles',
  remove: 'DELETE /admin/roles/:roleId',
  assign: 'POST /admin/roles/members/:membershipId',
  revoke: 'DELETE /admin/roles/members/:membershipId/:roleId',
} as const;

export { HttpStatus };
