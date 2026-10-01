import { Injectable, Logger } from '@nestjs/common';
import { AuditAction, CapabilityTemplateStatus, Prisma } from '@prisma/client';
import { ERROR_CODES } from '../common/errors/error-code';
import {
  DomainBadRequestException,
  DomainConflictException,
  DomainNotFoundException,
} from '../common/errors/domain-exceptions';
import { PrismaService } from '../prisma/prisma.service';

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

export interface CreateTemplateInput {
  tenantId: string;
  actorMembershipId: string;
  key: string;
  semanticType: string;
  dataType: string;
  unit?: string;
  description?: string;
}

export interface PublishVersionInput {
  tenantId: string;
  actorMembershipId: string;
  templateId: string;
  version: string;
  constraints?: Prisma.InputJsonValue;
  semanticType?: string;
  isReadable?: boolean;
  isWritable?: boolean;
  isReportable?: boolean;
  /** Flip the currently published version to DEPRECATED as part of publishing. */
  supersede?: boolean;
  /**
   * Publish a version lower than the current one.
   *
   * Publishing refuses to move the fleet backwards, because a mistake in a version number would
   * otherwise silently repoint every device at an older shape. That refusal left no way back,
   * though, and "roll the fleet back to the last good version" is a normal thing to need after a
   * bad publication. So going backwards is possible, but only when asked for by name -- it
   * cannot happen by accident, and the audit row records that it was a rollback.
   */
  rollback?: boolean;
}

export interface DeprecateInput {
  tenantId: string;
  actorMembershipId: string;
  templateId: string;
  version: string;
  reason?: string;
}

export interface ApplyVersionInput {
  tenantId: string;
  actorMembershipId: string;
  templateId: string;
  /** Cap the number of devices a single press may touch. */
  maxDevices?: number;
  /** Report what would change without changing it. */
  dryRun?: boolean;
}

// Exported because it is the return type of a public method: TS4053 makes a non-exported type
// unreachable from the declaration emit, which fails the production build even though
// `tsc --noEmit` passes. Caught only by building the image, not by the typecheck gate.
export interface Refusal {
  capabilityId: string;
  deviceId: string;
  deviceName: string;
  fromVersion: string;
  bindingCount: number;
  automationCount: number;
}

/**
 * The capability template lifecycle.
 *
 * `Capability` is a per-device row and `@@unique([deviceId, key])` gives every device its own
 * `schemaVersion`. That is what makes drift possible, and `listCapabilityVersions` has always
 * reported it -- but nothing could act on it, so the drift panel was a complaint rather than a
 * control. This service gives it an answer: declare the shape a key should have, publish it,
 * and move devices onto it.
 *
 * Two owner decisions are load-bearing here and easy to invert later, so they are implemented
 * rather than left to the next reader:
 *
 *  - **Publishing never touches a device.** Applying is a separate, deliberate act. A
 *    publication that rewrote the fleet would make "publish 2.0.0" a fleet-wide schema change
 *    performed by one click on a form, which is not what publishing a version means anywhere
 *    else.
 *  - **A bound capability is refused, not changed.** A capability already referenced by a
 *    dashboard binding or an automation has stored data and live rules behind it; changing its
 *    schema version underneath those repoints widgets and triggers at a shape they were never
 *    written against. The refusal carries the counts, so it is a to-do list rather than a dead
 *    end.
 */
@Injectable()
export class CapabilityTemplateService {
  private readonly logger = new Logger(CapabilityTemplateService.name);

  constructor(private readonly prisma: PrismaService) {}

