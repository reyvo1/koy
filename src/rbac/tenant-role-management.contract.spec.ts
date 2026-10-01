import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextGuard } from '../users/guards/tenant-context.guard';
import { AdminRoleGuard } from '../admin-operations/admin-role.guard';
import { RBAC_PERMISSION_CATALOG } from './rbac-permission-catalog';
import { TenantRoleController } from './tenant-role.controller';

const tenantA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const tenantB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const roleId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const membershipId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const request = { user: { tenantContext: { tenantId: tenantA, membershipId, role: 'ADMIN' } } } as never;

/**
 * The RBAC customisation layer was schema-only and read-only.
 *
 * `CustomRole` and `MembershipRoleOverride` both exist. `RbacPolicyService.evaluate()` reads
 * `membershipRoleOverrides` to decide a MEMBER's permissions. But nothing in the repository
 * ever *wrote* either table: `membershipRoleOverride` appeared in exactly one place, a
 * `findMany`, and `rbac-audit.controller.ts` exposed a single `GET`.
 *
 * The consequence is that a MEMBER has no permissions unless a row exists, no row is ever
 * created, and therefore **every member in every tenant is permanently unprivileged**. The
 * permission catalog describes the actor in terms that assume otherwise — "dashboard PERSONAL
 * milik pemanggil sendiri", "automation milik pemanggil" — and the guard's `allowOwner` escape
 * cannot help, because to own a dashboard a member must first create one, which needs
 * `dashboard.create`.
 *
 * `scripts/validate-rescue-baseline.mjs` asserts a MEMBER dashboard flow, but by matching
 * strings inside a spec file rather than by exercising the running product. That is a gate
 * reporting coverage it did not measure.
 *
 * This suite pins the surface that makes the model reachable, and pins the four boundaries
 * that matter: the tenant comes from the verified context, a role from another tenant cannot
 * be assigned, a membership from another tenant cannot be granted, and a role cannot carry a
 * permission the catalog does not define.
 */
describe('Tenant roles — a custom role can actually be created and assigned', () => {
  let controller: TenantRoleController;
  let prisma: Record<string, any>;

  const catalogNames = RBAC_PERMISSION_CATALOG.map((p) => p.permission);

  beforeEach(async () => {
    prisma = {
      customRole: {
        create: jest.fn().mockResolvedValue({ id: roleId, name: 'Operator', permissions: ['dashboard.read'], tenantId: tenantA, createdAt: new Date(0) }),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue({ id: roleId, tenantId: tenantA, name: 'Operator', permissions: ['dashboard.read'] }),
        delete: jest.fn().mockResolvedValue({}),
      },
      membershipRoleOverride: {
        create: jest.fn().mockResolvedValue({ id: 'ov-1' }),
        findFirst: jest.fn().mockResolvedValue({ id: 'ov-1' }),
        delete: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
      },
      membership: { findFirst: jest.fn().mockResolvedValue({ id: membershipId, tenantId: tenantA }) },
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [TenantRoleController],
      providers: [
        TenantRoleController,
        { provide: PrismaService, useValue: prisma },
        { provide: AdminRoleGuard, useValue: { canActivate: () => true } },
      ],
    })
      .overrideGuard(TenantContextGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = moduleRef.get(TenantRoleController);
  });

  describe('creating a role', () => {
    it('stores the permissions and takes the tenant from the context', async () => {
      await controller.createRole(request, { name: 'Operator', permissions: ['dashboard.read'] } as never);

      expect(prisma.customRole.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tenantId: tenantA, name: 'Operator', permissions: ['dashboard.read'] }),
        }),
      );
    });

    it('refuses a permission the catalog does not define', async () => {
      // A role carrying an invented permission would be stored and then never match anything,
      // which reads to an operator as "granted but ineffective".
      await expect(
        controller.createRole(request, { name: 'Sneaky', permissions: ['dashboard.delete_everything'] } as never),
      ).rejects.toMatchObject({ status: 400 });
      expect(prisma.customRole.create).not.toHaveBeenCalled();
    });

    it('refuses an empty permission list', async () => {
      await expect(controller.createRole(request, { name: 'Empty', permissions: [] } as never)).rejects.toMatchObject({
        status: 400,
      });
      expect(prisma.customRole.create).not.toHaveBeenCalled();
    });

    it('reports a duplicate role name as a conflict, not a 500', async () => {
      prisma.customRole.create.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));

      await expect(
        controller.createRole(request, { name: 'Operator', permissions: ['dashboard.read'] } as never),
      ).rejects.toMatchObject({ status: 409 });
    });
  });

  describe('assigning a role to a member', () => {
    it('refuses a role belonging to another tenant', async () => {
      prisma.customRole.findFirst.mockResolvedValue(null);

      await expect(controller.assignRole(request, membershipId, { roleId } as never)).rejects.toMatchObject({
        status: 404,
      });
      expect(prisma.membershipRoleOverride.create).not.toHaveBeenCalled();
    });

    it('refuses a membership belonging to another tenant', async () => {
      prisma.membership.findFirst.mockResolvedValue(null);

      await expect(controller.assignRole(request, 'other-tenant-membership', { roleId } as never)).rejects.toMatchObject({
        status: 404,
      });
      expect(prisma.membershipRoleOverride.create).not.toHaveBeenCalled();
    });

    it('writes the override with the tenant from the context', async () => {
      // The suite default has findFirst resolving an existing override, which would take the
      // already-assigned branch and never reach the create.
      prisma.membershipRoleOverride.findFirst.mockResolvedValue(null);

      await controller.assignRole(request, membershipId, { roleId } as never);

      expect(prisma.membershipRoleOverride.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tenantId: tenantA, membershipId, roleId }),
        }),
      );
    });

    it('is idempotent — assigning twice does not create a second row', async () => {
      prisma.membershipRoleOverride.findFirst.mockResolvedValue({ id: 'ov-existing' });

      await controller.assignRole(request, membershipId, { roleId } as never);

      expect(prisma.membershipRoleOverride.create).not.toHaveBeenCalled();
    });
  });

  describe('revoking a role from a member', () => {
    it('refuses when the member does not hold the role', async () => {
      prisma.membershipRoleOverride.findFirst.mockResolvedValue(null);

      await expect(controller.revokeRole(request, membershipId, roleId)).rejects.toMatchObject({ status: 404 });
      expect(prisma.membershipRoleOverride.delete).not.toHaveBeenCalled();
    });

    it('deletes the override when the member does hold it', async () => {
      prisma.membershipRoleOverride.findFirst.mockResolvedValue({ id: 'ov-1' });

      await controller.revokeRole(request, membershipId, roleId);

      expect(prisma.membershipRoleOverride.delete).toHaveBeenCalledWith({ where: { id: 'ov-1' } });
    });
  });

  it('every permission the catalog defines is a string a role may legitimately carry', () => {
    expect(catalogNames.every((n) => typeof n === 'string' && n.length > 0)).toBe(true);
    expect(catalogNames).toContain('dashboard.create');
    expect(tenantA).not.toBe(tenantB);
  });
});
