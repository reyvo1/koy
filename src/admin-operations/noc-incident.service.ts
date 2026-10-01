import { Injectable, Logger } from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import { ERROR_CODES } from '../common/errors/error-code';
import {
  DomainBadRequestException,
  DomainConflictException,
  DomainNotFoundException,
} from '../common/errors/domain-exceptions';
import { PrismaService } from '../prisma/prisma.service';

export interface AcknowledgeFindingInput {
  tenantId: string;
  findingId: string;
  actorMembershipId: string;
  note?: string;
}

export interface ResolveFindingInput {
  tenantId: string;
  findingId: string;
  actorMembershipId: string;
}

/**
 * NOC operations: the verbs a control room needs at 03:00.
 *
 * The NOC console rendered `AnalyticsFinding` rows and had no way to act on one. The census made
 * that concrete: 23 hits for "ack" that were all *command* acknowledgements, one `on-call` mention
 * in `auth.service`, and zero for runbook, postmortem, escalation or bulk action. A console that
 * can see a CRITICAL finding but cannot record that a human saw it is a wallboard, and a wallboard
 * at 03:00 costs exactly what a NOC exists to prevent.
 *
 * Three decisions are load-bearing, and each is a way this could have gone quietly wrong:
 *
 *  - **Acknowledging is a fact, not a UI state.** The row is persisted and attributed. A checkbox
 *    that clears the badge destroys the only record that anyone looked at all.
 *  - **Acknowledging is not resolving.** They are separate columns, and resolving requires an
 *    acknowledgement to exist first. Conflating them lets a first responder close an incident by
 *    acknowledging it, and the next responder has no way to know.
 *  - **A second acknowledgement returns the first, it does not overwrite it.** The unique index on
 *    `findingId` is what enforces this, and the catch below turns the constraint violation into the
 *    original row rather than a 500 — so a double click is a no-op, not an error, and "who was on
 *    duty when this was first seen" stays answerable.
 */
@Injectable()
export class NocIncidentService {
  private readonly logger = new Logger(NocIncidentService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Record that an operator has seen a finding.
   *
   * Idempotent by finding: the second call returns the first acknowledgement unchanged. That is
   * deliberate — the value of the record is the *first* sight, and a re-acknowledge must not be
   * able to move the actor or the timestamp.
   */
  async acknowledge(input: AcknowledgeFindingInput) {
    const tenantId = this.requireTenant(input.tenantId);
    await this.assertFindingInTenant(tenantId, input.findingId);

    // The tenant is in the query, not merely guaranteed by the `assertFindingInTenant` call above.
    // That call does 404 a finding from another tenant, so the row below cannot be reached across
    // tenants today — but "it was verified earlier in the function" is the reasoning that grows a
    // cross-tenant read one refactor later, and the unique index on `findingId` alone means an
    // acknowledgement is tenant-scoped in no other sense.
    const existing = await this.prisma.nocAcknowledgement.findFirst({
      where: { findingId: input.findingId, tenantId },
    });
    if (existing) {
      // Returned, not rejected. A second operator acknowledging the same finding is a normal
      // thing to do during a handover, and answering it with a conflict would teach operators to
      // avoid the button. The `alreadyAcknowledged` flag says plainly that nothing was rewritten.
      return { acknowledgement: this.toRow(existing), alreadyAcknowledged: true };
    }

    try {
      const created = await this.prisma.nocAcknowledgement.create({
        data: {
          findingId: input.findingId,
          tenantId,
          actorMembershipId: input.actorMembershipId,
          ...(input.note?.trim() ? { note: input.note.trim() } : {}),
        },
      });

      await this.audit(tenantId, input.actorMembershipId, 'noc.acknowledge', input.findingId);

      return { acknowledgement: this.toRow(created), alreadyAcknowledged: false };
    } catch (cause) {
      // The unique index is the real guard; this catch exists so the race between the read above
      // and this write resolves to the existing row rather than surfacing a Prisma error as a 500.
      if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === 'P2002') {
        const raced = await this.prisma.nocAcknowledgement.findFirst({
          where: { findingId: input.findingId, tenantId },
        });
        if (raced) {
          return { acknowledgement: this.toRow(raced), alreadyAcknowledged: true };
        }
      }
      throw cause;
    }
  }