  async listTemplates(tenantId: string, take = 100) {
    tenantId = this.requireTenant(tenantId);
    const templates = await this.prisma.capabilityTemplate.findMany({
      where: { tenantId },
      include: { versions: { orderBy: { createdAt: 'desc' }, take: 10 } },
      orderBy: { key: 'asc' },
      take: Math.min(Math.max(take, 1), 500),
    });

    return {
      templates: templates.map((template) => ({
        id: template.id,
        key: template.key,
        semanticType: template.semanticType,
        dataType: template.dataType,
        unit: template.unit,
        description: template.description,
        archivedAt: template.archivedAt,
        publishedVersion:
          template.versions.find((v) => v.status === CapabilityTemplateStatus.PUBLISHED)?.version ??
          null,
        versions: template.versions.map((v) => ({
          id: v.id,
          version: v.version,
          status: v.status,
          constraints: v.constraints,
          isReadable: v.isReadable,
          isWritable: v.isWritable,
          isReportable: v.isReportable,
          publishedAt: v.publishedAt,
          deprecatedAt: v.deprecatedAt,
        })),
      })),
    };
  }

  async createTemplate(input: CreateTemplateInput) {
    input.tenantId = this.requireTenant(input.tenantId);
    const key = input.key?.trim();
    if (!key) {
      throw new DomainBadRequestException(ERROR_CODES.ValidationFailed, 'template key is required');
    }
    if (!input.semanticType?.trim()) {
      throw new DomainBadRequestException(
        ERROR_CODES.ValidationFailed,
        'semanticType is required',
      );
    }

    const existing = await this.prisma.capabilityTemplate.findUnique({
      where: { tenantId_key: { tenantId: input.tenantId, key } },
    });
    if (existing) {
      // A second template for the same key is a duplicate declaration, not a conflict to
      // resolve automatically: merging two descriptions of one capability is a judgement call
      // the operator has to make.
      throw new DomainConflictException(
        ERROR_CODES.Conflict,
        `a template already exists for key "${key}"`,
      );
    }

    const template = await this.prisma.capabilityTemplate.create({
      data: {
        tenantId: input.tenantId,
        key,
        semanticType: input.semanticType.trim(),
        dataType: input.dataType?.trim() || 'string',
        unit: input.unit?.trim() || null,
        description: input.description?.trim() || null,
      },
    });

    // Every template starts with a 1.0.0 draft so the lifecycle has an entry point without a
    // separate "create first version" call. It is a DRAFT, so nothing is published and no
    // device is affected.
    const initialVersion = await this.prisma.capabilityTemplateVersion.create({
      data: {
        templateId: template.id,
        version: '1.0.0',
        status: CapabilityTemplateStatus.DRAFT,
      },
    });

    await this.audit(
      input.tenantId,
      input.actorMembershipId,
      'capability_template.create',
      template.id,
      `key=${key}`,
    );

    return { template, initialVersion };
  }

