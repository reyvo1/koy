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
    const branch = await this.prisma.organizationBranch.create({
      data: {
        organizationId: input.organizationId,
        tenantId: input.tenantId,
        label: input.label.trim(),
      },
    });
    return { id: branch.id };
  }

  async listBranches(organizationId: string) {
    return this.prisma.organizationBranch.findMany({
      where: { organizationId },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });
  }
}
