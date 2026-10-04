import { Injectable } from '@nestjs/common';
import { AuditAction, MaintenanceStatus, Prisma } from '@prisma/client';

import {
  DomainBadRequestException,
  DomainConflictException,
  DomainNotFoundException,
} from '../common/errors/domain-exceptions';
import { ERROR_CODES } from '../common/errors/error-code';
import { PrismaService } from '../prisma/prisma.service';
import { RbacAuditService } from '../rbac/rbac-audit.service';

/**
 * Technician maintenance windows.
 *
 * ## Why this is a table and not a `DeviceStatus` value
 *
 * `DeviceService.updateHeartbeat` writes `status: ACTIVE` on every heartbeat, from a
 * device-credential route, with no check of what the status currently is. A `MAINTENANCE` member
 * of `DeviceStatus` would therefore be overwritten by the device's own next ping — the window would
 * close itself seconds after a technician opened it, and the technician would be looking at a
 * console that says the device is fine while it is still on the bench.
 *
 * So maintenance is a record with its own lifecycle. `Device.status` keeps meaning "is this device
 * alive and authorised", which is what it always meant, and the window is a separate question.
 *
 * ## One open window per device
 *
 * Enforced by a conditional insert, not a unique index. Two open windows would mean two technicians
 * each believing they own the same device, and the first closure would silently end the second's
 * work. A unique index would turn the second attempt into a raw database error; a conditional write
 * turns it into a conflict the API can describe in words the technician can act on.
 *
 * ## Race between open and resolve
 *
 * Two technicians, or one technician and a retry, can have a resolve land between an open's read
 * and its write. The open path therefore writes conditionally on the window still being absent, and
 * a lost race is reported as a conflict rather than silently re-opening a closed window — which
 * would leave a device "under maintenance" with nobody responsible for it.
 */

export interface OpenMaintenanceInput {
  tenantId: string;
  deviceId: string;
  reason: string;
  userId: string;
}

export interface ResolveMaintenanceInput {
  tenantId: string;
  maintenanceId: string;
  resolutionNote?: string;
  userId: string;
}

export interface MaintenanceWindowRow {
  id: string;
  deviceId: string;
  deviceName: string | null;
  status: MaintenanceStatus;
  reason: string;
  openedByUserId: string;
  openedAt: Date;
  resolvedByUserId: string | null;
  resolvedAt: Date | null;
  resolutionNote: string | null;
}

const MAINTENANCE_LIMITS = { maxReasonLength: 500, maxNoteLength: 1000, defaultLimit: 50, maxLimit: 200 } as const;

const WINDOW_SELECT = {
  id: true,
  deviceId: true,
  status: true,
  reason: true,
  openedByUserId: true,
  openedAt: true,
  resolvedByUserId: true,
  resolvedAt: true,
  resolutionNote: true,
  device: { select: { name: true } },
} as const;

