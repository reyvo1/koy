import { AdminUserProvisioningService } from './admin-user-provisioning.service';
import { DomainConflictException } from '../common/errors/domain-exceptions';

describe('AdminUserProvisioningService', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';

  const buildService = (overrides: Record<string, unknown> = {}) => {
    const prisma = {
      tenant: { findUnique: jest.fn().mockResolvedValue({ id: tenantId }) },
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 'user-1',
          email: 'baru@demo.id',
          name: 'Baru',
          createdAt: new Date('2026-08-29T00:00:00Z'),
          memberships: [{ role: 'ADMIN' }],
        }),
        ...overrides,
      },
    };
    return { service: new AdminUserProvisioningService(prisma as never), prisma };
  };

  it('creates a verified user with membership and hashed credential', async () => {
    const { service, prisma } = buildService();

    const result = await service.createUser({
      tenantId,
      email: 'baru@demo.id',
      name: 'Baru',
      password: 'Password123!',
      role: 'ADMIN',
    });

    expect(result.role).toBe('ADMIN');
    expect(result.id).toBe('user-1');
    const createArg = prisma.user.create.mock.calls[0][0];
    expect(createArg.data.isVerified).toBe(true);
    expect(createArg.data.memberships.create.role).toBe('ADMIN');
    expect(createArg.data.credential.create.passwordHash).toBeDefined();
  });

  it('rejects duplicates with a domain conflict', async () => {
    const { service } = buildService({
      findUnique: jest.fn().mockResolvedValue({ id: 'existing' }),
    });

    await expect(
      service.createUser({
        tenantId,
        email: 'baru@demo.id',
        password: 'Password123!',
        role: 'MEMBER',
      }),
    ).rejects.toBeInstanceOf(DomainConflictException);
  });

  it('rejects unknown tenants as not found', async () => {
    const prisma = {
      tenant: { findUnique: jest.fn().mockResolvedValue(null) },
      user: { findUnique: jest.fn() },
    };
    const service = new AdminUserProvisioningService(prisma as never);

    await expect(
      service.createUser({
        tenantId: 'missing',
        email: 'x@y.id',
        password: 'Password123!',
        role: 'MEMBER',
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('updates role and name via updateUser', async () => {
    const membershipUpdate = jest.fn().mockResolvedValue({});
    const userUpdate = jest.fn().mockResolvedValue({});
    const { service, prisma } = buildService();
    (prisma as Record<string, unknown>).membership = {
      findUnique: jest.fn().mockResolvedValue({
        id: 'm-1',
        role: 'MEMBER',
        user: { name: 'Lama' },
      }),
      update: membershipUpdate,
    };
    (prisma as Record<string, unknown>).user = {
      ...prisma.user,
      update: userUpdate,
    };

    const result = await service.updateUser(
      { userId: 'user-1', tenantId },
      { role: 'ADMIN', name: 'Baru Nama' },
      'actor-1',
    );

    expect(result.role).toBe('ADMIN');
    expect(result.name).toBe('Baru Nama');
    expect(userUpdate).toHaveBeenCalled();
    expect(membershipUpdate).toHaveBeenCalled();
  });

  it('blocks self role/status mutation', async () => {
    const { service, prisma } = buildService();
    (prisma as Record<string, unknown>).membership = {
      findUnique: jest.fn().mockResolvedValue({
        id: 'm-1',
        role: 'ADMIN',
        user: { name: null },
      }),
    };

    await expect(
      service.updateUser(
        { userId: 'user-1', tenantId },
        { role: 'MEMBER' },
        'user-1',
      ),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('surfaces FK restriction on delete as a domain conflict', async () => {
    const { service, prisma } = buildService();
    (prisma as Record<string, unknown>).membership = {
      findUnique: jest.fn().mockResolvedValue({
        id: 'm-1',
        role: 'MEMBER',
        user: { name: null },
      }),
      deleteMany: jest.fn(),
    };
    (prisma as Record<string, unknown>).refreshToken = { deleteMany: jest.fn() };
    (prisma as Record<string, unknown>).refreshTokenFamily = { deleteMany: jest.fn() };
    (prisma as Record<string, unknown>).userCredential = { deleteMany: jest.fn() };
    (prisma as Record<string, unknown>).user = {
      ...prisma.user,
      delete: jest.fn().mockResolvedValue({}),
    };
    (prisma as unknown as { $transaction: unknown }).$transaction = jest
      .fn()
      .mockRejectedValue(Object.assign(new Error('FK'), { code: 'P2003' }));

    await expect(
      service.deleteUser({ userId: 'user-1', tenantId }, 'actor-1'),
    ).rejects.toBeInstanceOf(DomainConflictException);
  });

  it('resetPassword upserts credential and revokes refresh families', async () => {
    const { service, prisma } = buildService();
    (prisma as Record<string, unknown>).membership = {
      findUnique: jest.fn().mockResolvedValue({
        id: 'm-1',
        role: 'MEMBER',
        user: { name: null },
      }),
    };
    const upsert = jest.fn().mockResolvedValue({});
    const families = jest.fn().mockResolvedValue({});
    (prisma as Record<string, unknown>).userCredential = { upsert };
    (prisma as Record<string, unknown>).refreshTokenFamily = { deleteMany: families };
    (prisma as unknown as { $transaction: unknown }).$transaction = jest
      .fn()
      .mockResolvedValue([]);

    await service.resetPassword({ userId: 'user-1', tenantId }, 'Password123!');

    expect(upsert).toHaveBeenCalled();
    expect(families).toHaveBeenCalled();
  });

  it('lists analytics findings across tenants with tenant names', async () => {
    const { service, prisma } = buildService();
    (prisma as Record<string, unknown>).analyticsFinding = {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'f-1',
          deviceId: 'dev-1',
          capabilityKey: 'sensor.temperature',
          kind: 'ANOMALY',
          severity: 'WARNING',
          summary: 'Suhu naik',
          confidence: 0.9,
          createdAt: new Date('2026-08-29T00:00:00Z'),
          tenant: { name: 'Demo Hotel' },
        },
      ]),
    };

    const result = await service.listAllFindings(10);

    expect(result.total).toBe(1);
    expect(result.items[0].tenantName).toBe('Demo Hotel');
  });
  it('preserves revoked membership state in tenant and platform directories', async () => {
    const revokedMembership = {
      id: 'm-revoked',
      tenantId,
      role: 'ADMIN',
      status: 'REVOKED',
    };
    const row = {
      id: 'user-revoked',
      email: 'revoked@demo.id',
      name: 'Revoked User',
      isVerified: true,
      tenantId,
      createdAt: new Date('2026-08-29T00:00:00Z'),
      tenant: { name: 'Demo Tenant' },
      memberships: [revokedMembership],
    };
    const prisma = {
      user: {
        findMany: jest.fn().mockResolvedValue([row]),
        count: jest.fn().mockResolvedValue(1),
      },
    };
    const service = new AdminUserProvisioningService(prisma as never);

    const platform = await service.listAllUsers();
    const tenant = await service.listTenantUsers(tenantId);

    expect(platform.items[0]).toMatchObject({ role: 'ADMIN', status: 'REVOKED' });
    expect(tenant.items[0]).toMatchObject({
      membershipId: 'm-revoked',
      role: 'ADMIN',
      status: 'REVOKED',
    });
  });

  it('does not report ACTIVE when a name-only update targets a revoked membership', async () => {
    const membershipUpdate = jest.fn().mockResolvedValue({});
    const userUpdate = jest.fn().mockResolvedValue({});
    const prisma = {
      membership: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'm-revoked',
          role: 'MEMBER',
          status: 'REVOKED',
          user: { name: 'Old Name' },
        }),
        update: membershipUpdate,
      },
      user: { update: userUpdate },
    };
    const service = new AdminUserProvisioningService(prisma as never);

    const result = await service.updateUser(
      { userId: 'user-revoked', tenantId },
      { name: 'New Name' },
      'actor-1',
    );

    expect(result).toMatchObject({ name: 'New Name', role: 'MEMBER', status: 'REVOKED' });
    expect(membershipUpdate).not.toHaveBeenCalled();
  });

  it('fails closed when a user directory row has no membership for its owning tenant', async () => {
    const row = {
      id: 'user-broken',
      email: 'broken@demo.id',
      name: 'Broken Membership',
      isVerified: true,
      tenantId,
      createdAt: new Date('2026-08-29T00:00:00Z'),
      tenant: { name: 'Demo Tenant' },
      memberships: [
        {
          id: 'm-other',
          tenantId: '22222222-2222-4222-8222-222222222222',
          role: 'ADMIN',
          status: 'ACTIVE',
        },
      ],
    };
    const prisma = {
      user: {
        findMany: jest.fn().mockResolvedValue([row]),
        count: jest.fn().mockResolvedValue(1),
      },
    };
    const service = new AdminUserProvisioningService(prisma as never);

    await expect(service.listAllUsers()).rejects.toBeInstanceOf(DomainConflictException);
    await expect(service.listTenantUsers(tenantId)).rejects.toBeInstanceOf(
      DomainConflictException,
    );
  });

});
