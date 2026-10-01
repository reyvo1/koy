import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditAction } from '@prisma/client';

export interface MutationAuditInput {
  tenantId: string;
  membershipId: string;
  resourceType: string;
  resourceId: string;
  action: AuditAction;
  /**
   * Free text describing what the decision actually was. For a domain with no role gate this
   * must say so, because the audit row is the only record of who changed what and why it was
   * allowed — an unqualified row would read as though a permission check had passed.
   */
  detail: string;
}

/**
 * Audit trail for mutations that are permitted by tenant scope alone.
 *
 * `scene` and `schedule` have no role or permission guard, and no ownership field, so there is
 * nothing to enforce yet. But until recently those mutations left no trace at all: the policy
 * engine is only reached through `RbacPermissionGuard`, so a scene edited by any member of a
 * tenant produced no row anywhere. This closes that gap without changing who may act — the
 * difference between "permitted" and "enforced" is exactly what the `detail` field records.
 *
 * Audit failures are swallowed. Losing a mutating request because its audit row could not be
 * written would be a worse outcome than the missing row, and the alternative — failing closed on
 * writes — is a policy decision that has not been made.
 */
@Injectable()
export class RbacAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async recordMutation(input: MutationAuditInput): Promise<void> {
    try {
      await this.prisma.rbacAuditLog.create({
        data: {
          tenantId: input.tenantId,
          action: input.action,
          resourceType: input.resourceType,
          resourceId: input.resourceId,
          actorMembershipId: input.membershipId,
          allowed: true,
          detail: input.detail,
        },
      });
    } catch {
      // Intentionally ignored — see the class comment.
    }
  }

  /**
   * Read surface for the RBAC audit log (Module 20's deferred "audit query").
   *
   * Until now this service could only write, so every row it produced was write-only: there
   * was no way to ask who changed what. The `@@index([tenantId, createdAt])` on the model
   * existed to serve exactly this query, which is why this is a read and not a report.
   *
   * Tenant-scoped and fail-closed: `tenantId` is part of the where clause rather than a
   * filter the caller can widen, so a caller in tenant A cannot read tenant B's rows by
   * passing another id — an unknown tenant simply returns nothing. Ordering is
   * `createdAt desc, id desc` so paging stays stable when many rows share a timestamp, and
   * `take` is clamped so one call cannot pull the whole log.
   */
  async queryAuditLog(input: {
    tenantId: string;
    resourceType?: string;
    action?: AuditAction;
    limit?: number;
    cursor?: { createdAt: Date; id: string };
  }): Promise<{
    items: Array<{
      id: string;
      action: AuditAction;
      resourceType: string;
      resourceId: string | null;
      actorMembershipId: string;
      allowed: boolean;
      detail: string | null;
      createdAt: string;
    }>;
    nextCursor: { createdAt: string; id: string } | null;
  }> {
    const MAX_TAKE = 200;
    const take = Math.min(Math.max(input.limit ?? 50, 1), MAX_TAKE);

    const rows = await this.prisma.rbacAuditLog.findMany({
      where: {
        tenantId: input.tenantId,
        ...(input.resourceType ? { resourceType: input.resourceType } : {}),
        ...(input.action ? { action: input.action } : {}),
        ...(input.cursor
          ? {
              OR: [
                { createdAt: { lt: input.cursor.createdAt } },
                { createdAt: input.cursor.createdAt, id: { lt: input.cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
    });

    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;
    const last = page[page.length - 1];

    return {
      items: page.map((row) => ({
        id: row.id,
        action: row.action,
        resourceType: row.resourceType,
        resourceId: row.resourceId,
        actorMembershipId: row.actorMembershipId,
        allowed: row.allowed,
        detail: row.detail,
        createdAt: row.createdAt.toISOString(),
      })),
      // Only advertise a cursor when another page actually exists, so a caller cannot
      // follow a cursor into an empty result and read it as the end of the data.
      nextCursor:
        hasMore && last
          ? { createdAt: last.createdAt.toISOString(), id: last.id }
          : null,
    };
  }
}
