import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ERROR_CODES } from '../common/errors/error-code';
import { AdminRoleGuard } from './admin-role.guard';

function context(role?: string): ExecutionContext {
  const request = role
    ? { user: { tenantContext: { role } } }
    : { user: { tenantContext: {} } };

  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as ExecutionContext;
}

describe('AdminRoleGuard', () => {
  const guard = new AdminRoleGuard();

  it('allows the existing ADMIN membership role', () => {
    expect(guard.canActivate(context('ADMIN'))).toBe(true);
  });

  it('allows PLATFORM_ADMIN as a superset of tenant admin', () => {
    expect(guard.canActivate(context('PLATFORM_ADMIN'))).toBe(true);
  });

  it.each(['MEMBER', undefined])(
    'rejects non-admin role %s with a stable domain code',
    (role) => {
      try {
        guard.canActivate(context(role));
        throw new Error('Expected guard to reject');
      } catch (error) {
        expect(error).toBeInstanceOf(ForbiddenException);
        expect((error as ForbiddenException).getResponse()).toEqual({
          code: ERROR_CODES.AdminOperationalSummaryAdminRequired,
          message: 'Administrator access required',
        });
      }
    },
  );
});