  /**
   * Publish a version, optionally superseding the one currently published.
   *
   * The flip and the insert share one transaction. Two published versions would leave "the
   * version this fleet is on" unanswerable, and the partial unique index would reject the
   * second insert -- but doing the demotion outside the transaction means a crash between them
   * leaves the template with no published version at all, which is a worse state than the one
   * the constraint exists to prevent.
   */
  async publishVersion(input: PublishVersionInput) {
    input.tenantId = this.requireTenant(input.tenantId);
    if (!SEMVER.test(input.version ?? '')) {
      throw new DomainBadRequestException(
        ERROR_CODES.ValidationFailed,
        'version must look like MAJOR.MINOR.PATCH',
      );
    }

    const template = await this.loadTemplate(input.tenantId, input.templateId);
    const current = await this.currentPublished(template.id, input.tenantId);

    if (current && !input.supersede) {
      throw new DomainConflictException(
        ERROR_CODES.Conflict,
        `version ${current.version} is already published; pass supersede to replace it`,
      );
    }
    if (current && compareSemver(input.version, current.version) < 0) {
      // Moving the fleet backwards is legitimate after a bad publication, but never by
      // accident: it has to be named as a rollback, and it is recorded as one. Without the flag
      // this refusal would also have made a bad publication permanent -- the fleet could be
      // pushed onto a broken version with no supported way to get it back.
      if (!input.rollback) {
        throw new DomainBadRequestException(
          ERROR_CODES.ValidationFailed,
          `version ${input.version} is lower than the published ${current.version}; pass rollback to move the fleet backwards`,
        );
      }
    }
    if (current && compareSemver(input.version, current.version) === 0 && !input.rollback) {
      throw new DomainBadRequestException(
        ERROR_CODES.ValidationFailed,
        `version ${current.version} is already published`,
      );
    }

    const nextSemanticType = input.semanticType?.trim() || template.semanticType;

    // A version that already exists must be promoted, not re-created. Every template starts
    // with a 1.0.0 draft, so "publish 1.0.0" is a first-class operation, and a rollback to it
    // after a bad 2.0.0 is a second. Blindly creating produced a Prisma unique violation on
    // `[templateId, version]` -- a 500 from the API for an action an operator has every reason
    // to attempt, and the one action that matters most when a publication has gone wrong.
    const existingVersion = await this.prisma.capabilityTemplateVersion.findFirst({
      where: { templateId: template.id, version: input.version },
      // Scoped through the template's own tenant relation rather than trusting the caller's
      // earlier `loadTemplate` check. `template.id` came from a tenant-filtered lookup, so the
      // extra predicate is redundant today -- and that redundancy is the point. A version query
      // that reads as tenant-agnostic is one refactor away from being reachable with a
      // cross-tenant id, and `test/tenant-isolation-at-query-layer.contract.spec.ts` cannot tell
      // the difference between "scoped" and "scoped somewhere upstream".
      include: { template: { select: { tenantId: true } } },
    });
    if (existingVersion && existingVersion.template.tenantId !== input.tenantId) {
      throw new DomainNotFoundException(ERROR_CODES.NotFound, 'capability template not found');
    }

    const version = await this.prisma.$transaction(async (tx) => {
      if (current) {
        await tx.capabilityTemplateVersion.update({
          where: { id: current.id },
          data: { status: CapabilityTemplateStatus.DEPRECATED, deprecatedAt: new Date() },
        });
      }
      const shape = {
        status: CapabilityTemplateStatus.PUBLISHED,
        publishedAt: new Date(),
        deprecatedAt: null,
        constraints: input.constraints,
        isReadable: input.isReadable ?? true,
        isWritable: input.isWritable ?? false,
        isReportable: input.isReportable ?? true,
        previousSemanticType:
          nextSemanticType !== template.semanticType ? template.semanticType : null,
      };
      return existingVersion
        ? tx.capabilityTemplateVersion.update({ where: { id: existingVersion.id }, data: shape })
        : tx.capabilityTemplateVersion.create({
            data: { templateId: template.id, version: input.version, ...shape },
          });
    });

    if (nextSemanticType !== template.semanticType) {
      await this.prisma.capabilityTemplate.update({
        where: { id: template.id },
        data: { semanticType: nextSemanticType },
      });
    }

    await this.audit(
      input.tenantId,
      input.actorMembershipId,
      'capability_template.publish',
      template.id,
      `version=${input.version}${current ? ` supersedes=${current.version}` : ''}` +
        `${input.rollback ? ' rollback=true' : ''}`,
    );

    return {
      published: version,
      superseded: current ? { version: current.version } : null,
      // Stated rather than implied: publishing changed no device, so nobody reading the
      // response can assume the fleet moved.
      devicesAffected: 0,
      note: 'publishing does not change devices; apply the version to move them',
    };
  }

