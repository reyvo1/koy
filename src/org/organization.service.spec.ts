import { PrismaService } from '../prisma/prisma.service';
import { OrganizationService } from './organization.service';

const owner = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const branchTenant = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('OrganizationService', () => {
  let orgFindUnique: jest.Mock;
  let orgFindMany: jest.Mock;
  let organizationCreate: jest.Mock;
  let organizationCount: jest.Mock;
  let organizationDeleteMany: jest.Mock;
  let branchCreate: jest.Mock;
  let branchFindMany: jest.Mock;
  let branchFindUnique: jest.Mock;
  let branchFindFirst: jest.Mock;
  let branchDeleteMany: jest.Mock;
  let tenantFindUnique: jest.Mock;
  let transaction: jest.Mock;
  let service: OrganizationService;

  beforeEach(() => {
    orgFindUnique = jest.fn().mockResolvedValue(null);
    orgFindMany = jest.fn().mockResolvedValue([]);
    organizationCreate = jest.fn().mockResolvedValue({ id: 'org1' });
    organizationCount = jest.fn().mockResolvedValue(0);
    organizationDeleteMany = jest.fn().mockResolvedValue({ count: 1 });
    branchCreate = jest.fn().mockResolvedValue({ id: 'br1' });
    branchFindMany = jest.fn().mockResolvedValue([]);
    branchFindUnique = jest.fn().mockResolvedValue(null);
    branchFindFirst = jest.fn().mockResolvedValue(null);
    branchDeleteMany = jest.fn().mockResolvedValue({ count: 1 });
    tenantFindUnique = jest.fn().mockResolvedValue({ id: branchTenant });
    const tx = {
      organization: {
        findUnique: orgFindUnique,
        create: organizationCreate,
        deleteMany: organizationDeleteMany,
      },
      organizationBranch: {
        create: branchCreate,
        findFirst: branchFindFirst,
        deleteMany: branchDeleteMany,
      },
      tenant: { findUnique: tenantFindUnique },
    };
    transaction = jest.fn((cb: (value: typeof tx) => unknown) => cb(tx));
    service = new OrganizationService({
      organization: {
        findUnique: orgFindUnique,
        findMany: orgFindMany,
        count: organizationCount,
        create: organizationCreate,
        deleteMany: organizationDeleteMany,
      },
      organizationBranch: {
        create: branchCreate,
        findMany: branchFindMany,
        findUnique: branchFindUnique,
        findFirst: branchFindFirst,
        deleteMany: branchDeleteMany,
      },
      tenant: { findUnique: tenantFindUnique },
      $transaction: transaction,
    } as unknown as PrismaService);
  });

  it('returns a bounded platform directory without exposing internal Prisma shapes', async () => {
    organizationCount.mockResolvedValue(1);
    orgFindMany.mockResolvedValue([
      {
        id: 'org1',
        name: 'Rey Group',
        createdAt: new Date('2026-10-04T00:00:00Z'),
        ownerMembership: { id: owner, user: { email: 'owner@example.test' } },
        branches: [
          {
            id: 'br1',
            tenantId: branchTenant,
            label: 'HQ',
            isPrimary: true,
            createdAt: new Date('2026-10-04T00:01:00Z'),
            tenant: { name: 'Tenant A' },
          },
        ],
      },
    ]);

    await expect(service.listOrganizations(owner)).resolves.toEqual({
      total: 1,
      bounded: false,
      items: [
        expect.objectContaining({
          id: 'org1',
          ownerMembershipId: owner,
          ownerEmail: 'owner@example.test',
          canManage: true,
          branches: [expect.objectContaining({ tenantId: branchTenant, tenantName: 'Tenant A' })],
        }),
      ],
    });
  });

  it('resolves the active tenant organization without accepting an organization id from the caller', async () => {
    branchFindUnique.mockResolvedValue({
      organization: {
        id: 'org1',
        name: 'Rey Group',
        createdAt: new Date('2026-10-04T00:00:00Z'),
        branches: [
          {
            id: 'br1',
            tenantId: branchTenant,
            label: 'HQ',
            isPrimary: true,
            createdAt: new Date('2026-10-04T00:01:00Z'),
            tenant: { name: 'Tenant A' },
          },
        ],
      },
    });

    await expect(service.getTenantOrganization(branchTenant)).resolves.toEqual({
      id: 'org1',
      name: 'Rey Group',
      createdAt: '2026-10-04T00:00:00.000Z',
      branches: [expect.objectContaining({ tenantId: branchTenant, tenantName: 'Tenant A' })],
    });
    expect(branchFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: branchTenant } }),
    );
  });

  it('returns null when the active tenant does not belong to an organization', async () => {
    await expect(service.getTenantOrganization(branchTenant)).resolves.toBeNull();
  });

  it('creates an organization with a primary first branch atomically', async () => {
    const result = await service.createOrganization({
      ownerMembershipId: owner,
      name: ' Rey Group ',
      firstBranchTenantId: branchTenant,
      firstBranchLabel: ' HQ ',
    });

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(result.id).toBe('org1');
    expect(branchCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ label: 'HQ', isPrimary: true }),
      }),
    );
  });

  it('validates normalized organization and branch labels before starting a transaction', async () => {
    await expect(
      service.createOrganization({
        ownerMembershipId: owner,
        name: '   a   ',
        firstBranchTenantId: branchTenant,
        firstBranchLabel: 'HQ',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(
      service.addBranch({
        actorMembershipId: owner,
        organizationId: 'org1',
        tenantId: branchTenant,
        label: '   b   ',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejects a second organization for the same owner', async () => {
    orgFindUnique.mockResolvedValueOnce({ id: 'org-existing' });
    await expect(
      service.createOrganization({
        ownerMembershipId: owner,
        name: 'Second',
        firstBranchTenantId: branchTenant,
        firstBranchLabel: 'HQ',
      }),
    ).rejects.toMatchObject({ code: 'ORG_ALREADY_EXISTS' });
    expect(organizationCreate).not.toHaveBeenCalled();
  });

  it('rejects a missing first-branch tenant before writing anything', async () => {
    tenantFindUnique.mockResolvedValue(null);
    await expect(
      service.createOrganization({
        ownerMembershipId: owner,
        name: 'No tenant',
        firstBranchTenantId: branchTenant,
        firstBranchLabel: 'HQ',
      }),
    ).rejects.toMatchObject({ code: 'ORG_BRANCH_TENANT_NOT_FOUND' });
    expect(organizationCreate).not.toHaveBeenCalled();
  });

  it('rejects a first branch already assigned to another organization', async () => {
    branchFindFirst.mockResolvedValue({ organizationId: 'other-org' });
    await expect(
      service.createOrganization({
        ownerMembershipId: owner,
        name: 'Conflict',
        firstBranchTenantId: branchTenant,
        firstBranchLabel: 'HQ',
      }),
    ).rejects.toMatchObject({ code: 'ORG_BRANCH_TENANT_CONFLICT' });
    expect(organizationCreate).not.toHaveBeenCalled();
  });

  it('allows only the owner to add branches and uses one transaction for validation+write', async () => {
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
      label: ' Branch B ',
    });
    expect(transaction).toHaveBeenCalledTimes(2);
    expect(branchCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ label: 'Branch B' }) }),
    );
  });

  it('refuses a missing branch tenant', async () => {
    orgFindUnique.mockResolvedValue({ id: 'org1', ownerMembershipId: owner });
    tenantFindUnique.mockResolvedValue(null);
    await expect(
      service.addBranch({
        actorMembershipId: owner,
        organizationId: 'org1',
        tenantId: branchTenant,
        label: 'Branch B',
      }),
    ).rejects.toMatchObject({ code: 'ORG_BRANCH_TENANT_NOT_FOUND' });
    expect(branchCreate).not.toHaveBeenCalled();
  });

  it('distinguishes an existing branch in the same organization from another organization', async () => {
    orgFindUnique.mockResolvedValue({ id: 'org1', ownerMembershipId: owner });
    branchFindFirst.mockResolvedValueOnce({ organizationId: 'org1' });
    await expect(
      service.addBranch({ actorMembershipId: owner, organizationId: 'org1', tenantId: branchTenant, label: 'Branch B' }),
    ).rejects.toMatchObject({ code: 'ORG_BRANCH_ALREADY_MEMBER' });

    branchFindFirst.mockResolvedValueOnce({ organizationId: 'someone-elses-org' });
    await expect(
      service.addBranch({ actorMembershipId: owner, organizationId: 'org1', tenantId: branchTenant, label: 'Branch B' }),
    ).rejects.toMatchObject({ code: 'ORG_BRANCH_TENANT_CONFLICT' });
    expect(branchCreate).not.toHaveBeenCalled();
  });

  it('translates a concurrent unique-tenant race into a stable conflict instead of 500', async () => {
    orgFindUnique.mockResolvedValue({ id: 'org1', ownerMembershipId: owner });
    branchCreate.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));
    await expect(
      service.addBranch({ actorMembershipId: owner, organizationId: 'org1', tenantId: branchTenant, label: 'Branch B' }),
    ).rejects.toMatchObject({ code: 'ORG_BRANCH_TENANT_CONFLICT' });
  });

  it('removes only a non-primary branch owned by the caller', async () => {
    orgFindUnique.mockResolvedValue({ id: 'org1', ownerMembershipId: owner });
    branchFindFirst.mockResolvedValue({ id: 'br-secondary', isPrimary: false });

    await expect(
      service.removeBranch({ actorMembershipId: owner, organizationId: 'org1', tenantId: branchTenant }),
    ).resolves.toEqual({ organizationId: 'org1', tenantId: branchTenant, removed: true });
    expect(branchDeleteMany).toHaveBeenCalledWith({
      where: {
        id: 'br-secondary',
        organizationId: 'org1',
        tenantId: branchTenant,
        isPrimary: false,
      },
    });
  });

  it('refuses direct removal of the primary branch', async () => {
    orgFindUnique.mockResolvedValue({ id: 'org1', ownerMembershipId: owner });
    branchFindFirst.mockResolvedValue({ id: 'br-primary', isPrimary: true });

    await expect(
      service.removeBranch({ actorMembershipId: owner, organizationId: 'org1', tenantId: branchTenant }),
    ).rejects.toMatchObject({ code: 'ORG_PRIMARY_BRANCH_REMOVAL_FORBIDDEN' });
    expect(branchDeleteMany).not.toHaveBeenCalled();
  });

  it('deletes organization grouping atomically without deleting tenants', async () => {
    orgFindUnique.mockResolvedValue({ id: 'org1', ownerMembershipId: owner });

    await expect(
      service.deleteOrganization({ actorMembershipId: owner, organizationId: 'org1' }),
    ).resolves.toEqual({ id: 'org1', deleted: true });
    expect(organizationDeleteMany).toHaveBeenCalledWith({
      where: { id: 'org1', ownerMembershipId: owner },
    });
    expect(transaction).toHaveBeenCalled();
  });

  it('does not let a different platform membership remove a branch or organization', async () => {
    orgFindUnique.mockResolvedValue({ id: 'org1', ownerMembershipId: owner });
    const other = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

    await expect(
      service.removeBranch({ actorMembershipId: other, organizationId: 'org1', tenantId: branchTenant }),
    ).rejects.toMatchObject({ code: 'ORG_NOT_OWNER' });
    await expect(
      service.deleteOrganization({ actorMembershipId: other, organizationId: 'org1' }),
    ).rejects.toMatchObject({ code: 'ORG_NOT_OWNER' });
    expect(branchDeleteMany).not.toHaveBeenCalled();
    expect(organizationDeleteMany).not.toHaveBeenCalled();
  });
});
