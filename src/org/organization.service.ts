import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ERROR_CODES } from '../common/errors/error-code';

/**
 * Module 19 — Organization & Branch.
 *
 * Organization groups tenants as branches; each tenant may belong to at most one organization.
 * All writes validate the tenant before mutation so FK/unique violations never leak as opaque 500s.
 */
@Injectable()
export class OrganizationService {
  private readonly logger = new Logger(OrganizationService.name);

  constructor(private readonly prisma: PrismaService) {}

  private normalizedLabel(value: string, field: string): string {
    const normalized = value.trim();
    if (normalized.length < 2 || normalized.length > 120) {
      throw Object.assign(new Error(`${field} must contain 2-120 non-whitespace characters`), {
        code: ERROR_CODES.ValidationFailed,
      });
    }
    return normalized;
  }

  async listOrganizations(actorMembershipId: string) {
    const [organizations, total] = await Promise.all([
      this.prisma.organization.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 200,
        select: {
        id: true,
        name: true,
        createdAt: true,
        ownerMembership: {
          select: { id: true, user: { select: { email: true } } },
        },
        branches: {
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
          select: {
            id: true,
            tenantId: true,
            label: true,
            isPrimary: true,
            createdAt: true,
            tenant: { select: { name: true } },
          },
        },
      },
      }),
      this.prisma.organization.count(),
    ]);

    return {
      total,
      bounded: total > organizations.length,
      items: organizations.map((organization) => ({
        id: organization.id,
        name: organization.name,
        ownerMembershipId: organization.ownerMembership.id,
        ownerEmail: organization.ownerMembership.user.email,
        canManage: organization.ownerMembership.id === actorMembershipId,
        createdAt: organization.createdAt.toISOString(),
        branches: organization.branches.map((branch) => ({
          id: branch.id,
          tenantId: branch.tenantId,
          tenantName: branch.tenant.name,
          label: branch.label,
          isPrimary: branch.isPrimary,
          createdAt: branch.createdAt.toISOString(),
        })),
      })),
    };
  }

  async getTenantOrganization(actorTenantId: string) {
    const membership = await this.prisma.organizationBranch.findUnique({
      where: { tenantId: actorTenantId },
      select: {
        organization: {
          select: {
            id: true,
            name: true,
            createdAt: true,
            branches: {
              orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
              select: {
                id: true,
                tenantId: true,
                label: true,
                isPrimary: true,
                createdAt: true,
                tenant: { select: { name: true } },
              },
            },
          },
        },
      },
    });
    if (!membership) return null;

    const organization = membership.organization;
    return {
      id: organization.id,
      name: organization.name,
      createdAt: organization.createdAt.toISOString(),
      branches: organization.branches.map((branch) => ({
        id: branch.id,
        tenantId: branch.tenantId,
        tenantName: branch.tenant.name,
        label: branch.label,
        isPrimary: branch.isPrimary,
        createdAt: branch.createdAt.toISOString(),
      })),
    };
  }

  async createOrganization(input: {
    ownerMembershipId: string;
    name: string;
    firstBranchTenantId: string;
    firstBranchLabel: string;
  }): Promise<{ id: string }> {
    const name = this.normalizedLabel(input.name, 'organization name');
    const firstBranchLabel = this.normalizedLabel(input.firstBranchLabel, 'first branch label');
    let result: { id: string };
    try {
      result = await this.prisma.$transaction(async (tx) => {
      const [existingOwner, targetTenant, existingBranch] = await Promise.all([
        tx.organization.findUnique({ where: { ownerMembershipId: input.ownerMembershipId } }),
        tx.tenant.findUnique({ where: { id: input.firstBranchTenantId }, select: { id: true } }),
        tx.organizationBranch.findFirst({
          where: { tenantId: input.firstBranchTenantId },
          select: { organizationId: true },
        }),
      ]);
      if (existingOwner) {
        throw Object.assign(new Error('owner already has an organization'), {
          code: ERROR_CODES.OrgAlreadyExists,
        });
      }
      if (!targetTenant) {
        throw Object.assign(new Error('first branch tenant not found'), {
          code: ERROR_CODES.OrgBranchTenantNotFound,
        });
      }
      if (existingBranch) {
        throw Object.assign(new Error('tenant already belongs to an organization'), {
          code: ERROR_CODES.OrgBranchTenantConflict,
        });
      }

      const org = await tx.organization.create({
        data: {
          name,
          ownerMembershipId: input.ownerMembershipId,
        },
      });
      await tx.organizationBranch.create({
        data: {
          organizationId: org.id,
          tenantId: input.firstBranchTenantId,
          label: firstBranchLabel,
          isPrimary: true,
        },
      });
        return org;
      });
    } catch (error) {
      if ((error as { code?: string })?.code === 'P2002') {
        const target = JSON.stringify((error as { meta?: { target?: unknown } }).meta?.target ?? '');
        const code = target.includes('ownerMembershipId')
          ? ERROR_CODES.OrgAlreadyExists
          : ERROR_CODES.OrgBranchTenantConflict;
        throw Object.assign(new Error('organization uniqueness conflict'), { code });
      }
      throw error;
    }

    this.logger.log({
      event: 'organization.created',
      outcome: 'created',
      organizationId: result.id,
    });
    return { id: result.id };
  }

  async addBranch(input: {
    actorMembershipId: string;
    organizationId: string;
    tenantId: string;
    label: string;
  }): Promise<{ id: string }> {
    const label = this.normalizedLabel(input.label, 'branch label');
    try {
      return await this.prisma.$transaction(async (tx) => {
        const org = await tx.organization.findUnique({
          where: { id: input.organizationId },
        });
        if (!org || org.ownerMembershipId !== input.actorMembershipId) {
          throw Object.assign(new Error('only the owner may add branches'), {
            code: ERROR_CODES.OrgNotOwner,
          });
        }

        const [tenant, existing] = await Promise.all([
          tx.tenant.findUnique({ where: { id: input.tenantId }, select: { id: true } }),
          tx.organizationBranch.findFirst({
            where: { tenantId: input.tenantId },
            select: { organizationId: true },
          }),
        ]);
        if (!tenant) {
          throw Object.assign(new Error('branch tenant not found'), {
            code: ERROR_CODES.OrgBranchTenantNotFound,
          });
        }
        if (existing?.organizationId === input.organizationId) {
          throw Object.assign(new Error('tenant is already a branch of this organization'), {
            code: ERROR_CODES.OrgBranchAlreadyMember,
          });
        }
        if (existing) {
          throw Object.assign(new Error('tenant already belongs to another organization'), {
            code: ERROR_CODES.OrgBranchTenantConflict,
          });
        }

        const branch = await tx.organizationBranch.create({
          data: {
            organizationId: input.organizationId,
            tenantId: input.tenantId,
            label,
          },
        });
        return { id: branch.id };
      });
    } catch (error) {
      // The pre-checks provide precise operator errors, but concurrent requests can race the
      // unique tenantId constraint. Preserve the database as the final authority and translate
      // that race into the same stable conflict rather than leaking Prisma P2002 as HTTP 500.
      if ((error as { code?: string })?.code === 'P2002') {
        throw Object.assign(new Error('tenant already belongs to an organization'), {
          code: ERROR_CODES.OrgBranchTenantConflict,
        });
      }
      throw error;
    }
  }

  async removeBranch(input: {
    actorMembershipId: string;
    organizationId: string;
    tenantId: string;
  }): Promise<{ organizationId: string; tenantId: string; removed: true }> {
    return this.prisma.$transaction(async (tx) => {
      const organization = await tx.organization.findUnique({
        where: { id: input.organizationId },
        select: { id: true, ownerMembershipId: true },
      });
      if (!organization) {
        throw Object.assign(new Error('organization not found'), {
          code: ERROR_CODES.OrgNotFound,
        });
      }
      if (organization.ownerMembershipId !== input.actorMembershipId) {
        throw Object.assign(new Error('only the owner may remove branches'), {
          code: ERROR_CODES.OrgNotOwner,
        });
      }

      const branch = await tx.organizationBranch.findFirst({
        where: { organizationId: input.organizationId, tenantId: input.tenantId },
        select: { id: true, isPrimary: true },
      });
      if (!branch) {
        throw Object.assign(new Error('organization branch not found'), {
          code: ERROR_CODES.OrgBranchNotFound,
        });
      }
      if (branch.isPrimary) {
        throw Object.assign(new Error('primary branch cannot be detached'), {
          code: ERROR_CODES.OrgPrimaryBranchRemovalForbidden,
        });
      }

      const removed = await tx.organizationBranch.deleteMany({
        where: {
          id: branch.id,
          organizationId: input.organizationId,
          tenantId: input.tenantId,
          isPrimary: false,
        },
      });
      if (removed.count !== 1) {
        throw Object.assign(new Error('organization branch disappeared during removal'), {
          code: ERROR_CODES.OrgBranchNotFound,
        });
      }
      return { organizationId: input.organizationId, tenantId: input.tenantId, removed: true };
    });
  }

  async deleteOrganization(input: {
    actorMembershipId: string;
    organizationId: string;
  }): Promise<{ id: string; deleted: true }> {
    return this.prisma.$transaction(async (tx) => {
      const organization = await tx.organization.findUnique({
        where: { id: input.organizationId },
        select: { id: true, ownerMembershipId: true },
      });
      if (!organization) {
        throw Object.assign(new Error('organization not found'), {
          code: ERROR_CODES.OrgNotFound,
        });
      }
      if (organization.ownerMembershipId !== input.actorMembershipId) {
        throw Object.assign(new Error('only the owner may delete the organization'), {
          code: ERROR_CODES.OrgNotOwner,
        });
      }

      const deleted = await tx.organization.deleteMany({
        where: { id: input.organizationId, ownerMembershipId: input.actorMembershipId },
      });
      if (deleted.count !== 1) {
        throw Object.assign(new Error('organization disappeared during deletion'), {
          code: ERROR_CODES.OrgNotFound,
        });
      }
      // OrganizationBranch rows cascade from the organization. Tenants are not deleted.
      return { id: input.organizationId, deleted: true };
    });
  }

  async listBranches(input: {
    organizationId: string;
    actorMembershipId: string;
    actorTenantId: string;
  }) {
    const org = await this.prisma.organization.findUnique({
      where: { id: input.organizationId },
      select: { id: true, ownerMembershipId: true },
    });
    if (!org) {
      throw Object.assign(new Error('organization not found'), { code: ERROR_CODES.OrgNotFound });
    }

    const branches = await this.prisma.organizationBranch.findMany({
      where: { organizationId: input.organizationId },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });

    const isOwner = org.ownerMembershipId === input.actorMembershipId;
    const belongsToGroup = branches.some((branch) => branch.tenantId === input.actorTenantId);
    if (!isOwner && !belongsToGroup) {
      throw Object.assign(
        new Error('caller is not a member of this organization'),
        { code: ERROR_CODES.OrgNotAMember },
      );
    }

    return branches;
  }
}