  /**
   * Close an incident.
   *
   * Refused when the finding was never acknowledged. That ordering is a control, not a preference:
   * an incident nobody looked at cannot be closed by whoever closed the ticket, and allowing it
   * makes the acknowledgement record worthless — because "resolved" would then be reachable
   * without anyone ever having been on duty.
   */
  async resolve(input: ResolveFindingInput) {
    const tenantId = this.requireTenant(input.tenantId);
    const acknowledgement = await this.prisma.nocAcknowledgement.findFirst({
      where: { findingId: input.findingId, tenantId },
    });

    if (!acknowledgement) {
      throw new DomainConflictException(
        ERROR_CODES.Conflict,
        'finding was not acknowledged, so it cannot be resolved',
      );
    }
    if (acknowledgement.resolvedAt) {
      return { acknowledgement: this.toRow(acknowledgement), alreadyResolved: true };
    }

    // `updateMany` with the tenant in the `where`, not `update` by id: Prisma's `update` accepts
    // unique fields only, so a scoped write has to be a `where` that carries the tenant itself.
    const result = await this.prisma.nocAcknowledgement.updateMany({
      where: { findingId: input.findingId, tenantId, resolvedAt: null },
      data: { resolvedAt: new Date(), resolvedBy: input.actorMembershipId },
    });
    if (result.count === 0) {
      throw new DomainConflictException(
        ERROR_CODES.Conflict,
        'finding was resolved concurrently',
      );
    }

    await this.audit(tenantId, input.actorMembershipId, 'noc.resolve', input.findingId);

    const updated = await this.prisma.nocAcknowledgement.findFirst({
      where: { findingId: input.findingId, tenantId },
    });
    return { acknowledgement: this.toRow(updated!), alreadyResolved: false };
  }

  /**
   * Acknowledgements for a tenant, newest first.
   *
   * Tenant is part of the lookup rather than a filter applied afterwards, and never inferred from a
   * prior lookup: a NOC operator must not be able to read another tenant's duty log.
   */
  async list(tenantIdInput: string) {
    const tenantId = this.requireTenant(tenantIdInput);
    const rows = await this.prisma.nocAcknowledgement.findMany({
      where: { tenantId },
      orderBy: { acknowledgedAt: 'desc' },
      take: 200,
      select: {
        findingId: true,
        actorMembershipId: true,
        acknowledgedAt: true,
        note: true,
        resolvedAt: true,
        resolvedBy: true,
      },
    });
    return { items: rows.map((row) => ({ ...row, findingId: row.findingId })) };
  }

  private async assertFindingInTenant(tenantId: string, findingId: string): Promise<void> {
    // Scoped read: the finding must belong to the tenant being acknowledged for. Without it, a
    // platform operator could acknowledge a finding in any tenant and the duty log would carry a
    // tenant id nobody chose.
    const finding = await this.prisma.analyticsFinding.findFirst({
      where: { id: findingId, tenantId },
      select: { id: true },
    });
    if (!finding) {
      throw new DomainNotFoundException(ERROR_CODES.NotFound, 'finding not found in this tenant');
    }
  }

  private requireTenant(tenantIdInput: string | undefined): string {
    const trimmed = tenantIdInput?.trim() ?? '';
    if (!trimmed) {
      throw new DomainBadRequestException(
        ERROR_CODES.ValidationFailed,
        'tenantId is required; NOC routes never guess a tenant',
      );
    }
    return trimmed;
  }

  private toRow(row: {
    findingId: string;
    actorMembershipId: string;
    acknowledgedAt: Date;
    note: string | null;
    resolvedAt: Date | null;
    resolvedBy: string | null;
  }) {
    return {
      findingId: row.findingId,
      actorMembershipId: row.actorMembershipId,
      acknowledgedAt: row.acknowledgedAt.toISOString(),
      note: row.note,
      resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
      resolvedBy: row.resolvedBy,
    };
  }

  private async audit(
    tenantId: string,
    actorMembershipId: string,
    action: string,
    findingId: string,
  ) {
    await this.prisma.rbacAuditLog.create({
      data: {
        tenantId,
        // UPDATE, not CREATE: this is an operator action on an existing detector-owned row, and
        // the audit log's enum is the thing an alert rule can group on.
        action: AuditAction.UPDATE,
        resourceType: 'analytics_finding',
        resourceId: findingId,
        actorMembershipId,
        allowed: true,
        detail: `${action} acknowledged=${action === 'noc.acknowledge'}`,
      },
    });
  }
}
