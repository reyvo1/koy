import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ERROR_CODES } from '../common/errors/error-code';
import { DomainForbiddenException } from '../common/errors/domain-exceptions';
import { RbacPolicyService } from './rbac-policy.service';

export const RBAC_PERMISSION_KEY = 'rbacRequiredPermission';

/**
 * Method decorator declaring the permission a route requires, e.g.
 * @RequirePermission('device.provision').
 */
export const RequirePermission = (permission: string) =>
  SetMetadata(RBAC_PERMISSION_KEY, permission);

/**
 * Guard evaluating the Module 20 RBAC policy engine for the declared
 * permission. Routes without @RequirePermission pass untouched, so existing
 * behavior is preserved until permissions are rolled out per endpoint.
 * Denials are audited inside RbacPolicyService (RbacAuditLog).
 */
@Injectable()
export class RbacPermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rbac: RbacPolicyService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.get<string>(
      RBAC_PERMISSION_KEY,
      context.getHandler(),
    );
    if (!required) return true;

    const request = context.switchToHttp().getRequest();
    const tenantContext = request.user?.tenantContext;
    if (!tenantContext?.membershipId || !tenantContext?.tenantId) {
      throw new DomainForbiddenException(
        ERROR_CODES.TenantMembershipInvalid,
        'Tenant membership required for authorization',
      );
    }

    const resourceType = required.split('.')[0];
    const { allowed } = await this.rbac.evaluate({
      tenantId: tenantContext.tenantId,
      membershipId: tenantContext.membershipId,
      baseRole: tenantContext.role,
      requiredPermission: required,
      resourceType,
    });

    if (!allowed) {
      throw new DomainForbiddenException(
        ERROR_CODES.RbacPermissionDenied,
        `Missing permission: ${required}`,
      );
    }

    return true;
  }
}
