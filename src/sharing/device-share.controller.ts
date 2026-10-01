import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RbacPermissionGuard, RequirePermission } from '../rbac/rbac-permission.guard';
import { TenantContextGuard } from '../users/guards/tenant-context.guard';
import {
  DomainBadRequestException,
  DomainConflictException,
  DomainForbiddenException,
  DomainNotFoundException,
} from '../common/errors/domain-exceptions';
import { ERROR_CODES } from '../common/errors/error-code';
import { CreateDeviceShareDto } from './dto/create-device-share.dto';
import { DeviceShareService } from './device-share.service';

/**
 * Module 18 REST surface: the producer side of device sharing.
 *
 * `DeviceAccessService` has always CONSUMED a grant — that is what allowed a MEMBER to send
 * a device command once a row existed — but nothing in the codebase ever PRODUCED a grant
 * outside `device-share.service.spec.ts`. A share could therefore only be created by writing
 * straight to `device_share_grants`, which is why "admin shares, user controls" could not
 * be exercised through the product. This controller is the missing half.
 *
 * Permission choice: `device.update` is reused deliberately instead of a new
 * `device.share` string. `rbac-permission-catalog.ts` is pinned two-way to the
 * `@RequirePermission` decorators by `rbac-permission-catalog.spec.ts`, and sharing a
 * device is device administration that `device.update` already describes. Adding a
 * permission string would change the authorisation contract rather than expose a new one.
 */
@Controller('devices')
@UseGuards(JwtAuthGuard, TenantContextGuard, RbacPermissionGuard)
export class DeviceShareController {
  constructor(private readonly shareService: DeviceShareService) {}

  @Post(':id/shares')
  @RequirePermission('device.update')
  async create(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: CreateDeviceShareDto,
  ) {
    const tenantId = req.user.tenantContext.tenantId;
    return this.translated(() =>
      this.shareService.createGrant({
        tenantId,
        deviceId: id,
        grantedToMembershipId: dto.grantedToMembershipId,
        createdByMembershipId: this.actor(req),
        permission: dto.permission,
        expiresAt: new Date(dto.expiresAt),
      }),
    );
  }

  @Get(':id/shares')
  @RequirePermission('device.update')
  async list(@Request() req: any, @Param('id') id: string) {
    return this.translated(() =>
      this.shareService.listGrants({ tenantId: req.user.tenantContext.tenantId, deviceId: id }),
    );
  }

  @Delete(':id/shares/:grantId')
  @RequirePermission('device.update')
  async revoke(@Request() req: any, @Param('grantId') grantId: string) {
    return this.translated(async () => {
      await this.shareService.revokeGrant({
        tenantId: req.user.tenantContext.tenantId,
        grantId,
        actorMembershipId: this.actor(req),
      });
      return { revoked: grantId };
    });
  }

  private actor(req: any): string {
    const membershipId = req.user?.tenantContext?.membershipId;
    if (typeof membershipId !== 'string' || membershipId.length === 0) {
      // TenantContextGuard has already rejected a request without one, so reaching this is
      // a contract violation rather than something the client can fix.
      throw new DomainForbiddenException(
        ERROR_CODES.Forbidden,
        'Membership context is required to manage device sharing.',
      );
    }
    return membershipId;
  }

  /**
   * DeviceShareService signals its refusals by throwing a plain Error carrying a `code`.
   * `GlobalExceptionFilter` only maps HttpException, so without this translation every one
   * of those refusals would reach the client as 500 INTERNAL_ERROR — a client mistake
   * reported as a server fault, which is exactly the class of ambiguous result the
   * acceptance evidence rules refuse to accept as a pass.
   */
  private async translated<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      throw this.toDomainError(error);
    }
  }

  private toDomainError(error: unknown): unknown {
    const code = (error as { code?: unknown } | null)?.code;
    if (typeof code !== 'string' || !code.startsWith('SHARE_')) {
      return error;
    }
    switch (code) {
      case ERROR_CODES.ShareDeviceNotFound:
        return new DomainNotFoundException(code, 'Device not found in this tenant.');
      case ERROR_CODES.ShareSelfGrantInvalid:
        return new DomainBadRequestException(code, 'A device cannot be shared to its own owner.');
      case ERROR_CODES.ShareExpiryInvalid:
        return new DomainBadRequestException(
          code,
          'Expiry must be in the future and no more than 90 days out.',
        );
      case ERROR_CODES.ShareIdentityInvalid:
        return new DomainBadRequestException(code, 'A valid device and membership id is required.');
      case ERROR_CODES.ShareActiveLimitExceeded:
        return new DomainConflictException(
          code,
          'This device already has the maximum number of active shares.',
        );
      case ERROR_CODES.ShareGrantNotActive:
        return new DomainConflictException(code, 'This share is no longer active.');
      default:
        return error;
    }
  }
}
