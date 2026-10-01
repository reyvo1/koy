import { HttpException } from '@nestjs/common';
import { OrganizationService } from './organization.service';
import { OrganizationController } from './organization.controller';
import {
  DomainForbiddenException,
  DomainNotFoundException,
} from '../common/errors/domain-exceptions';
import { ERROR_CODES } from '../common/errors/error-code';

/**
 * Listing another organization's branches, which `AdminRoleGuard` allowed.
 *
 * `GET /organizations/:id/branches` was guarded only by "is this caller a tenant admin". A
 * branch row is `{ organizationId, tenantId, label }`, so the response is a map of which
 * tenant ids belong to which organization — tenant infrastructure a competitor in a
 * multi-tenant hosting product has no business reading, and which this product's own header
 * calls its isolation rather than a feature.
 *
 * The discriminator is 403 rather than an empty list: a scoped query that simply matched
 * nothing would return `[]` with 200, and a caller could not tell "you may not see this" from
 * "this organization has no branches" — which is the same silence that made the quota and the
 * RBAC table look healthy.
 */
const orgId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ownerMembershipId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const ownerTenantId = '44444444-4444-4444-8444-444444444444';
const otherTenantId = '55555555-5555-4555-8555-555555555555';
const outsiderMembershipId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

const branchRows = [
  { id: 'b1', organizationId: orgId, tenantId: ownerTenantId, label: 'HQ', isPrimary: true },
  { id: 'b2', organizationId: orgId, tenantId: otherTenantId, label: 'Depot', isPrimary: false },
];

const makePrisma = () => ({
  organization: { findUnique: jest.fn() },
  organizationBranch: { findMany: jest.fn(), findFirst: jest.fn() },
});

describe('OrganizationService.listBranches authority', () => {
  it('lets the organization owner list every branch', async () => {
    const prisma = makePrisma();
    prisma.organization.findUnique.mockResolvedValue({
      id: orgId,
      ownerMembershipId,
    });
    prisma.organizationBranch.findMany.mockResolvedValue(branchRows);
    const service = new OrganizationService(prisma as never);

    const branches = await service.listBranches({
      organizationId: orgId,
      actorMembershipId: ownerMembershipId,
      actorTenantId: ownerTenantId,
    });

    expect(branches).toHaveLength(2);
  });

  it('refuses a tenant admin who belongs to none of the branches', async () => {
    const prisma = makePrisma();
    prisma.organization.findUnique.mockResolvedValue({ id: orgId, ownerMembershipId });
    prisma.organizationBranch.findMany.mockResolvedValue(branchRows);
    const service = new OrganizationService(prisma as never);

    await expect(
      service.listBranches({
        organizationId: orgId,
        actorMembershipId: outsiderMembershipId,
        actorTenantId: '66666666-6666-4666-8666-666666666666',
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.OrgNotAMember });
  });

  it('lets an admin of one branch tenant see the group they are part of', async () => {
    const prisma = makePrisma();
    prisma.organization.findUnique.mockResolvedValue({ id: orgId, ownerMembershipId });
    prisma.organizationBranch.findMany.mockResolvedValue(branchRows);
    const service = new OrganizationService(prisma as never);

    const branches = await service.listBranches({
      organizationId: orgId,
      actorMembershipId: outsiderMembershipId,
      actorTenantId: otherTenantId,
    });

    // Membership in one branch is the legitimate reason to see the others, and denying it
    // would make the organization feature useless to anyone but its owner.
    expect(branches.map((b) => b.label).sort()).toEqual(['Depot', 'HQ']);
  });

  it('does not leak the existence of an organization to a caller with no standing', async () => {
    const prisma = makePrisma();
    prisma.organization.findUnique.mockResolvedValue({ id: orgId, ownerMembershipId });
    prisma.organizationBranch.findMany.mockResolvedValue([]);
    const service = new OrganizationService(prisma as never);

    // An organization with no branches, read by an outsider: the answer must be a refusal,
    // because "no branches" and "not yours" are different facts and only one of them may be
    // disclosed to someone with no claim to the organization.
    await expect(
      service.listBranches({
        organizationId: orgId,
        actorMembershipId: outsiderMembershipId,
        actorTenantId: '66666666-6666-4666-8666-666666666666',
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.OrgNotAMember });
  });

  it('reports an unknown organization as not found, not as a forbidden read', async () => {
    const prisma = makePrisma();
    prisma.organization.findUnique.mockResolvedValue(null);
    const service = new OrganizationService(prisma as never);

    // Distinguishing these two matters to a caller who mistyped an id: a blanket 403 would
    // send them looking for a permission problem they do not have.
    await expect(
      service.listBranches({
        organizationId: 'no-such-org',
        actorMembershipId: ownerMembershipId,
        actorTenantId: ownerTenantId,
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.OrgNotFound });
  });
});

describe('OrganizationController.branches', () => {
  const buildController = (service: Partial<OrganizationService>) =>
    new OrganizationController(service as OrganizationService);

  const request = (tenantId: string, membershipId: string) => ({
    user: { tenantContext: { tenantId, membershipId } },
  });

  it('passes the verified tenant and membership, never a body or path id', async () => {
    const listBranches = jest.fn().mockResolvedValue([]);
    const controller = buildController({ listBranches });

    await controller.branches(request(ownerTenantId, ownerMembershipId) as never, orgId);

    // The tenant comes from the authenticated context. Taking it from `:id` or the body would
    // let a caller re-assert the identity the check is supposed to be comparing against.
    expect(listBranches).toHaveBeenCalledWith({
      organizationId: orgId,
      actorMembershipId: ownerMembershipId,
      actorTenantId: ownerTenantId,
    });
  });

  it('refuses a request with no tenant context instead of reading an undefined tenant', async () => {
    const listBranches = jest.fn().mockResolvedValue([]);
    const controller = buildController({ listBranches });

    await expect(
      controller.branches({ user: {} } as never, orgId),
    ).rejects.toBeInstanceOf(DomainForbiddenException);
    expect(listBranches).not.toHaveBeenCalled();
  });

  it('translates a not-a-member refusal into 403 rather than letting it reach the client as 500', async () => {
    // `OrganizationService` signals with a plain Error carrying a `code`, and
    // `GlobalExceptionFilter` maps only `HttpException`. Without the translation the
    // disclosure refusal would be reported as a server fault — the same latent-500 shape
    // found in the quota path and in `IntegrationRegistryService`.
    const listBranches = jest
      .fn()
      .mockRejectedValue(Object.assign(new Error('nope'), { code: ERROR_CODES.OrgNotAMember }));
    const controller = buildController({ listBranches });

    await expect(
      controller.branches(request(ownerTenantId, ownerMembershipId) as never, orgId),
    ).rejects.toBeInstanceOf(DomainForbiddenException);
  });

  it('translates a not-found organization into 404, not a blanket 403', async () => {
    const listBranches = jest
      .fn()
      .mockRejectedValue(Object.assign(new Error('gone'), { code: ERROR_CODES.OrgNotFound }));
    const controller = buildController({ listBranches });

    const thrown = (await controller
      .branches(request(ownerTenantId, ownerMembershipId) as never, orgId)
      .catch((e: unknown) => e)) as HttpException;

    // The code travels in the response body, not on the exception instance — assert what a
    // client actually receives rather than an object shape that never existed.
    expect(thrown).toBeInstanceOf(DomainNotFoundException);
    expect(thrown.getStatus()).toBe(404);
    expect(thrown.getResponse()).toMatchObject({ code: ERROR_CODES.OrgNotFound });
  });
});
