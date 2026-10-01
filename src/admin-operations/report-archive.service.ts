import { Injectable, Logger } from '@nestjs/common';
import { AuditAction, Prisma, SavedReportKind } from '@prisma/client';
import { ERROR_CODES } from '../common/errors/error-code';
import {
  DomainBadRequestException,
  DomainNotFoundException,
} from '../common/errors/domain-exceptions';
import { PrismaService } from '../prisma/prisma.service';
import { AdminPlatformObservabilityService } from './admin-platform-observability.service';

/**
 * How long a saved report stays downloadable. The owner's decision, 28 days.
 *
 * Stated once, used in two places -- the expiry written on save and the purge -- so the number an
 * operator is told cannot drift from the number that is enforced.
 */
export const RETENTION_DAYS = 28;

const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000;

/**
 * The same ceiling the report service applies to a live run. A save wider than this would store a
 * report labelled "the last year" computed over 24 hours of data, which is the class of
 * mislabelled number this repository refuses to produce elsewhere.
 *
 * 31 days here against 28 days of retention is deliberate and not an oversight: a report can
 * outlive the widest window it could have been produced from, because retention answers "how long
 * may this be read" while this answers "how far back may a report reach".
 */
export const MAX_REPORT_HOURS = 24 * 31;

export interface SaveReportInput {
  tenantId: string;
  actorMembershipId: string;
  hours: number;
}

export interface ListSavedReportsInput {
  tenantId: string;
  take?: number;
}

/**
 * A saved report as the API returns it.
 *
 * Exported because the controller returns it and this project builds declarations: an unexported
 * type in a public method's return position fails the declaration build with TS4053. The failure
 * names the type rather than the cause, so it reads as a missing export when it is actually a
 * missing `export` keyword.
 */
export interface SavedReportRow {
  id: string;
  kind: SavedReportKind;
  rangeFrom: string;
  rangeTo: string;
  requestedHours: number;
  rowCount: number;
  createdAt: string;
  expiresAt: string;
  /**
   * Present on the list, absent on the single-report response.
   *
   * The save response deliberately omits it: echoing the actor back to the caller who just
   * supplied it says nothing, while the list is where "whose report is this" is a real question.
   * Two shapes rather than one optional field, so a consumer can rely on the list always having
   * it rather than checking for `undefined`.
   */
  actorMembershipId?: string;
}

/**
 * Saved reports.
 *
 * `getTenantSummaryReport` and the tenant CSV export both recompute from `now`. That makes them
 * correct about the present and useless for everything else: the number an operator read on
 * Monday cannot be retrieved on Tuesday, so the report cannot be reproduced, and a report that
 * cannot be reproduced cannot settle a disagreement between two people who read it at different
 * times.
 *
 * So the payload is stored, together with the window that produced it. Storing the payload rather
 * than the query is the whole design: regenerating on download would let the number move
 * underneath the operator between saving and re-reading, which is precisely the failure this
 * removes.
 *
 * Two decisions are load-bearing and easy to invert later:
 *
 *  - **The operator saves the run.** Nothing is saved automatically, so the archive is a record of
 *    what someone looked at rather than a growing table nobody reads. For the same reason there is
 *    no scheduler: the owner chose saved runs over scheduled ones, and a `cron` column that
 *    nothing reads would look available in the data model while being unavailable in the product.
 *  - **Expiry hides, it does not delete.** An expired report is filtered out of the list and
 *    refused on download, and the row stays. A report that vanishes silently is indistinguishable
 *    from one that was never run.
 */
@Injectable()
export class ReportArchiveService {
  private readonly logger = new Logger(ReportArchiveService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly observability: AdminPlatformObservabilityService,
  ) {}

  /** Run the tenant summary and store it as produced. */
  async saveTenantSummary(input: SaveReportInput) {
    this.requireTenant(input.tenantId);
    const hours = this.parseHours(input.hours);

    const generated = await this.observability.getTenantSummaryReport(String(hours));
    const now = new Date();
    const rangeTo = now;
    const rangeFrom = new Date(now.getTime() - hours * 60 * 60 * 1000);

    const saved = await this.prisma.savedReport.create({
      data: {
        tenantId: input.tenantId,
        kind: SavedReportKind.TENANT_SUMMARY,
        rangeFrom,
        rangeTo,
        requestedHours: hours,
        payload: generated as unknown as Prisma.InputJsonValue,
        rowCount: this.rowCountOf(generated),
        actorMembershipId: input.actorMembershipId,
        expiresAt: new Date(now.getTime() + RETENTION_MS),
      },
      select: {
        id: true,
        kind: true,
        rangeFrom: true,
        rangeTo: true,
        requestedHours: true,
        rowCount: true,
        createdAt: true,
        expiresAt: true,
      },
    });

    await this.audit(
      input.tenantId,
      input.actorMembershipId,
      'saved_report.create',
      saved.id,
      `kind=${saved.kind} hours=${hours} rows=${saved.rowCount}`,
    );

    return {
      saved: this.toRow(saved),
      // Stated rather than implied: what was stored, and over what window.
      note: 'the stored payload is what will be downloaded later; it is not recomputed',
    };
  }

