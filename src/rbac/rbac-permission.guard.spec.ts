import 'reflect-metadata';
import { ExecutionContext } from '@nestjs/common';
import { RbacPermissionGuard, RequirePermission } from './rbac-permission.guard';

function makeContext(permission: string | undefined, tenantContext: unknown) {
  const request = { user: { tenantContext } };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => 'handler',
    getClass: () => 'class',
  } as unknown as ExecutionContext;
}

const reflector = {
  get: (_: unknown, handler: unknown) =>
    handler === 'handler' ? (globalThis as { __perm?: string }).__perm : undefined,
} as never;

describe('RbacPermissionGuard', () => {
  const evaluate = jest.fn();
  const guard = new RbacPermissionGuard(reflector, { evaluate } as never);

  afterEach(() => {
    delete (globalThis as { __perm?: string }).__perm;
    evaluate.mockReset();
  });

  it('passes routes without a declared permission', async () => {
    (globalThis as { __perm?: string }).__perm = undefined;
    await expect(
      guard.canActivate(makeContext(undefined, {})),
    ).resolves.toBe(true);
    expect(evaluate).not.toHaveBeenCalled();
  });

  it('allows when the policy engine allows', async () => {
    (globalThis as { __perm?: string }).__perm = 'device.provision';
    evaluate.mockResolvedValue({ allowed: true });
    await expect(
      guard.canActivate(
        makeContext('device.provision', {
          tenantId: 't1',
          membershipId: 'm1',
          role: 'MEMBER',
        }),
      ),
    ).resolves.toBe(true);
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
    (globalThis as { __perm?: string }).__perm = 'device.provision';
    evaluate.mockResolvedValue({ allowed: false });
    await expect(
      guard.canActivate(
        makeContext('device.provision', {
          tenantId: 't1',
          membershipId: 'm1',
          role: 'MEMBER',
        }),
      ),
    ).rejects.toMatchObject({
      response: { code: 'RBAC_PERMISSION_DENIED' },
    });
  });
});

describe('RequirePermission decorator', () => {
  it('attaches metadata via SetMetadata', () => {
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
    expect(Reflect.getMetadata('rbacRequiredPermission', Sample.prototype.method)).toBe(
      'device.provision',
    );
  });
});