  async deprecateVersion(input: DeprecateInput) {
    input.tenantId = this.requireTenant(input.tenantId);
    const template = await this.loadTemplate(input.tenantId, input.templateId);
    const version = await this.prisma.capabilityTemplateVersion.findFirst({
      // Tenant stated in the query, not merely implied by `loadTemplate` having run first. The
      // guard that flagged this cannot distinguish "scoped" from "scoped somewhere upstream", and
      // the upstream scoping is one edit away from moving.
      where: { templateId: template.id, version: input.version, template: { tenantId: input.tenantId } },
    });
    if (!version) {
      throw new DomainNotFoundException(
        ERROR_CODES.NotFound,
        `version ${input.version} not found`,
      );
    }
    if (version.status === CapabilityTemplateStatus.DEPRECATED) {
      throw new DomainConflictException(
        ERROR_CODES.Conflict,
        `version ${input.version} is already deprecated`,
      );
    }

    const deprecated = await this.prisma.capabilityTemplateVersion.update({
      where: { id: version.id },
      data: { status: CapabilityTemplateStatus.DEPRECATED, deprecatedAt: new Date() },
    });

    await this.audit(
      input.tenantId,
      input.actorMembershipId,
      'capability_template.deprecate',
      template.id,
      `version=${input.version}${input.reason ? ` reason=${input.reason}` : ''}`,
    );

    return { deprecated };
  }

  /**
   * Move devices onto the published version of the template's key.
   *
   * The refusal is the interesting part. A capability that a dashboard widget or an automation
   * already reads is refused outright, with the counts, because rewriting its schema version
   * underneath live bindings is how a dashboard starts reading the wrong field. A fleet already
   * on the target version reports `alreadyOnTarget` instead of claiming an update, so pressing
   * apply twice reports honestly the second time.
   */
  async applyVersion(input: ApplyVersionInput) {
    input.tenantId = this.requireTenant(input.tenantId);
    const template = await this.loadTemplate(input.tenantId, input.templateId);
    const target = await this.currentPublished(template.id, input.tenantId);
    if (!target) {
      throw new DomainConflictException(
        ERROR_CODES.Conflict,
        `template ${template.key} has no published version to apply`,
      );
    }

    const cap = Math.min(Math.max(input.maxDevices ?? 500, 1), 5000);

    // Scoped by tenant and by the template's own key. An apply route that took only a
    // templateId would rewrite every tenant's devices from a platform console click.
    const candidates = await this.prisma.capability.findMany({
      where: {
        device: { tenantId: input.tenantId },
        key: template.key,
        NOT: { schemaVersion: target.version },
      },
      select: {
        id: true,
        deviceId: true,
        schemaVersion: true,
        device: { select: { name: true } },
      },
      orderBy: { device: { name: 'asc' } },
      take: cap + 1,
    });

    const truncated = candidates.length > cap;
    const scoped = candidates.slice(0, cap);

    if (scoped.length === 0) {
      return {
        templateId: template.id,
        key: template.key,
        targetVersion: target.version,
        updated: 0,
        alreadyOnTarget: true,
        refused: [] as Refusal[],
        truncated: false,
        dryRun: input.dryRun === true,
        note: 'every device is already on the published version',
      };
    }

    const ids = scoped.map((c) => c.id);

    // Every reference table counted up front, in one place, so the refusal the operator reads
    // and the audit row written below cannot disagree about what was held back.
    const [bindingRows, triggerRows, actionRows] = await Promise.all([
      this.prisma.dashboardWidgetBinding.groupBy({
        by: ['capabilityId'],
        where: { capabilityId: { in: ids } },
        _count: { capabilityId: true },
      }),
      this.prisma.automation.groupBy({
        by: ['triggerCapabilityId'],
        where: { triggerCapabilityId: { in: ids } },
        _count: { triggerCapabilityId: true },
      }),
      this.prisma.automationAction.groupBy({
        by: ['capabilityId'],
        where: { capabilityId: { in: ids } },
        _count: { capabilityId: true },
      }),
    ]);

    const bindingById = new Map(bindingRows.map((r) => [r.capabilityId, r._count.capabilityId]));
    const automationById = new Map(
      triggerRows.map((r) => [r.triggerCapabilityId, r._count.triggerCapabilityId]),
    );
    for (const row of actionRows) {
      automationById.set(row.capabilityId, (automationById.get(row.capabilityId) ?? 0) + row._count.capabilityId);
    }

    const refused: Refusal[] = [];
    const applicable: typeof scoped = [];

    for (const candidate of scoped) {
      const bindingCount = bindingById.get(candidate.id) ?? 0;
      const automationCount = automationById.get(candidate.id) ?? 0;
      if (bindingCount > 0 || automationCount > 0) {
        refused.push({
          capabilityId: candidate.id,
          deviceId: candidate.deviceId,
          deviceName: candidate.device.name,
          fromVersion: candidate.schemaVersion,
          bindingCount,
          automationCount,
        });
      } else {
        applicable.push(candidate);
      }
    }

    if (input.dryRun) {
      return {
        templateId: template.id,
        key: template.key,
        targetVersion: target.version,
        wouldUpdate: applicable.length,
        wouldRefuse: refused.length,
        refused,
        truncated,
        dryRun: true,
      };
    }

    let updated = 0;
    if (applicable.length > 0) {
      // `where` is on ids already scoped to this tenant and key -- never a bare `{}`.
      updated = (
        await this.prisma.capability.updateMany({
          where: { id: { in: applicable.map((c) => c.id) } },
          data: { schemaVersion: target.version },
        })
      ).count;
    }

    await this.audit(
      input.tenantId,
      input.actorMembershipId,
      'capability_template.apply',
      template.id,
      `version=${target.version} updated=${updated} refused=${refused.length}`,
    );

    return {
      templateId: template.id,
      key: template.key,
      targetVersion: target.version,
      updated,
      alreadyOnTarget: false,
      refused,
      truncated,
      dryRun: false,
    };
  }

