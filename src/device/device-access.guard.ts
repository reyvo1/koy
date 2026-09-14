import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ERROR_CODES } from '../common/errors/error-code';
import {
  DomainForbiddenException,
  DomainNotFoundException,
} from '../common/errors/domain-exceptions';
import { DeviceAccessService } from './device-access.service';

export type DeviceAccessLevel = 'VIEW' | 'CONTROL';
export const DEVICE_ACCESS_KEY = 'deviceAccessLevel';

/**
 * Declares the access level required for a device-scoped HTTP route.
 * VIEW accepts owner grants plus VIEW/CONTROL shares. CONTROL accepts only
 * owner access or an active CONTROL share. ADMIN/PLATFORM_ADMIN are tenant
 * administrators and remain allowed after TenantContextGuard proves membership.
 */
export const RequireDeviceAccess = (level: DeviceAccessLevel) =>
  SetMetadata(DEVICE_ACCESS_KEY, level);

@Injectable()
export class DeviceAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly access: DeviceAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const level = this.reflector.get<DeviceAccessLevel>(
      DEVICE_ACCESS_KEY,
      context.getHandler(),
    );
    if (!level) return true;

    const request = context.switchToHttp().getRequest();
    const tenantContext = request.user?.tenantContext;
    const userId = request.user?.userId;
    const deviceId = request.params?.deviceId ?? request.params?.id;

    if (
      !tenantContext?.tenantId ||
      !tenantContext?.membershipId ||
      !userId ||
      typeof deviceId !== 'string' ||
      deviceId.trim() === ''
    ) {
      throw new DomainForbiddenException(
        ERROR_CODES.TenantMembershipInvalid,
        'Tenant membership required for device access',
      );
    }

    const decision = await this.access.resolveOne(
      {
        tenantId: tenantContext.tenantId,
        membershipId: tenantContext.membershipId,
        userId,
        role: tenantContext.role,
      },
      deviceId,
    );

    if (!decision) {
      throw new DomainNotFoundException(
        ERROR_CODES.DeviceNotFound,
        'Device not found',
      );
    }

    const allowed = level === 'CONTROL' ? decision.canControl : decision.canView;
    if (!allowed) {
      throw new DomainForbiddenException(
        ERROR_CODES.RbacPermissionDenied,
        `Device ${level.toLowerCase()} access denied`,
      );
    }

    return true;
  }
}
