import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Module 19 Slice 19.1 — Organization & Branch foundation.
 * An Organization groups tenants as branches; each branch maps 1:1 onto a
 * tenant, so all existing tenant-isolated boundaries apply unchanged. The
 * first branch created becomes the primary one.
 */
@Injectable()
export class OrganizationService {
  private readonly logger = new Logger(OrganizationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createOrganization(input: {
    ownerMembershipId: string;
    name: string;
    firstBranchTenantId: string;
    firstBranchLabel: string;
  }): Promise<{ id: string }> {
    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.organization.findUnique({
        where: { ownerMembershipId: input.ownerMembershipId },
      });
      if (existing) {
        throw Object.assign(new Error('owner already has an organization'), {
          code: 'ORG_ALREADY_EXISTS',
        });
      }

      const org = await tx.organization.create({
        data: {
          name: input.name.trim(),
          ownerMembershipId: input.ownerMembershipId,
        },
      });
      await tx.organizationBranch.create({
        data: {
          organizationId: org.id,
          tenantId: input.firstBranchTenantId,
          label: input.firstBranchLabel,
          isPrimary: true,
        },
      });
      return org;
    });

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
    const org = await this.prisma.organization.findUnique({
      where: { id: input.organizationId },
    });
    if (!org || org.ownerMembershipId !== input.actorMembershipId) {
      throw Object.assign(new Error('only the owner may add branches'), {
        code: 'ORG_NOT_OWNER',
      });
    }
    // The caller's `tenantId` is not implied by the organization: the organization is
    // addressed by id, and `OrganizationBranch.tenantId` is globally unique, so a branch
    // pointing at another organization's tenant would either steal that tenant or fail
    // with an opaque unique-violation. Resolve the tenant against the existing branches
    // first and reject a mismatch explicitly.
    const existing = await this.prisma.organizationBranch.findFirst({
      where: { tenantId: input.tenantId },
      select: { organizationId: true },
    });
    if (existing && existing.organizationId !== input.organizationId) {
      throw Object.assign(
        new Error('tenant already belongs to another organization'),
        { code: 'ORG_BRANCH_TENANT_CONFLICT' },
      );
    }
    const branch = await this.prisma.organizationBranch.create({
      data: {
        organizationId: input.organizationId,
        tenantId: input.tenantId,
        label: input.label.trim(),
      },
    });
    return { id: branch.id };
  }

  /**
   * List an organization's branches, for a caller with a claim to it.
   *
   * This takes the actor, which the previous `listBranches(organizationId)` could not: a
   * method with no caller identity can only answer "what is in this organization", and the
   * route in front of it was guarded by nothing stronger than "is this a tenant admin". A
   * branch row is `{ organizationId, tenantId, label }`, so that combination disclosed which
   * tenant ids sit in which organization to any admin on the platform — the tenant
   * infrastructure of a business the platform hosts, which is not a thing a competitor
   * should be able to enumerate.
   *
   * Two authorities are legitimate, and neither is "any tenant admin":
   *  - the organization's **owner**, who may see every branch;
   *  - a caller whose **own tenant is one of the branches**, who needs the group view to
   *    work across it.
   *
   * The refusal is `DomainForbiddenException` rather than an empty list on purpose. A query
   * scoped only to branches the caller may see would answer `[]` with 200, and "no branches"
   * and "not yours" are different facts — only one of which may be disclosed to someone with
   * no claim. This is the same silence that left the quota fail-open and the RBAC table inert
   * looking healthy.
   */
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
      throw Object.assign(new Error('organization not found'), { code: 'ORG_NOT_FOUND' });
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
        { code: 'ORG_NOT_A_MEMBER' },
      );
    }

    return branches;
  }
}
