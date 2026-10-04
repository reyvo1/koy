import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { ModuleRef, Reflector } from '@nestjs/core';
import { ERROR_CODES } from '../common/errors/error-code';
import { DomainForbiddenException } from '../common/errors/domain-exceptions';
import { RbacPolicyService } from './rbac-policy.service';
import { RbacAuditService } from './rbac-audit.service';
import { ResourceOwnershipRegistry } from './resource-ownership';
import { auditActionForPermission } from './permission-audit-action';

export const RBAC_PERMISSION_KEY = 'rbacRequiredPermission';

export interface RequirePermissionOptions {
  /**
   * Permit the request when the caller owns the addressed resource.
   *
   * Ownership is a relation the role engine cannot see, so it has no permission string and no
   * catalog entry. Declaring it here keeps the two axes separate: the role engine answers
   * "may this membership act at all in this tenant", and ownership answers "is this their
   * resource".
   *
   * `scene` and `schedule` cannot use this: neither model has an owner column, so there is
   * nothing to resolve and a missing resolver denies the caller.
   */
  allowOwner?: boolean;
  /**
   * Route parameter holding the resource id. Defaults to the first route parameter, which is the
   * resource id on every route that declares `allowOwner`.
   */
  ownerParam?: string;
}

/**
 * Method decorator declaring the permission a route requires, e.g.
 * `@RequirePermission('device.provision')`.
 */
export const RequirePermission = (
  permission: string,
  options: RequirePermissionOptions = {},
) => SetMetadata(RBAC_PERMISSION_KEY, { permission, options });

/**
 * Guard evaluating the Module 20 RBAC policy engine for the declared permission. Routes without
 * @RequirePermission pass untouched, so existing behaviour is preserved until permissions are
 * rolled out per endpoint. Denials are audited inside RbacPolicyService (RbacAuditLog).
 *
 * Order matters and is deliberate: ownership is checked BEFORE the role engine, not after a
 * denial. Checking the role first would make every legitimate owner action by an ordinary member
 * write an `allowed: false` audit row and then be permitted anyway, so the audit trail would
 * claim the system rejected work it actually performed. This order produces exactly one truthful
 * row per request.
 */
@Injectable()
export class RbacPermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rbac: RbacPolicyService,
    private readonly audit: RbacAuditService,
    private readonly ownership: ResourceOwnershipRegistry,
    private readonly moduleRef: ModuleRef,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const declared = this.reflector.get<{
      permission: string;
      options: RequirePermissionOptions;
    }>(RBAC_PERMISSION_KEY, context.getHandler());
    if (!declared) return true;
    const { permission: required, options } = declared;

    const request = context.switchToHttp().getRequest();
    const tenantContext = request.user?.tenantContext;
    if (!tenantContext?.membershipId || !tenantContext?.tenantId) {
      throw new DomainForbiddenException(
        ERROR_CODES.TenantMembershipInvalid,
        'Tenant membership required for authorization',
      );
    }

    const resourceType = required.split('.')[0];

    if (options.allowOwner) {
      const params: Record<string, string> = request.params ?? {};
      const resourceId = options.ownerParam
        ? params[options.ownerParam]
        : params[Object.keys(params)[0]];
      if (resourceId && (await this.isOwnedBy(resourceType, resourceId, tenantContext))) {
        await this.audit.recordMutation({
          tenantId: tenantContext.tenantId,
          membershipId: tenantContext.membershipId,
          resourceType,
          resourceId,
          action: auditActionForPermission(required),
          detail: `permitted by resource ownership; role check not required for ${required}`,
        });
        return true;
      }
    }

    const { allowed } = await this.rbac.evaluate({
      tenantId: tenantContext.tenantId,
      membershipId: tenantContext.membershipId,
      baseRole: tenantContext.role,
      requiredPermission: required,
      resourceType,
    });

    if (allowed) return true;

    throw new DomainForbiddenException(
      ERROR_CODES.RbacPermissionDenied,
      `Missing permission: ${required}`,
    );
  }

  private async isOwnedBy(
    resourceType: string,
    resourceId: string,
    tenantContext: { membershipId: string; tenantId: string },
  ): Promise<boolean> {
    const resolverType = this.ownership.get(resourceType);
    if (!resolverType) return false;
    const resolver = this.moduleRef.get(resolverType, { strict: false });
    return resolver.isOwnedBy(
      resourceType,
      resourceId,
      tenantContext.membershipId,
      tenantContext.tenantId,
    );
  }


}
