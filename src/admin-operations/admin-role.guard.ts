import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ERROR_CODES } from '../common/errors/error-code';
import { DomainForbiddenException } from '../common/errors/domain-exceptions';

@Injectable()
export class AdminRoleGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();

    const role = request.user?.tenantContext?.role;
    if (role !== 'ADMIN' && role !== 'PLATFORM_ADMIN') {
      throw new DomainForbiddenException(
        ERROR_CODES.AdminOperationalSummaryAdminRequired,
        'Administrator access required',
      );
    }

    return true;
  }
}
