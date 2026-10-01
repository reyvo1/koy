import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import { AuditAction } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantContextGuard } from '../users/guards/tenant-context.guard';
import { AdminRoleGuard } from '../admin-operations/admin-role.guard';
import { DomainBadRequestException } from '../common/errors/domain-exceptions';
import { ERROR_CODES } from '../common/errors/error-code';
import { RbacAuditService } from './rbac-audit.service';

/**
 * Module 20 REST surface: the audit query.
 *
 * `RbacAuditService` could already record mutations but had no way to read them back, so
 * the trail existed and nobody could consult it. This adds the read side only — it does not
 * change who may mutate anything, and the tenant is taken from the verified context rather
 * than from a query parameter, so a caller cannot read another tenant's trail by asking.
 */
@Controller('audit-logs')
@UseGuards(JwtAuthGuard, TenantContextGuard, AdminRoleGuard)
export class RbacAuditController {
  constructor(private readonly audit: RbacAuditService) {}

  @Get()
  async list(
    @Request() req: any,
    @Query('resourceType') resourceType?: string,
    @Query('action') action?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.audit.queryAuditLog({
      tenantId: req.user.tenantContext.tenantId,
      resourceType: resourceType?.trim() || undefined,
      action: this.parseAction(action),
      limit: this.parseLimit(limit),
      cursor: this.parseCursor(cursor),
    });
  }

  /**
   * An unrecognised `action` is rejected rather than ignored. Silently dropping it would
   * return an unfiltered page that looks like the filter was applied.
   */
  private parseAction(action?: string): AuditAction | undefined {
    if (!action?.trim()) return undefined;
    const values = Object.values(AuditAction) as string[];
    if (!values.includes(action)) {
      throw new DomainBadRequestException(
        ERROR_CODES.BadRequest,
        `Unknown audit action. Expected one of: ${values.join(', ')}.`,
      );
    }
    return action as AuditAction;
  }

  private parseLimit(limit?: string): number | undefined {
    if (!limit?.trim()) return undefined;
    const parsed = Number(limit);
    if (!Number.isInteger(parsed) || parsed < 1) {
      throw new DomainBadRequestException(
        ERROR_CODES.BadRequest,
        'limit must be a positive integer.',
      );
    }
    return parsed;
  }

  /**
   * The cursor is an opaque, client-visible encoding of the last row's sort key, so it is
   * parsed defensively: anything malformed is a client error, never a silently reset page.
   * A reset page would repeat the first page forever without any error surfacing.
   */
  private parseCursor(cursor?: string): { createdAt: Date; id: string } | undefined {
    if (!cursor?.trim()) return undefined;

    let decoded: unknown;
    try {
      decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    } catch {
      throw new DomainBadRequestException(
        ERROR_CODES.BadRequest,
        'cursor must be the base64url value returned as nextCursor.',
      );
    }

    const candidate = decoded as { createdAt?: unknown; id?: unknown } | null;
    if (
      !candidate ||
      typeof candidate.createdAt !== 'string' ||
      typeof candidate.id !== 'string' ||
      Number.isNaN(new Date(candidate.createdAt).getTime())
    ) {
      throw new DomainBadRequestException(
        ERROR_CODES.BadRequest,
        'cursor must decode to { createdAt: ISO string, id: string }.',
      );
    }

    return { createdAt: new Date(candidate.createdAt), id: candidate.id };
  }
}