@Injectable()
export class DeviceMaintenanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: RbacAuditService,
  ) {}

  private assertReason(reason: string): string {
    const trimmed = reason?.trim() ?? '';
    if (trimmed.length === 0) {
      throw new DomainBadRequestException(
        ERROR_CODES.BadRequest,
        'A maintenance window needs a reason. "Maintenance" without one is not actionable.',
      );
    }
    if (trimmed.length > MAINTENANCE_LIMITS.maxReasonLength) {
      throw new DomainBadRequestException(
        ERROR_CODES.BadRequest,
        `Reason exceeds ${MAINTENANCE_LIMITS.maxReasonLength} characters.`,
      );
    }
    return trimmed;
  }

  async listForTenant(
    tenantId: string,
    status?: MaintenanceStatus,
    // Annotated explicitly: `limit = 50` would infer the literal type `50` and reject every value a
    // caller computes, which is a type error that reads like the caller being wrong.
    limit: number = MAINTENANCE_LIMITS.defaultLimit,
  ): Promise<{ items: MaintenanceWindowRow[]; total: number }> {
    const safeLimit = Number.isInteger(limit)
      ? Math.min(Math.max(limit, 1), MAINTENANCE_LIMITS.maxLimit)
      : MAINTENANCE_LIMITS.defaultLimit;

    const where = { tenantId, ...(status ? { status } : {}) };

    const [rows, total] = await Promise.all([
      this.prisma.deviceMaintenance.findMany({
        where,
        select: WINDOW_SELECT,
        orderBy: [{ openedAt: 'desc' }, { id: 'asc' }],
        take: safeLimit,
      }),
      this.prisma.deviceMaintenance.count({ where }),
    ]);

    return { items: rows.map((row) => this.present(row)), total };
  }

  async openForDevice(
    input: OpenMaintenanceInput,
    actorMembershipId: string | null,
  ): Promise<MaintenanceWindowRow> {
    const reason = this.assertReason(input.reason);

    // The device is read through a tenant-scoped lookup, not by bare id. Without the tenant in the
    // where clause this would happily open a window on another tenant's device.
    const device = await this.prisma.device.findFirst({
      where: { id: input.deviceId, tenantId: input.tenantId },
      select: { id: true },
    });
    if (!device) {
      throw new DomainNotFoundException(
        ERROR_CODES.DeviceNotFound,
        'Device not found in this tenant.',
      );
    }

    const existing = await this.prisma.deviceMaintenance.findFirst({
      where: { deviceId: input.deviceId, tenantId: input.tenantId, status: MaintenanceStatus.OPEN },
      select: { id: true },
    });
    if (existing) {
      throw new DomainConflictException(
        ERROR_CODES.DeviceMaintenanceConflict,
        'This device already has an open maintenance window. Resolve it before opening another.',
      );
    }

    let created;
    try {
      created = await this.prisma.deviceMaintenance.create({
        data: {
          tenantId: input.tenantId,
          deviceId: input.deviceId,
          reason,
          openedByUserId: input.userId,
          status: MaintenanceStatus.OPEN,
        },
        select: WINDOW_SELECT,
      });
    } catch (error) {
      // Lost the race against a concurrent open. Reported as a conflict, never as a silent success:
      // a second window would mean two technicians each believing they own the device.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new DomainConflictException(
          ERROR_CODES.DeviceMaintenanceConflict,
          'This device already has an open maintenance window.',
        );
      }
      throw error;
    }

    await this.recordAudit(created.id, actorMembershipId, input.tenantId, AuditAction.CREATE,
      'Maintenance window opened. Authorised by tenant membership scope, not by an owner rule: a device may be under maintenance regardless of who owns it.');

    return this.present(created);
  }

  async resolve(
    input: ResolveMaintenanceInput,
    actorMembershipId: string | null,
  ): Promise<MaintenanceWindowRow> {
    const note = input.resolutionNote?.trim() || null;
    if (note && note.length > MAINTENANCE_LIMITS.maxNoteLength) {
      throw new DomainBadRequestException(
        ERROR_CODES.BadRequest,
        `Resolution note exceeds ${MAINTENANCE_LIMITS.maxNoteLength} characters.`,
      );
    }

    const existing = await this.prisma.deviceMaintenance.findFirst({
      where: { id: input.maintenanceId, tenantId: input.tenantId },
      select: { id: true, status: true },
    });
    if (!existing) {
      throw new DomainNotFoundException(
        ERROR_CODES.DeviceMaintenanceNotFound,
        'Maintenance window not found in this tenant.',
      );
    }
    if (existing.status === MaintenanceStatus.RESOLVED) {
      throw new DomainConflictException(
        ERROR_CODES.DeviceMaintenanceConflict,
        'This maintenance window is already resolved.',
      );
    }

    // Conditional on the row still being OPEN. A plain update here would let a late write re-open a
    // window that someone else closed between the read above and this write.
    const closed = await this.prisma.deviceMaintenance.updateMany({
      where: {
        id: input.maintenanceId,
        tenantId: input.tenantId,
        status: MaintenanceStatus.OPEN,
      },
      data: {
        status: MaintenanceStatus.RESOLVED,
        resolvedByUserId: input.userId,
        resolvedAt: new Date(),
        resolutionNote: note,
      },
    });
    if (closed.count !== 1) {
      throw new DomainConflictException(
        ERROR_CODES.DeviceMaintenanceConflict,
        'This maintenance window was resolved by someone else first.',
      );
    }

    const updated = await this.prisma.deviceMaintenance.findFirst({
      where: { id: input.maintenanceId, tenantId: input.tenantId },
      select: WINDOW_SELECT,
    });
    if (!updated) {
      throw new DomainNotFoundException(
        ERROR_CODES.DeviceMaintenanceNotFound,
        'Maintenance window vanished mid-resolution.',
      );
    }

    await this.recordAudit(updated.id, actorMembershipId, input.tenantId, AuditAction.UPDATE,
      'Maintenance window resolved. Authorised by tenant membership scope, not by an owner rule.');

    return this.present(updated);
  }

  private async recordAudit(
    resourceId: string,
    actorMembershipId: string | null,
    tenantId: string,
    action: AuditAction,
    detail: string,
  ): Promise<void> {
    if (!actorMembershipId) return;
    await this.audit.recordMutation({
      tenantId,
      membershipId: actorMembershipId,
      resourceType: 'device_maintenance',
      resourceId,
      action,
      // Keep the audit detail explicit about the concrete authorization path; this service is
      // called behind AdminRoleGuard rather than the permission/ownership resolver.
      detail,
    });
  }

  private present(row: {
    id: string;
    deviceId: string;
    status: MaintenanceStatus;
    reason: string;
    openedByUserId: string;
    openedAt: Date;
    resolvedByUserId: string | null;
    resolvedAt: Date | null;
    resolutionNote: string | null;
    device: { name: string };
  }): MaintenanceWindowRow {
    return {
      id: row.id,
      deviceId: row.deviceId,
      deviceName: row.device?.name ?? null,
      status: row.status,
      reason: row.reason,
      openedByUserId: row.openedByUserId,
      openedAt: row.openedAt,
      resolvedByUserId: row.resolvedByUserId,
      resolvedAt: row.resolvedAt,
      resolutionNote: row.resolutionNote,
    };
  }
}