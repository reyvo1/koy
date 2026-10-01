import { OwnedResourceResolver } from './owned-resource.resolver';

/**
 * The ownership lookup is the one place where a mistake becomes a cross-tenant read, so these
 * tests pin the tenant predicate explicitly rather than trusting the happy path.
 */
describe('OwnedResourceResolver', () => {
  const findFirst = jest.fn();
  const prisma = { automation: { findFirst }, dashboard: { findFirst } } as never;
  const resolver = new OwnedResourceResolver(prisma);

  beforeEach(() => {
    findFirst.mockReset();
  });

  it('scopes an automation lookup by tenant AND owner', async () => {
    findFirst.mockResolvedValue({ id: 'a1' });
    await expect(resolver.isOwnedBy('automation', 'a1', 'm1', 't1')).resolves.toBe(true);
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'a1', tenantId: 't1', ownerMembershipId: 'm1' },
      select: { id: true },
    });
  });

  it('scopes a dashboard lookup by tenant AND owner', async () => {
    findFirst.mockResolvedValue({ id: 'd1' });
    await expect(resolver.isOwnedBy('dashboard', 'd1', 'm1', 't1')).resolves.toBe(true);
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'd1', tenantId: 't1', ownerMembershipId: 'm1' },
      select: { id: true },
    });
  });

  it('returns false when the row belongs to a different owner', async () => {
    findFirst.mockResolvedValue(null);
    await expect(resolver.isOwnedBy('automation', 'a1', 'other', 't1')).resolves.toBe(false);
  });

  it('refuses to resolve a resource type that has no owner column', async () => {
    // scene and schedule are in this position on purpose: a `true` here would let a member
    // reach any scene in the tenant through the owner path of RbacPermissionGuard.
    await expect(resolver.isOwnedBy('scene', 's1', 'm1', 't1')).resolves.toBe(false);
    await expect(resolver.isOwnedBy('schedule', 'h1', 'm1', 't1')).resolves.toBe(false);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('never queries the database for an unknown resource type', async () => {
    await expect(resolver.isOwnedBy('device', 'x', 'm1', 't1')).resolves.toBe(false);
    expect(findFirst).not.toHaveBeenCalled();
  });
});
