import 'reflect-metadata';
import { ExecutionContext } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { RbacPermissionGuard, RequirePermission } from './rbac-permission.guard';
import { RBAC_PERMISSION_CATALOG } from './rbac-permission-catalog';
import { ResourceOwnershipRegistry } from './resource-ownership';

interface Declared {
  permission: string;
  options: { allowOwner?: boolean; ownerParam?: string };
}

function makeContext(
  tenantContext: unknown,
  params: Record<string, string> = {},
) {
  const request = { user: { tenantContext }, params };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => 'handler',
    getClass: () => 'class',
  } as unknown as ExecutionContext;
}

/** Reflector stub returning whatever the current case declared. */
function makeReflector() {
  return {
    get: (_: unknown, handler: unknown) =>
      handler === 'handler'
        ? (globalThis as { __declared?: Declared | undefined }).__declared
        : undefined,
  } as never;
}

function declare(permission: string, options: Declared['options'] = {}) {
  (globalThis as { __declared?: Declared | undefined }).__declared = {
    permission,
    options,
  };
}

const noDeclaration = () => {
  (globalThis as { __declared?: Declared | undefined }).__declared = undefined;
};

describe('RbacPermissionGuard', () => {
  const evaluate = jest.fn();
  const recordMutation = jest.fn();
  const isOwnedBy = jest.fn();
  const reflector = makeReflector();

  const registry = {
    get: () => ({ isOwnedBy }),
  } as unknown as ResourceOwnershipRegistry;
  const moduleRef = { get: () => ({ isOwnedBy }) } as unknown as ModuleRef;

  const guard = new RbacPermissionGuard(
    reflector,
    { evaluate } as never,
    { recordMutation } as never,
    registry,
    moduleRef,
  );

  const member = { tenantId: 't1', membershipId: 'm1', role: 'MEMBER' };

  afterEach(() => {
    noDeclaration();
    evaluate.mockReset();
    recordMutation.mockReset();
    isOwnedBy.mockReset();
  });

  it('passes routes without a declared permission', async () => {
    noDeclaration();
    await expect(guard.canActivate(makeContext({}))).resolves.toBe(true);
    expect(evaluate).not.toHaveBeenCalled();
  });

  it('allows when the policy engine allows', async () => {
    declare('device.provision');
    evaluate.mockResolvedValue({ allowed: true });
    await expect(guard.canActivate(makeContext(member))).resolves.toBe(true);
    expect(evaluate).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 't1',
        membershipId: 'm1',
        baseRole: 'MEMBER',
        requiredPermission: 'device.provision',
        resourceType: 'device',
      }),
    );
  });

  it('rejects with RBAC_PERMISSION_DENIED when the policy denies', async () => {
    declare('device.provision');
    evaluate.mockResolvedValue({ allowed: false });
    await expect(guard.canActivate(makeContext(member))).rejects.toMatchObject({
      response: { code: 'RBAC_PERMISSION_DENIED' },
    });
  });

  describe('allowOwner', () => {
    it('lets the owner through WITHOUT asking the role engine', async () => {
      // The order is load-bearing. If the role check ran first it would write an
      // `allowed: false` audit row and then permit the request anyway, so the trail would
      // claim the system rejected work it actually performed.
      declare('automation.update', { allowOwner: true });
      isOwnedBy.mockResolvedValue(true);

      await expect(
        guard.canActivate(makeContext(member, { automationId: 'a1' })),
      ).resolves.toBe(true);

      expect(evaluate).not.toHaveBeenCalled();
      expect(isOwnedBy).toHaveBeenCalledWith('automation', 'a1', 'm1', 't1');
      expect(recordMutation).toHaveBeenCalledWith(
        expect.objectContaining({
          resourceType: 'automation',
          resourceId: 'a1',
          action: 'UPDATE',
        }),
      );
    });

    it('falls through to the role engine when the caller is not the owner', async () => {
      declare('automation.update', { allowOwner: true });
      isOwnedBy.mockResolvedValue(false);
      evaluate.mockResolvedValue({ allowed: true });

      await expect(
        guard.canActivate(makeContext(member, { automationId: 'a1' })),
      ).resolves.toBe(true);
      expect(evaluate).toHaveBeenCalled();
    });

    it('denies a non-owner member once ownership is ruled out', async () => {
      declare('automation.delete', { allowOwner: true });
      isOwnedBy.mockResolvedValue(false);
      evaluate.mockResolvedValue({ allowed: false });

      await expect(
        guard.canActivate(makeContext(member, { automationId: 'a1' })),
      ).rejects.toMatchObject({ response: { code: 'RBAC_PERMISSION_DENIED' } });
    });

    it('uses the declared ownerParam when the first param is not the resource', async () => {
      declare('dashboard.update', { allowOwner: true, ownerParam: 'dashboardId' });
      isOwnedBy.mockResolvedValue(true);

      await expect(
        guard.canActivate(makeContext(member, { slug: 'x', dashboardId: 'd9' })),
      ).resolves.toBe(true);
      expect(isOwnedBy).toHaveBeenCalledWith('dashboard', 'd9', 'm1', 't1');
    });

    it('denies when allowOwner is set but the route addresses no resource', async () => {
      // A create route has no id, so ownership cannot apply and the role engine decides.
      // Silently allowing here would turn every create route into an open door.
      declare('automation.create', { allowOwner: true });
      evaluate.mockResolvedValue({ allowed: false });

      await expect(guard.canActivate(makeContext(member, {}))).rejects.toMatchObject({
        response: { code: 'RBAC_PERMISSION_DENIED' },
      });
      expect(isOwnedBy).not.toHaveBeenCalled();
    });

    it('rejects a caller with no tenant context before consulting ownership', async () => {
      declare('automation.update', { allowOwner: true });
      await expect(
        guard.canActivate(makeContext(undefined, { automationId: 'a1' })),
      ).rejects.toMatchObject({
        response: { code: 'TENANT_MEMBERSHIP_INVALID' },
      });
      expect(isOwnedBy).not.toHaveBeenCalled();
    });
  });

  /**
   * The audit action recorded for an ownership-permitted request.
   *
   * This block exists because the mapping was silently wrong for every permission in the
   * catalog. `actionFor` tested `permission.startsWith('read')` while permissions are
   * `<resource>.<action>` — so nothing matched and all eight permissions fell through to the
   * `UPDATE` fallback. An owner deleting a dashboard produced an audit row that said the
   * dashboard had been updated.
   *
   * It survived because the guard's other ownership case uses `automation.update`, the single
   * permission whose suffix happens to equal the fallback. These cases walk the real catalog
   * instead of one hand-picked string.
   */
  describe('the audit action it records for an owner-permitted request', () => {
    const actionFor = async (permission: string) => {
      declare(permission, { allowOwner: true });
      isOwnedBy.mockResolvedValue(true);
      await guard.canActivate(makeContext(member, { id: 'r1' }));
      return recordMutation.mock.calls.at(-1)?.[0]?.action;
    };

    it('records a delete as DELETE, not UPDATE', async () => {
      await expect(actionFor('dashboard.delete')).resolves.toBe('DELETE');
    });

    it('records a read as READ, not UPDATE', async () => {
      await expect(actionFor('dashboard.read')).resolves.toBe('READ');
    });

    it('records a create as CREATE, not UPDATE', async () => {
      await expect(actionFor('automation.create')).resolves.toBe('CREATE');
    });

    it('records an update as UPDATE', async () => {
      await expect(actionFor('automation.update')).resolves.toBe('UPDATE');
    });

    it('records a mutation with no matching suffix as UPDATE', async () => {
      // `device.provision` and `device.assignOwner` are real mutations with no
      // CREATE/UPDATE/DELETE suffix. UPDATE is the honest bucket; inventing a new one would
      // write a value the AuditAction enum does not accept.
      await expect(actionFor('device.provision')).resolves.toBe('UPDATE');
      await expect(actionFor('device.assignOwner')).resolves.toBe('UPDATE');
    });

    it('agrees with the suffix of every permission in the real catalog', async () => {
      for (const entry of RBAC_PERMISSION_CATALOG) {
        const action = await actionFor(entry.permission);
        const suffix = entry.permission.split('.').pop();
        if (suffix === 'read' || suffix === 'create' || suffix === 'delete') {
          expect({ permission: entry.permission, action }).toEqual({
            permission: entry.permission,
            action: suffix.toUpperCase(),
          });
        }
      }
    });
  });
});

describe('RequirePermission decorator', () => {
  it('attaches the bare form as metadata', () => {
    class Sample {
      method() {}
    }
    const descriptor = Object.getOwnPropertyDescriptor(
      Sample.prototype,
      'method',
    )!;
    RequirePermission('device.provision')(
      Sample.prototype,
      'method',
      descriptor,
    );
    expect(Reflect.getMetadata('rbacRequiredPermission', Sample.prototype.method)).toEqual({
      permission: 'device.provision',
      options: {},
    });
  });

  it('attaches the options form as metadata', () => {
    class Sample {
      method() {}
    }
    const descriptor = Object.getOwnPropertyDescriptor(
      Sample.prototype,
      'method',
    )!;
    RequirePermission('automation.update', { allowOwner: true })(
      Sample.prototype,
      'method',
      descriptor,
    );
    expect(Reflect.getMetadata('rbacRequiredPermission', Sample.prototype.method)).toEqual({
      permission: 'automation.update',
      options: { allowOwner: true },
    });
  });
});
