import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ResourceOwnershipResolver } from './resource-ownership';

/**
 * Ownership lookups for the two domains whose model actually records an owner.
 *
 * `Automation` and `Dashboard` both carry `ownerMembershipId`. Nothing compared it before this
 * class existed — the field was set on create and then never read for authorization. These
 * lookups are what make the declared "owner-or-admin" policy real.
 *
 * `Scene` and `Schedule` are absent on purpose: neither model has an owner column, so there is
 * nothing to resolve. Inventing one here would have required a migration and a backfill, which
 * is a product decision, not a refactor.
 */
@Injectable()
export class OwnedResourceResolver implements ResourceOwnershipResolver {
  constructor(private readonly prisma: PrismaService) {}

  async isOwnedBy(
    resourceType: string,
    resourceId: string,
    membershipId: string,
    tenantId: string,
  ): Promise<boolean> {
    // Both queries are scoped by tenant as well as by owner. The tenant predicate is the
    // important half: without it a membership could claim ownership of a resource in another
    // tenant and reach it through the owner path of `RbacPermissionGuard`.
    switch (resourceType) {
      case 'automation': {
        const row = await this.prisma.automation.findFirst({
          where: { id: resourceId, tenantId, ownerMembershipId: membershipId },
          select: { id: true },
        });
        return row !== null;
      }
      case 'dashboard': {
        const row = await this.prisma.dashboard.findFirst({
          where: { id: resourceId, tenantId, ownerMembershipId: membershipId },
          select: { id: true },
        });
        return row !== null;
      }
      default:
        return false;
    }
  }
}
