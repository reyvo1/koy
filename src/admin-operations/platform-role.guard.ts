import { CanActivate, ExecutionContext } from '@nestjs/common';
import { ERROR_CODES } from '../common/errors/error-code';
import { DomainForbiddenException } from '../common/errors/domain-exceptions';

/**
 * Platform-scope guard for cross-tenant admin endpoints (`/admin/*` directory,
 * billing, and audit views). A membership satisfies this guard only when its
 * base role is PLATFORM_ADMIN. Tenant ADMIN is deliberately NOT sufficient:
 * tenant administrators must never read another tenant's data.
 *
 * Role value lives on the same membership.role column (schema comment lists
 * MEMBER, ADMIN); PLATFORM_ADMIN extends that enum without a migration.
 */
export class PlatformRoleGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();

    if (request.user?.tenantContext?.role !== 'PLATFORM_ADMIN') {
      throw new DomainForbiddenException(
        ERROR_CODES.PlatformAdminRequired,
        'Platform administrator access required',
      );
    }

    return true;
  }
}
