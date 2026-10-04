import { OrganizationController } from './organization.controller';
import { RbacAuditController } from '../rbac/rbac-audit.controller';

/**
 * Both controllers wrap services that already existed and were already tested. What these
 * tests protect is the part the service specs cannot see: that each service refusal reaches
 * the client as its real status, and that the audit query's own parsing cannot be turned
 * into a silently-wrong page.
 *
 * The failure being guarded is specific. `GlobalExceptionFilter` maps only HttpException, so
 * an untranslated refusal arrives as 500 — telling an operator the server is broken when the
 * real problem is a duplicate owner or someone else's branch.
 */
const CTX = {
  user: {
    tenantContext: {
      tenantId: '11111111-1111-4111-8111-111111111111',
      membershipId: '22222222-2222-4222-8222-222222222222',
    },
  },
};

describe('OrganizationController', () => {
  const svc = (over: Record<string, jest.Mock> = {}) =>
    ({
      listOrganizations: jest.fn().mockResolvedValue({ total: 0, bounded: false, items: [] }),
      createOrganization: jest.fn().mockResolvedValue({ id: 'org-1' }),
      getTenantOrganization: jest.fn().mockResolvedValue(null),
      addBranch: jest.fn().mockResolvedValue({ id: 'branch-1' }),
      removeBranch: jest.fn().mockResolvedValue({ organizationId: 'org-1', tenantId: CTX.user.tenantContext.tenantId, removed: true }),
      deleteOrganization: jest.fn().mockResolvedValue({ id: 'org-1', deleted: true }),
      listBranches: jest.fn().mockResolvedValue([]),
      ...over,
    }) as any;

  it('lists the bounded platform organization directory through the service', async () => {
    const listOrganizations = jest.fn().mockResolvedValue({ total: 1, bounded: false, items: [{ id: 'org-1' }] });
    await expect(new OrganizationController(svc({ listOrganizations })).list(CTX)).resolves.toEqual({
      total: 1,
      bounded: false,
      items: [{ id: 'org-1' }],
    });
    expect(listOrganizations).toHaveBeenCalledWith(CTX.user.tenantContext.membershipId);
  });

  it('resolves current organization from the verified tenant context only', async () => {
    const getTenantOrganization = jest.fn().mockResolvedValue({ id: 'org-1' });
    await expect(new OrganizationController(svc({ getTenantOrganization })).current(CTX)).resolves.toEqual({
      organization: { id: 'org-1' },
    });
    expect(getTenantOrganization).toHaveBeenCalledWith(CTX.user.tenantContext.tenantId);
  });

  it('creates an organization with the caller membership as owner', async () => {
    const organizationService = svc();
    const result = await new OrganizationController(organizationService).create(CTX, {
      name: 'Aurora Group',
      firstBranchTenantId: CTX.user.tenantContext.tenantId,
      firstBranchLabel: 'Hotel Aurora',
    });

    expect(result).toEqual({ id: 'org-1' });
    expect(organizationService.createOrganization).toHaveBeenCalledWith({
      ownerMembershipId: CTX.user.tenantContext.membershipId,
      name: 'Aurora Group',
      firstBranchTenantId: CTX.user.tenantContext.tenantId,
      firstBranchLabel: 'Hotel Aurora',
    });
  });

  it.each([
    ['ORG_ALREADY_EXISTS', 409],
    ['ORG_NOT_OWNER', 403],
    ['ORG_BRANCH_TENANT_CONFLICT', 409],
    ['ORG_BRANCH_ALREADY_MEMBER', 409],
    ['ORG_BRANCH_TENANT_NOT_FOUND', 404],
    ['ORG_BRANCH_NOT_FOUND', 404],
    ['ORG_PRIMARY_BRANCH_REMOVAL_FORBIDDEN', 409],
    ['VALIDATION_FAILED', 400],
  ])('translates %s to HTTP %i rather than 500', async (code, status) => {
    const organizationService = svc({
      addBranch: jest.fn().mockRejectedValue(Object.assign(new Error('x'), { code })),
    });

    await expect(
      new OrganizationController(organizationService).addBranch(CTX, {
        organizationId: 'org-1',
        tenantId: '22222222-2222-4222-8222-222222222222',
        label: 'Second Branch',
      }),
    ).rejects.toMatchObject({ status, response: { code } });
  });

  it('removes a non-primary branch through the verified platform membership', async () => {
    const removeBranch = jest.fn().mockResolvedValue({
      organizationId: 'org-1',
      tenantId: CTX.user.tenantContext.tenantId,
      removed: true,
    });
    await expect(
      new OrganizationController(svc({ removeBranch })).removeBranch(
        CTX,
        'org-1',
        CTX.user.tenantContext.tenantId,
      ),
    ).resolves.toMatchObject({ removed: true });
    expect(removeBranch).toHaveBeenCalledWith({
      actorMembershipId: CTX.user.tenantContext.membershipId,
      organizationId: 'org-1',
      tenantId: CTX.user.tenantContext.tenantId,
    });
  });

  it('deletes only the organization grouping through the verified platform membership', async () => {
    const deleteOrganization = jest.fn().mockResolvedValue({ id: 'org-1', deleted: true });
    await expect(
      new OrganizationController(svc({ deleteOrganization })).remove(CTX, 'org-1'),
    ).resolves.toEqual({ id: 'org-1', deleted: true });
    expect(deleteOrganization).toHaveBeenCalledWith({
      actorMembershipId: CTX.user.tenantContext.membershipId,
      organizationId: 'org-1',
    });
  });

  it('passes an unrelated failure through untouched', async () => {
    const boom = new Error('prisma exploded');
    const organizationService = svc({
      listBranches: jest.fn().mockRejectedValue(boom),
    });

    await expect(
      new OrganizationController(organizationService).branches(
        {
          user: {
            tenantContext: {
              tenantId: CTX.user.tenantContext.tenantId,
              membershipId: 'membership-1',
            },
          },
        },
        'org-1',
      ),
    ).rejects.toBe(boom);
  });

  it('refuses to act without a membership in context', async () => {
    const organizationService = svc();

    await expect(
      new OrganizationController(organizationService).create(
        { user: { tenantContext: { tenantId: CTX.user.tenantContext.tenantId } } },
        {
          name: 'Aurora Group',
          firstBranchTenantId: CTX.user.tenantContext.tenantId,
          firstBranchLabel: 'Hotel Aurora',
        },
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(organizationService.createOrganization).not.toHaveBeenCalled();
  });
});

describe('RbacAuditController', () => {
  const audit = (over: Record<string, jest.Mock> = {}) =>
    ({ queryAuditLog: jest.fn().mockResolvedValue({ items: [], nextCursor: null }), ...over }) as any;

  it('scopes the query to the verified tenant, never to a query parameter', async () => {
    const queryAuditLog = jest.fn().mockResolvedValue({ items: [], nextCursor: null });
    await new RbacAuditController(audit({ queryAuditLog })).list(
      CTX,
      'scene',
      'CREATE',
      '10',
    );

    expect(queryAuditLog).toHaveBeenCalledWith({
      tenantId: CTX.user.tenantContext.tenantId,
      resourceType: 'scene',
      action: 'CREATE',
      limit: 10,
      cursor: undefined,
    });
  });

  it('rejects an unknown action instead of ignoring it', async () => {
    const queryAuditLog = jest.fn();
    // Silently dropping the filter would return an unfiltered page that looks filtered.
    await expect(
      new RbacAuditController(audit({ queryAuditLog })).list(CTX, undefined, 'NOPE'),
    ).rejects.toMatchObject({ status: 400 });
    expect(queryAuditLog).not.toHaveBeenCalled();
  });

  it('rejects a malformed cursor rather than silently restarting the list', async () => {
    const queryAuditLog = jest.fn();
    // A silently reset cursor would repeat page one forever with no error surfacing.
    await expect(
      new RbacAuditController(audit({ queryAuditLog })).list(CTX, undefined, undefined, undefined, 'garbage'),
    ).rejects.toMatchObject({ status: 400 });
    expect(queryAuditLog).not.toHaveBeenCalled();
  });

  it('rejects a non-integer limit', async () => {
    const queryAuditLog = jest.fn();
    await expect(
      new RbacAuditController(audit({ queryAuditLog })).list(CTX, undefined, undefined, '0'),
    ).rejects.toMatchObject({ status: 400 });
    expect(queryAuditLog).not.toHaveBeenCalled();
  });

  it('decodes a cursor this controller itself produced', async () => {
    const queryAuditLog = jest.fn().mockResolvedValue({ items: [], nextCursor: null });
    const created = { createdAt: '2026-01-02T03:04:05.000Z', id: 'row-9' };
    const encoded = Buffer.from(JSON.stringify(created)).toString('base64url');

    await new RbacAuditController(audit({ queryAuditLog })).list(
      CTX,
      undefined,
      undefined,
      undefined,
      encoded,
    );

    expect(queryAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: { createdAt: new Date(created.createdAt), id: 'row-9' } }),
    );
  });
});
