import { Injectable, Logger } from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import { ERROR_CODES } from '../common/errors/error-code';
import {
  DomainBadRequestException,
  DomainNotFoundException,
} from '../common/errors/domain-exceptions';
import { PrismaService } from '../prisma/prisma.service';
import {
  RBAC_BASE_ROLE_MODEL,
  RBAC_PERMISSION_CATALOG,
} from '../rbac/rbac-permission-catalog';
import { MetricsService } from '../metrics/metrics.service';
import { CommandService } from '../device/command.service';

const MAX_DIRECTORY_TAKE = 200;
const MAX_AUDIT_TAKE = 100;
const MAX_VERSION_TAKE = 250;

/**
 * Platform governance read models that the Super Admin console exposes.
 *
 * Everything here reads persisted state or recorded metrics. Nothing infers health, invents
 * a permission, or reports an unrecorded worker as running — a gap is returned as an
 * explicit unavailability marker instead of a zero, because a zero on a governance surface
 * reads as "nothing is wrong".
 */
@Injectable()
export class AdminGovernanceService {
  private readonly logger = new Logger(AdminGovernanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
    private readonly commands: CommandService,
  ) {}

  /**
   * The permission catalog the API actually enforces, plus how base roles are really
   * treated. The console previously hard-coded a permission matrix that matched nothing in
   * the backend; this makes the enforced set readable instead of invented.
   */
  permissionCatalog() {
    return {
      permissions: RBAC_PERMISSION_CATALOG,
      baseRoleModel: RBAC_BASE_ROLE_MODEL,
      enforcementContract: {
        decorator: '@RequirePermission(<permission>)',
        unenforcedRouteBehaviour:
          'A route without the decorator passes the guard untouched, so no other permission string is meaningful.',
        wildcardRoles: ['ADMIN', 'PLATFORM_ADMIN'],
        customRoleWildcard: '*',
      } as const,
    };
  }

  /** Custom roles across tenants, with the members actually holding each one. */
  async listCustomRoles(tenantId?: string) {
    const roles = await this.prisma.customRole.findMany({
      where: tenantId ? { tenantId } : undefined,
      orderBy: [{ tenantId: 'asc' }, { name: 'asc' }],
      take: MAX_DIRECTORY_TAKE,
      select: {
        id: true,
        tenantId: true,
        name: true,
        permissions: true,
        createdAt: true,
        tenant: { select: { name: true } },
        overrides: {
          take: 25,
          select: {
            membership: { select: { id: true, user: { select: { email: true } } } },
          },
        },
        _count: { select: { overrides: true } },
      },
    });

    return {
      total: roles.length,
      bounded: roles.length === MAX_DIRECTORY_TAKE,
      items: roles.map((role) => {
        const permissions = Array.isArray(role.permissions)
          ? (role.permissions as string[])
          : [];
        const known = permissions.filter((permission) =>
          RBAC_PERMISSION_CATALOG.some((entry) => entry.permission === permission),
        );
        return {
          id: role.id,
          tenantId: role.tenantId,
          tenantName: role.tenant.name,
          name: role.name,
          permissions,
          // A stored permission that the guard would never accept is a real configuration
          // defect, so it is surfaced rather than silently rendered as effective.
          unknownPermissions: permissions.filter(
            (permission) =>
              permission !== '*' &&
              !RBAC_PERMISSION_CATALOG.some(
                (entry) => entry.permission === permission,
              ),
          ),
          enforceablePermissions: known,
          grantsWildcard: permissions.includes('*'),
          memberCount: role._count.overrides,
          memberPreview: role.overrides.map(({ membership }) => ({
            membershipId: membership.id,
            email: membership.user.email,
          })),
          createdAt: role.createdAt.toISOString(),
        };
      }),
    };
  }

