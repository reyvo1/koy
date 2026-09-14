import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ERROR_CODES } from '../common/errors/error-code';
import { PlatformRoleGuard } from './platform-role.guard';

function context(role?: string): ExecutionContext {
  const request = role
    ? { user: { tenantContext: { role } } }
    : { user: { tenantContext: {} } };

  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as ExecutionContext;
}

describe('PlatformRoleGuard', () => {
  const guard = new PlatformRoleGuard();

  it('allows the PLATFORM_ADMIN membership role', () => {
    expect(guard.canActivate(context('PLATFORM_ADMIN'))).toBe(true);
  });

  it.each(['ADMIN', 'MEMBER', undefined])(
    'rejects role %s with a stable domain code (tenant admins must not cross tenants)',
    (role) => {
      try {
        guard.canActivate(context(role));
        throw new Error('Expected guard to reject');
      } catch (error) {
        expect(error).toBeInstanceOf(ForbiddenException);
        expect((error as ForbiddenException).getResponse()).toEqual({
          code: ERROR_CODES.PlatformAdminRequired,
          message: 'Platform administrator access required',
        });
      }
    },
  );
});
