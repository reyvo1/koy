import { Injectable, Logger } from '@nestjs/common';
import { AuditAction } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Module 20 Slice 20.1 — policy evaluation with audit trail.
 * Effective permissions = base membership role (ADMIN/PLATFORM_ADMIN = wildcard) plus the
 * union of permissions from assigned custom roles. Every evaluation that
 * DENIES access is audited; allows are audited only when `auditAllows` is set
 * (keeps log volume bounded).
 */
@Injectable()
export class RbacPolicyService {
  private readonly logger = new Logger(RbacPolicyService.name);

  constructor(private readonly prisma: PrismaService) {}

  async evaluate(input: {
    tenantId: string;
    membershipId: string;
    baseRole: string;
    requiredPermission: string;
    resourceType: string;
    resourceId?: string;
    auditAllows?: boolean;
  }): Promise<{ allowed: boolean }> {
    let allowed: boolean;

    if (input.baseRole === 'ADMIN' || input.baseRole === 'PLATFORM_ADMIN') {
      allowed = true;
    } else {
      const overrides = await this.prisma.membershipRoleOverride.findMany({
        where: {
          tenantId: input.tenantId,
          membershipId: input.membershipId,
        },
        include: { role: true },
      });
      const permissionSet = new Set<string>();
      for (const override of overrides) {
        const perms = override.role.permissions as string[];
        if (Array.isArray(perms)) {
          for (const p of perms) permissionSet.add(p);
        }
      }
      allowed =
        permissionSet.has('*') || permissionSet.has(input.requiredPermission);
    }

    if (!allowed || input.auditAllows) {
      await this.prisma.rbacAuditLog.create({
        data: {
          tenantId: input.tenantId,
          action: this.actionFor(input.requiredPermission),
          resourceType: input.resourceType,
          resourceId: input.resourceId ?? null,
          actorMembershipId: input.membershipId,
          allowed,
          detail: `permission=${input.requiredPermission}`,
        },
      });
    }

    return { allowed };
  }

  private actionFor(permission: string): AuditAction {
    if (permission.startsWith('read')) return 'READ';
    if (permission.startsWith('delete')) return 'DELETE';
    if (permission.startsWith('update')) return 'UPDATE';
    if (permission.startsWith('share')) return 'GRANT';
    return 'CREATE';
  }
}
