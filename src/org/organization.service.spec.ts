import { PrismaService } from '../prisma/prisma.service';
import { OrganizationService } from './organization.service';

const owner = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const branchTenant = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('OrganizationService', () => {
  let orgFindUnique: jest.Mock;
  let organizationCreate: jest.Mock;
  let branchCreate: jest.Mock;
  let branchFindMany: jest.Mock;
  let branchFindFirst: jest.Mock;
  let service: OrganizationService;

  beforeEach(() => {
    orgFindUnique = jest.fn().mockResolvedValue(null);
    organizationCreate = jest.fn().mockResolvedValue({ id: 'org1' });
    branchCreate = jest.fn().mockResolvedValue({ id: 'br1' });
    branchFindMany = jest.fn().mockResolvedValue([]);
    branchFindFirst = jest.fn().mockResolvedValue(null);
    service = new OrganizationService({
      organization: { findUnique: orgFindUnique, create: organizationCreate },
      organizationBranch: {
        create: branchCreate,
        findMany: branchFindMany,
        findFirst: branchFindFirst,
      },
      $transaction: jest.fn((cb: (tx: unknown) => unknown) =>
        cb({
          organization: { findUnique: orgFindUnique, create: organizationCreate },
          organizationBranch: { create: branchCreate },
        }),
      ),
    } as unknown as PrismaService);
  });

  it('creates an organization with a primary first branch atomically', async () => {
    const result = await service.createOrganization({
      ownerMembershipId: owner,
      name: 'Rey Group',
      firstBranchTenantId: branchTenant,
      firstBranchLabel: 'HQ',
    });

    expect(result.id).toBe('org1');
    expect(branchCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isPrimary: true }),
      }),
    );
  });

  it('rejects a second organization for the same owner', async () => {
    orgFindUnique.mockResolvedValueOnce({ id: 'org-existing' });
    await expect(
      service.createOrganization({
        ownerMembershipId: owner,
        name: 'Second',
        firstBranchTenantId: branchTenant,
        firstBranchLabel: 'X',
      }),
    ).rejects.toMatchObject({ code: 'ORG_ALREADY_EXISTS' });
  });

  it('allows only the owner to add branches', async () => {
    orgFindUnique.mockResolvedValue({ id: 'org1', ownerMembershipId: owner });

    await expect(
      service.addBranch({
        actorMembershipId: 'not-the-owner-0000000000000000',
        organizationId: 'org1',
        tenantId: branchTenant,
        label: 'Branch B',
      }),
    ).rejects.toMatchObject({ code: 'ORG_NOT_OWNER' });

    await service.addBranch({
      actorMembershipId: owner,
      organizationId: 'org1',
      tenantId: branchTenant,
      label: 'Branch B',
    });
    expect(branchCreate).toHaveBeenCalledTimes(1);
  });

  it('refuses to attach a tenant that already belongs to another organization', async () => {
    orgFindUnique.mockResolvedValue({ id: 'org1', ownerMembershipId: owner });
    branchFindFirst.mockResolvedValue({ organizationId: 'someone-elses-org' });

    await expect(
      service.addBranch({
        actorMembershipId: owner,
        organizationId: 'org1',
        tenantId: branchTenant,
        label: 'Branch B',
      }),
    ).rejects.toMatchObject({ code: 'ORG_BRANCH_TENANT_CONFLICT' });

    // The cross-tenant branch must not be written at all.
    expect(branchCreate).not.toHaveBeenCalled();
  });
});
