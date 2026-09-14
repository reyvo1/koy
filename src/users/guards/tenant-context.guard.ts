import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ERROR_CODES } from '../../common/errors/error-code';
import { DomainForbiddenException } from '../../common/errors/domain-exceptions';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TenantContextGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId = request.user?.userId;

    const header = request.headers['x-tenant-id'];

    if (!userId || typeof header !== 'string' || header.trim() === '') {
      throw new DomainForbiddenException(
        ERROR_CODES.TenantContextInvalid,
        'Invalid or missing tenant context',
      );
    }

    const requestedTenantId = header.trim();

    const membership = await this.prisma.membership.findUnique({
      where: {
        userId_tenantId: {
          userId,
          tenantId: requestedTenantId,
        },
      },
    });

    if (!membership || membership.status !== 'ACTIVE') {
      throw new DomainForbiddenException(
        ERROR_CODES.TenantMembershipInvalid,
        'Invalid or inactive tenant membership',
      );
    }

    request.user.tenantContext = {
      tenantId: membership.tenantId,
      membershipId: membership.id,
      role: membership.role,
    };

    return true;
  }
}
