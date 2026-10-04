import { Injectable, Type } from '@nestjs/common';

/**
 * Ownership is a relation, not a permission.
 *
 * `Automation` and `Dashboard` both carry `ownerMembershipId`, and neither controller ever
 * compared it — ownership was decoration. The policy engine only knows roles and permission
 * strings, so it cannot express "the member who created this may still change it, but an admin
 * may change anyone's". This file adds that missing dimension without inventing a new role and
 * without pretending a permission string can encode it.
 *
 * `Scene` and `Schedule` deliberately do NOT register an ownership resolver: neither model has
 * an owner field, so there is nothing to compare. Their authorization is enforced elsewhere from
 * referenced-device VIEW/CONTROL (and Schedule's target Scene), so absence from this registry must
 * never be interpreted as open tenant-wide access.
 */
export interface ResourceOwnershipResolver {
  /**
   * True when `resourceId` belongs to `membershipId` inside `tenantId`.
   *
   * Must be tenant-scoped. Returning true for a resource in another tenant would let a
   * cross-tenant write through the owner path, which is the one thing this must never do.
   */
  isOwnedBy(
    resourceType: string,
    resourceId: string,
    membershipId: string,
    tenantId: string,
  ): Promise<boolean>;
}

/**
 * Registry of per-resource ownership resolvers, keyed by the `resourceType` derived from the
 * permission prefix (`automation.update` -> `automation`).
 *
 * A domain registers its own lookup. The guard consults it only after the role check has
 * already denied, so ownership can only ever *widen* access for the caller's own resource and
 * never bypass tenant scoping.
 */
@Injectable()
export class ResourceOwnershipRegistry {
  private readonly resolvers = new Map<string, Type<ResourceOwnershipResolver>>();

  register(resourceType: string, resolver: Type<ResourceOwnershipResolver>): void {
    this.resolvers.set(resourceType, resolver);
  }

  has(resourceType: string): boolean {
    return this.resolvers.has(resourceType);
  }

  get(resourceType: string): Type<ResourceOwnershipResolver> | undefined {
    return this.resolvers.get(resourceType);
  }
}

/** Injection helper so a domain module can hand its resolver to the registry. */
@Injectable()
export class ResourceOwnershipRegistrar {
  constructor(private readonly registry: ResourceOwnershipRegistry) {}

  register(resourceType: string, resolver: Type<ResourceOwnershipResolver>): void {
    this.registry.register(resourceType, resolver);
  }
}
