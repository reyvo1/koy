import { Body, Controller, Delete, Get, Param, Patch, Post, Request, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantContextGuard } from '../users/guards/tenant-context.guard';
import { AdminOperationsRequest } from './admin-operational-summary.types';
import { AdminRoleGuard } from './admin-role.guard';
import { PlatformRoleGuard } from './platform-role.guard';
import {
  DomainConflictException,
  DomainForbiddenException,
  DomainNotFoundException,
} from '../common/errors/domain-exceptions';
import { ERROR_CODES } from '../common/errors/error-code';
import { BillingQuotaService } from '../billing/billing-quota.service';
import { IsString, MaxLength, MinLength } from 'class-validator';

class CreateTenantDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name: string;
}

class UpdateTenantDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name: string;
}

const SEEDED_TENANT_IDS = new Set([
  '00000000-0000-0000-0000-000000000000',
  '22222222-2222-4222-8222-222222222222',
]);

const MAX_LIST_TAKE = 200;

@ApiTags('admin-operations')
@ApiBearerAuth()
@ApiHeader({
  name: 'X-Tenant-Id',
  required: true,
  description: 'Trusted tenant selector validated against active membership',
})
@Controller('admin')
@UseGuards(JwtAuthGuard, TenantContextGuard, AdminRoleGuard, PlatformRoleGuard)
export class AdminDirectoryController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billingQuota: BillingQuotaService,
  ) {}

  @Get('tenants')
  @ApiOperation({ summary: 'List tenants (bounded directory view)' })
  @ApiResponse({ status: 200, description: 'Bounded tenant list' })
  @ApiResponse({ status: 403, description: 'Active ADMIN membership required' })
  async listTenants() {
    const [tenants, total] = await Promise.all([
      this.prisma.tenant.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: MAX_LIST_TAKE,
        select: {
          id: true,
          name: true,
          createdAt: true,
          _count: { select: { users: true, devices: true } },
        },
      }),
      this.prisma.tenant.count(),
    ]);

    return {
      total,
      items: tenants.map((tenant) => ({
        id: tenant.id,
        name: tenant.name,
        status: 'ACTIVE',
        userCount: tenant._count.users,
        deviceCount: tenant._count.devices,
        createdAt: tenant.createdAt.toISOString(),
      })),
    };
  }

  @Post('tenants')
  @ApiOperation({ summary: 'Create a tenant (platform admin)' })
  async createTenant(@Body() dto: CreateTenantDto) {
    const tenant = await this.prisma.tenant.create({
      data: { name: dto.name.trim() },
      select: { id: true, name: true, createdAt: true },
    });
    // A tenant created without a subscription is unmetered: `checkDeviceQuota` has no plan
    // to compare a device count against, and it fails closed. That makes the subscription
    // part of creating a tenant rather than an optional later step — a platform admin who
    // creates a tenant expects a working meter, not a tenant that cannot provision its
    // first device. FREE is a seeded plan with a real allowance, and `ensureSubscription`
    // throws if the plan row is missing, so a broken plan seeds surface here instead of
    // silently yielding an unmetered tenant.
    await this.billingQuota.ensureSubscription({ tenantId: tenant.id, planTier: 'FREE' });
    return { ...tenant, createdAt: tenant.createdAt.toISOString() };
  }

  @Patch('tenants/:tenantId')
  @ApiOperation({ summary: 'Rename a tenant (platform admin)' })
  async renameTenant(
    @Param('tenantId') tenantId: string,
    @Body() dto: UpdateTenantDto,
  ) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true },
    });
    if (!tenant) {
      throw new DomainNotFoundException(ERROR_CODES.NotFound, 'Tenant tidak ditemukan');
    }
    if (SEEDED_TENANT_IDS.has(tenantId)) {
      throw new DomainForbiddenException(
        ERROR_CODES.Forbidden,
        'Tenant bawaan sistem tidak dapat diubah',
      );
    }
    const updated = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { name: dto.name.trim() },
      select: { id: true, name: true },
    });
    return updated;
  }

  @Delete('tenants/:tenantId')
  @ApiOperation({ summary: 'Delete an empty tenant (platform admin)' })
  async deleteTenant(@Param('tenantId') tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true, _count: { select: { users: true, devices: true } } },
    });
    if (!tenant) {
      throw new DomainNotFoundException(ERROR_CODES.NotFound, 'Tenant tidak ditemukan');
    }
    if (SEEDED_TENANT_IDS.has(tenantId)) {
      throw new DomainForbiddenException(
        ERROR_CODES.Forbidden,
        'Tenant bawaan sistem tidak dapat dihapus',
      );
    }
    if (tenant._count.users > 0 || tenant._count.devices > 0) {
      throw new DomainConflictException(
        ERROR_CODES.Conflict,
        `Tenant masih berisi ${tenant._count.users} user dan ${tenant._count.devices} perangkat — kosongkan dulu`,
      );
    }
    await this.prisma.tenant.delete({ where: { id: tenantId } });
    return { id: tenantId, deleted: true };
  }

  @Get('users')
  @ApiOperation({ summary: 'List tenant users (bounded directory view)' })
  @ApiResponse({ status: 200, description: 'Bounded user list' })
  @ApiResponse({ status: 403, description: 'Active ADMIN membership required' })
  async listUsers(@Request() request: AdminOperationsRequest) {
    const tenantId = request.user.tenantContext.tenantId;

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where: { tenantId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: MAX_LIST_TAKE,
        select: {
          id: true,
          email: true,
          name: true,
          isVerified: true,
          createdAt: true,
          memberships: { select: { role: true, status: true } },
        },
      }),
      this.prisma.user.count({ where: { tenantId } }),
    ]);

    return {
      total,
      items: users.map((user) => ({
        id: user.id,
        email: user.email,
        name: user.name,
        isVerified: user.isVerified,
        role:
          user.memberships.find((m) => m.status === 'ACTIVE')?.role ?? 'MEMBER',
        createdAt: user.createdAt.toISOString(),
      })),
    };
  }
}