  /**
   * Saved reports for a tenant, newest first, excluding expired ones.
   *
   * Expiry is applied in the query rather than by deleting rows, so the list and the download
   * cannot disagree about whether a report still exists.
   */
  async listSavedReports(input: ListSavedReportsInput) {
    this.requireTenant(input.tenantId);
    const take = Math.min(Math.max(input.take ?? 50, 1), 200);

    const rows = await this.prisma.savedReport.findMany({
      where: {
        tenantId: input.tenantId,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        kind: true,
        rangeFrom: true,
        rangeTo: true,
        requestedHours: true,
        rowCount: true,
        actorMembershipId: true,
        createdAt: true,
        expiresAt: true,
      },
    });

    return {
      items: rows.map((row) => this.toRow(row)),
      total: rows.length,
      retentionDays: RETENTION_DAYS,
    };
  }

  /**
   * The stored payload, for download.
   *
   * Not recomputed. This is the difference between a saved report and a saved query.
   */
  async getSavedReport(tenantId: string, reportId: string) {
    this.requireTenant(tenantId);

    const row = await this.prisma.savedReport.findFirst({
      // Tenant is part of the lookup, not a filter applied afterwards: a report body is tenant
      // data, and a platform route that fetched by id alone would hand one tenant's report to
      // whoever guessed the id.
      where: { id: reportId, tenantId },
    });

    if (!row) {
      throw new DomainNotFoundException(ERROR_CODES.NotFound, 'saved report not found');
    }
    if (row.expiresAt.getTime() <= Date.now()) {
      // Refused rather than returned: the row exists so the history is legible, but a report past
      // its window is not downloadable. The distinction is stated because "not found" for an
      // expired report would tell an operator the wrong thing about their own history.
      throw new DomainNotFoundException(
        ERROR_CODES.NotFound,
        `saved report expired on ${row.expiresAt.toISOString()}`,
      );
    }

    return {
      saved: this.toRow(row),
      payload: row.payload,
    };
  }

  /**
   * Delete rows past their expiry.
   *
   * Expiry is already enforced on read, so this is housekeeping rather than correctness -- it keeps
   * the table from accumulating indefinitely. Called on the save path, so a tenant that stops
   * saving reports stops accumulating rows too.
   */
  async purgeExpired(): Promise<number> {
    const result = await this.prisma.savedReport.deleteMany({
      where: { expiresAt: { lte: new Date() } },
    });
    if (result.count > 0) {
      // `event` inside the object, one argument. The two-argument form -- a details object plus a
      // message string -- is what the structured-logging contract rejects, and it is easy to write
      // because Nest's `log(message, context)` signature makes it look like the second argument is
      // free text. Here it was the event name, which the log pipeline never reads.
      this.logger.log({ event: 'report.purged', purged: result.count });
    }
    return result.count;
  }

  private parseHours(raw: number): number {
    if (!Number.isFinite(raw) || raw < 1) {
      throw new DomainBadRequestException(
        ERROR_CODES.ValidationFailed,
        'hours must be a positive number',
      );
    }
    return Math.min(Math.floor(raw), MAX_REPORT_HOURS);
  }

  private requireTenant(tenantId: string | undefined): string {
    const trimmed = tenantId?.trim() ?? '';
    if (!trimmed) {
      throw new DomainBadRequestException(
        ERROR_CODES.ValidationFailed,
        'tenantId is required; platform routes never guess a tenant',
      );
    }
    return trimmed;
  }

  private rowCountOf(generated: unknown): number {
    if (generated && typeof generated === 'object' && Array.isArray((generated as { items?: unknown[] }).items)) {
      return ((generated as { items: unknown[] }).items).length;
    }
    return 0;
  }

  private toRow(row: {
    id: string;
    kind: SavedReportKind;
    rangeFrom: Date;
    rangeTo: Date;
    requestedHours: number;
    rowCount: number;
    actorMembershipId?: string;
    createdAt: Date;
    expiresAt: Date;
  }): SavedReportRow {
    return {
      id: row.id,
      kind: row.kind,
      rangeFrom: row.rangeFrom.toISOString(),
      rangeTo: row.rangeTo.toISOString(),
      requestedHours: row.requestedHours,
      rowCount: row.rowCount,
      ...(row.actorMembershipId ? { actorMembershipId: row.actorMembershipId } : {}),
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
    };
  }

  private async audit(
    tenantId: string,
    actorMembershipId: string,
    resourceType: string,
    resourceId: string,
    detail: string,
  ) {
    await this.prisma.rbacAuditLog.create({
      data: {
        tenantId,
        action: AuditAction.UPDATE,
        resourceType,
        resourceId,
        actorMembershipId,
        allowed: true,
        detail,
      },
    });
  }
}