  /**
   * Refuse an empty tenant before it reaches a query.
   *
   * Every route here takes `tenantId` in the body rather than the session, because these are
   * platform routes that address any tenant on purpose. The risk that follows from that is a
   * caller omitting it, and an omitted tenant must not widen a scope: with `tenantId: ''` the
   * lookups below would simply match nothing and return a confusing 404, while an apply with a
   * truthy-but-wrong tenant would move another customer's devices. Both are refusals, said
   * plainly.
   */
  private requireTenant(tenantId: string | undefined): string {
    const trimmed = tenantId?.trim() ?? '';
    if (!trimmed) {
      throw new DomainBadRequestException(
        ERROR_CODES.ValidationFailed,
        'tenantId is required; these routes never guess a tenant',
      );
    }
    return trimmed;
  }

  private async loadTemplate(tenantId: string, templateId: string) {
    // tenantId is part of the lookup, not a filter applied afterwards: a platform console that
    // can address another tenant's template by id is a cross-tenant read.
    const template = await this.prisma.capabilityTemplate.findFirst({
      where: { id: templateId, tenantId },
    });
    if (!template) {
      throw new DomainNotFoundException(ERROR_CODES.NotFound, 'capability template not found');
    }
    return template;
  }

  /**
   * The currently published version of a template, for a named tenant.
   *
   * `tenantId` is a parameter rather than something read from the caller. A private helper that
   * took only `templateId` looked harmless because every caller had already loaded the template
   * through a tenant-filtered query -- and that is precisely the reasoning
   * `test/tenant-isolation-at-query-layer.contract.spec.ts` refuses to accept. The tenant is now
   * stated where the query happens.
   */
  private async currentPublished(templateId: string, tenantId: string) {
    return this.prisma.capabilityTemplateVersion.findFirst({
      // `tenantId` is not a column on `capability_template_versions` -- the tenant lives on the
      // template -- so the scope is a relation filter. `tsc --noEmit -p tsconfig.json` accepts a
      // flat `tenantId` here and the production build rejects it, which is the same trap the
      // guard and the compiler disagree about; the relation form is the one both accept.
      where: {
        templateId,
        status: CapabilityTemplateStatus.PUBLISHED,
        template: { tenantId },
      },
    });
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

/** Compare two semver strings numerically, field by field. */
function compareSemver(a: string, b: string): number {
  const left = SEMVER.exec(a);
  const right = SEMVER.exec(b);
  if (!left || !right) return 0;
  for (let i = 1; i <= 3; i += 1) {
    const diff = Number(left[i]) - Number(right[i]);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  return 0;
}