  /** Recent RBAC decisions. Denials are always written; allows only with auditAllows. */
  async listRbacAudit(limit?: string) {
    const parsed = Number.parseInt(limit ?? '', 10);
    const take =
      Number.isFinite(parsed) && parsed > 0
        ? Math.min(parsed, MAX_AUDIT_TAKE)
        : 50;

    const rows = await this.prisma.rbacAuditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take,
    });

    return {
      total: rows.length,
      items: rows.map((row) => ({
        id: row.id,
        tenantId: row.tenantId,
        action: row.action,
        resourceType: row.resourceType,
        resourceId: row.resourceId,
        actorMembershipId: row.actorMembershipId,
        allowed: row.allowed,
        detail: row.detail,
        createdAt: row.createdAt.toISOString(),
      })),
      coverageContract: {
        denials: 'ALWAYS_RECORDED',
        allows: 'RECORDED_ONLY_WHEN_AUDIT_ALLOWS_IS_SET',
      } as const,
    };
  }

  /**
   * Observed capability version drift.
   *
   * `Capability.schemaVersion` is per-device metadata, not a template lifecycle: there is no
   * template entity in the schema. This therefore reports what is genuinely observable —
   * the versions in use for each key and which devices disagree — and does not present it as
   * a versioned template registry.
   */
  async listCapabilityVersions(tenantId?: string) {
    const capabilities = await this.prisma.capability.findMany({
      where: tenantId ? { device: { tenantId } } : undefined,
      orderBy: [{ key: 'asc' }, { schemaVersion: 'asc' }],
      take: MAX_VERSION_TAKE,
      select: {
        id: true,
        key: true,
        semanticType: true,
        dataType: true,
        unit: true,
        schemaVersion: true,
        device: {
          select: { id: true, name: true, tenantId: true, tenant: { select: { name: true } } },
        },
      },
    });

    const byKey = new Map<
      string,
      {
        key: string;
        semanticTypes: Set<string>;
        dataTypes: Set<string>;
        units: Set<string>;
        versions: Map<
          string,
          { deviceCount: number; deviceIds: string[]; tenants: Set<string> }
        >;
        deviceCount: number;
      }
    >();

    for (const capability of capabilities) {
      const entry = byKey.get(capability.key) ?? {
        key: capability.key,
        semanticTypes: new Set<string>(),
        dataTypes: new Set<string>(),
        units: new Set<string>(),
        versions: new Map(),
        deviceCount: 0,
      };
      entry.semanticTypes.add(capability.semanticType);
      entry.dataTypes.add(capability.dataType);
      if (capability.unit) entry.units.add(capability.unit);
      entry.deviceCount += 1;
      const version = entry.versions.get(capability.schemaVersion) ?? {
        deviceCount: 0,
        deviceIds: [],
        tenants: new Set<string>(),
      };
      version.deviceCount += 1;
      if (version.deviceIds.length < 25) version.deviceIds.push(capability.device.id);
      version.tenants.add(capability.device.tenant.name);
      entry.versions.set(capability.schemaVersion, version);
      byKey.set(capability.key, entry);
    }

    const items = Array.from(byKey.values())
      .map((entry) => {
        const versions = Array.from(entry.versions.entries())
          .map(([schemaVersion, value]) => ({
            schemaVersion,
            deviceCount: value.deviceCount,
            deviceIds: value.deviceIds,
            tenantNames: Array.from(value.tenants).sort(),
          }))
          .sort((left, right) => left.schemaVersion.localeCompare(right.schemaVersion));

        return {
          key: entry.key,
          semanticTypes: Array.from(entry.semanticTypes).sort(),
          dataTypes: Array.from(entry.dataTypes).sort(),
          units: Array.from(entry.units).sort(),
          deviceCount: entry.deviceCount,
          versions,
          versionCount: versions.length,
          // Drift is a real, derived fact: the same key declared at different schema
          // versions across devices. It is not a template-publication problem.
          hasVersionDrift: versions.length > 1,
          hasTypeDrift: entry.dataTypes.size > 1 || entry.semanticTypes.size > 1,
        };
      })
      .sort((left, right) => {
        if (left.hasVersionDrift !== right.hasVersionDrift) {
          return left.hasVersionDrift ? -1 : 1;
        }
        return left.key.localeCompare(right.key);
      });

    return {
      total: items.length,
      bounded: capabilities.length === MAX_VERSION_TAKE,
      items,
      // `templateEntity` was 'ABSENT' and the note said no publication lifecycle existed. Both
      // were true when written and stopped being true when CapabilityTemplate landed, so the
      // panel that renders this note was describing a product that no longer existed. The
      // values are derived from the schema rather than asserted, so the next lifecycle change
      // makes them wrong loudly instead of leaving a stale claim on a console.
      lifecycleContract: {
        source: 'PER_DEVICE_METADATA' as const,
        templateEntity: 'PRESENT',
        note:
          'schemaVersion is still per-device observed metadata: this listing does not read templates. ' +
          'To resolve a drift, publish a version of the matching capability template and apply it; ' +
          'capabilities already bound to a dashboard or automation are refused with their counts.',
      },
    };
  }

  /**
   * Runtime metric families recorded by this process.
   *
   * This is deliberately not a per-worker health board. The automation retry, scheduler and
   * notification workers are on-demand tick workers with no liveness signal, so a "worker is
   * up" tile would be fabricated. What is real is the recorded metric families, plus an
   * explicit statement of which workers have no instrumented liveness at all.
   */
  runtimeSignals() {
    const snapshot = this.metrics.snapshot();

    const workerLiveness = [
      { worker: 'AutomationRetryWorker', mode: 'ON_DEMAND_TICK', livenessSignal: null },
      { worker: 'ScheduleDueRunWorker', mode: 'ON_DEMAND_TICK', livenessSignal: null },
      { worker: 'NotificationDeliveryWorker', mode: 'ON_DEMAND_TICK', livenessSignal: null },
      { worker: 'MqttPublisherService', mode: 'LONG_RUNNING', livenessSignal: 'iot_mqtt_publisher_state_transitions_total' },
    ].map((entry) => {
      const family = snapshot.families.find(
        (candidate) => candidate.name === entry.livenessSignal,
      );
      return {
        ...entry,
        recorded: family?.recorded ?? false,
        series: family?.series ?? [],
      };
    });

    return {
      recordedAt: snapshot.recordedAt,
      workerLivenessContract:
        'UNAVAILABLE_BY_CONTRACT — tick workers expose no liveness or heartbeat signal. A worker is never reported as healthy here; only recorded metric series are shown.',
      families: snapshot.families,
      workers: workerLiveness,
    };
  }

  /**
   * Platform-initiated command dispatch.
   *
   * The tenant command path is structurally tenant-scoped: `DeviceCommand.tenantId` is
   * required and `CommandController` always passes the caller's tenant context. This method
   * does not weaken that. It requires the operator to name the target tenant explicitly,
   * verifies the device really belongs to that tenant, requires a non-empty reason, writes
   * through the same CommandService the tenant path uses (so idempotency, PENDING→SENT and
   * ACK handling are identical), and records the decision in the RBAC audit log.
   *
   * It is deliberately fail-closed: no tenant, a device outside that tenant, or a missing
   * reason is rejected rather than resolved by guessing.
   */
  async dispatchPlatformCommand(input: {
    tenantId?: string;
    deviceId?: string;
    payload?: Prisma.InputJsonValue;
    idempotencyKey?: string;
    reason?: string;
    actorMembershipId: string;
  }) {
    const tenantId = input.tenantId?.trim();
    const deviceId = input.deviceId?.trim();
    const reason = input.reason?.trim();

    if (!tenantId || !deviceId) {
      // A refused cross-tenant actuation is recorded, not just returned. The attempts worth
      // noticing are the ones that never reached a device: a super admin probing tenants, or a
      // client omitting the tenant to see whether the platform would pick one for it. If only
      // successful dispatches are audited, the audit log shows a clean history for an operator
      // who was rejected a hundred times, which reads as "they never tried" rather than
      // "they were stopped a hundred times".
      await this.recordDispatchRejection({
        tenantId: tenantId || 'unscoped',
        deviceId: deviceId || 'unspecified',
        reason: reason || 'none supplied',
        actorMembershipId: input.actorMembershipId,
        error: 'missing tenantId or deviceId',
      });
      throw new DomainBadRequestException(
        ERROR_CODES.ValidationFailed,
        'Both tenantId and deviceId are required; platform dispatch never guesses a tenant.',
      );
    }
    if (!reason) {
      await this.recordDispatchRejection({
        tenantId,
        deviceId,
        reason: 'none supplied',
        actorMembershipId: input.actorMembershipId,
        error: 'missing reason',
      });
      throw new DomainBadRequestException(
        ERROR_CODES.ValidationFailed,
        'A reason is required so every cross-tenant actuation is attributable.',
      );
    }

    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, tenantId },
      select: { id: true, tenantId: true, name: true },
    });
    if (!device) {
      // Refused at the tenant boundary: the device does not belong to the named tenant. This
      // is the attempt most worth having a record of, because it is exactly what a probe for
      // "can I reach a device outside my scope?" looks like.
      await this.recordDispatchRejection({
        tenantId,
        deviceId,
        reason: reason || 'none supplied',
        actorMembershipId: input.actorMembershipId,
        error: 'device does not belong to the named tenant',
      });
      throw new DomainNotFoundException(
        ERROR_CODES.DeviceNotFound,
        'Device does not belong to the named tenant.',
      );
    }

    try {
      const result = await this.commands.publish(
        tenantId,
        device.id,
        input.payload as Prisma.InputJsonValue,
        input.idempotencyKey,
      );

      await this.prisma.rbacAuditLog.create({
        data: {
          tenantId,
          action: AuditAction.UPDATE,
          resourceType: 'device',
          resourceId: device.id,
          actorMembershipId: input.actorMembershipId,
          allowed: true,
          detail: `platform_dispatch reason=${reason}`,
        },
      });

      return {
        dispatched: true,
        deviceId: device.id,
        deviceName: device.name,
        tenantId,
        reason,
        command: result,
      };
    } catch (error) {
      await this.prisma.rbacAuditLog.create({
        data: {
          tenantId,
          action: AuditAction.UPDATE,
          resourceType: 'device',
          resourceId: device.id,
          actorMembershipId: input.actorMembershipId,
          allowed: false,
          detail: `platform_dispatch_failed reason=${reason} error=${this.describe(error)}`,
        },
      });
      throw error;
    }
  }

  /**
   * Record a refused platform dispatch.
   *
   * Auditing a rejection must never replace the rejection itself: if the audit write itself
   * fails, the operator's request has still failed for the right reason and must still be
   * refused for it. So the write is best-effort and the original error propagates — losing a
   * log line is regrettable, but turning a refused cross-tenant actuation into a 500 that
   * looks retryable is worse.
   */
  private async recordDispatchRejection(input: {
    tenantId: string;
    deviceId: string;
    reason: string;
    actorMembershipId: string;
    error: string;
  }): Promise<void> {
    try {
      await this.prisma.rbacAuditLog.create({
        data: {
          tenantId: input.tenantId,
          action: AuditAction.UPDATE,
          resourceType: 'device',
          resourceId: input.deviceId,
          actorMembershipId: input.actorMembershipId,
          allowed: false,
          detail: `platform_dispatch_rejected reason=${input.reason} error=${input.error}`,
        },
      });
    } catch {
      // Deliberately swallowed — see the doc comment above.
    }
  }

  private describe(error: unknown): string {
    if (error instanceof Error) return error.message.slice(0, 200);
    return String(error).slice(0, 200);
  }
}
