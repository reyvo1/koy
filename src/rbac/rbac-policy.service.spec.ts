import { PrismaService } from '../prisma/prisma.service';
import { RbacPolicyService } from './rbac-policy.service';

const tenantId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const membershipId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

describe('RbacPolicyService', () => {
  let overrides: { role: { permissions: unknown } }[];
  let findMany: jest.Mock;
  let auditCreate: jest.Mock;
  let service: RbacPolicyService;

  beforeEach(() => {
    overrides = [];
    findMany = jest.fn().mockResolvedValue(overrides);
    auditCreate = jest.fn().mockResolvedValue({});
    service = new RbacPolicyService({
      membershipRoleOverride: { findMany },
      rbacAuditLog: { create: auditCreate },
    } as unknown as PrismaService);
  });

  it('allows ADMIN without consulting custom roles', async () => {
    const result = await service.evaluate({
      tenantId,
      membershipId,
      baseRole: 'ADMIN',
      requiredPermission: 'device.delete',
      resourceType: 'device',
    });

    expect(result.allowed).toBe(true);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('allows PLATFORM_ADMIN as an administrative superset without custom roles', async () => {
    const result = await service.evaluate({
      tenantId,
      membershipId,
      baseRole: 'PLATFORM_ADMIN',
      requiredPermission: 'device.update',
      resourceType: 'device',
    });

    expect(result.allowed).toBe(true);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('denies MEMBER with no matching permission and audits the denial', async () => {
    const result = await service.evaluate({
      tenantId,
      membershipId,
      baseRole: 'MEMBER',
      requiredPermission: 'device.delete',
      resourceType: 'device',
    });

    expect(result.allowed).toBe(false);
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ allowed: false }) }),
    );
  });


  it.each([
    ['dashboard.read', 'READ'],
    ['dashboard.delete', 'DELETE'],
    ['device.provision', 'UPDATE'],
  ] as const)('audits denied %s as %s', async (requiredPermission, action) => {
    await service.evaluate({
      tenantId,
      membershipId,
      baseRole: 'MEMBER',
      requiredPermission,
      resourceType: requiredPermission.split('.')[0],
    });

    expect(auditCreate).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action, allowed: false }) }),
    );
  });

  it('allows MEMBER via a custom role granting the exact permission', async () => {
    overrides.push({ role: { permissions: ['device.update'] } });
    const result = await service.evaluate({
      tenantId,
      membershipId,
      baseRole: 'MEMBER',
      requiredPermission: 'device.update',
      resourceType: 'device',
    });

    expect(result.allowed).toBe(true);
    // Denials audited; allows not by default.
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it('supports wildcard permission grants', async () => {
    overrides.push({ role: { permissions: ['*'] } });
    const result = await service.evaluate({
      tenantId,
      membershipId,
      baseRole: 'MEMBER',
      requiredPermission: 'scene.execute',
      resourceType: 'scene',
    });
    expect(result.allowed).toBe(true);
  });
});
