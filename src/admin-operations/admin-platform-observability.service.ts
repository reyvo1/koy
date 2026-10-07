import { Injectable } from '@nestjs/common';
import { AnalyticsSeverity, CommandStatus, Prisma } from '@prisma/client';
import { ERROR_CODES } from '../common/errors/error-code';
import {
  DomainBadRequestException,
  DomainNotFoundException,
} from '../common/errors/domain-exceptions';
import { PrismaService } from '../prisma/prisma.service';

const MAX_DIRECTORY_TAKE = 200;
const MAX_COMMAND_TAKE = 250;
const MAX_TELEMETRY_SCAN = 500;
const MAX_TELEMETRY_RETURN = 250;
const MAX_REPORT_HOURS = 24 * 31;

export interface PlatformCommandQuery {
  tenantId?: string;
  deviceId?: string;
  status?: string;
  limit?: string;
}

export interface PlatformTelemetryQuery {
  deviceId?: string;
  capability?: string;
  from?: string;
  to?: string;
  limit?: string;
}

@Injectable()
export class AdminPlatformObservabilityService {
  constructor(private readonly prisma: PrismaService) {}

  async deviceLocations() {
    // Deduplicate in SQL before applying the cap, avoiding Prisma's in-memory distinct.
    const rows = await this.prisma.$queryRaw<Array<{ id: string; deviceId: string; latitude: number; longitude: number; label: string | null; recordedAt: Date; deviceName: string; tenantName: string }>>`
      SELECT l.id, l."deviceId", l.latitude, l.longitude, l.label, l."recordedAt", d.name AS "deviceName", t.name AS "tenantName"
      FROM (SELECT DISTINCT ON ("deviceId") * FROM device_locations ORDER BY "deviceId", "recordedAt" DESC, id DESC) l
      JOIN devices d ON d.id = l."deviceId" AND d."tenantId" = l."tenantId"
      JOIN tenants t ON t.id = d."tenantId"
      ORDER BY l."deviceId" LIMIT 201
    `;
    return { truncated: rows.length > 200, limit: 200, items: rows.slice(0, 200) };
  }

  async listDeviceGroups(tenantId?: string) {
    const groups = await this.prisma.deviceGroup.findMany({
      where: tenantId ? { tenantId } : undefined,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: MAX_DIRECTORY_TAKE,
      select: {
        id: true,
        tenantId: true,
        name: true,
        description: true,
        createdAt: true,
        updatedAt: true,
        tenant: { select: { name: true } },
        _count: { select: { members: true } },
        members: {
          take: 6,
          orderBy: { deviceId: 'asc' },
          select: {
            device: {
              select: { id: true, name: true, status: true, type: true },
            },
          },
        },
      },
    });

    return {
      total: groups.length,
      bounded: groups.length === MAX_DIRECTORY_TAKE,
      items: groups.map((group) => ({
        id: group.id,
        tenantId: group.tenantId,
        tenantName: group.tenant.name,
        name: group.name,
        description: group.description,
        memberCount: group._count.members,
        memberPreview: group.members.map(({ device }) => device),
        createdAt: group.createdAt.toISOString(),
        updatedAt: group.updatedAt.toISOString(),
      })),
      mutationContract: 'TENANT_SCOPED_ONLY' as const,
    };
  }

  async listDeviceCredentials(tenantId?: string) {
    const devices = await this.prisma.device.findMany({
      where: {
        ...(tenantId ? { tenantId } : {}),
        credential: { isNot: null },
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: MAX_DIRECTORY_TAKE,
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
        tenantId: true,
        tenant: { select: { name: true } },
        credential: {
          select: { id: true, createdAt: true, updatedAt: true },
        },
      },
    });

    return {
      total: devices.length,
      bounded: devices.length === MAX_DIRECTORY_TAKE,
      items: devices.map((device) => ({
        deviceId: device.id,
        deviceName: device.name,
        deviceType: device.type,
        deviceStatus: device.status,
        tenantId: device.tenantId,
        tenantName: device.tenant.name,
        credentialId: device.credential?.id ?? null,
        credentialPresent: Boolean(device.credential),
        createdAt: device.credential?.createdAt.toISOString() ?? null,
        rotatedAt: device.credential?.updatedAt.toISOString() ?? null,
      })),
      secretMaterialExposed: false,
    };
  }

  async listCommands(query: PlatformCommandQuery) {
    const limit = this.parseLimit(query.limit, 100, MAX_COMMAND_TAKE);
    const status = this.parseCommandStatus(query.status);

    const rows = await this.prisma.deviceCommand.findMany({
      where: {
        ...(query.tenantId ? { tenantId: query.tenantId } : {}),
        ...(query.deviceId ? { deviceId: query.deviceId } : {}),
        ...(status ? { status } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      select: {
        id: true,
        correlationId: true,
        idempotencyKey: true,
        tenantId: true,
        deviceId: true,
        payload: true,
        status: true,
        createdAt: true,
        sentAt: true,
        acknowledgedAt: true,
        updatedAt: true,
        tenant: { select: { name: true } },
        device: { select: { name: true, status: true } },
      },
    });

    return {
      total: rows.length,
      bounded: rows.length === limit,
      sendCommandEnabled: false,
      items: rows.map((row) => ({
        id: row.id,
        correlationId: row.correlationId,
        idempotencyKeyPresent: Boolean(row.idempotencyKey),
        tenantId: row.tenantId,
        tenantName: row.tenant.name,
        deviceId: row.deviceId,
        deviceName: row.device.name,
        deviceStatus: row.device.status,
        payload: row.payload,
        status: row.status,
        createdAt: row.createdAt.toISOString(),
        sentAt: row.sentAt?.toISOString() ?? null,
        acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
        updatedAt: row.updatedAt.toISOString(),
      })),
    };
  }

  async exploreTelemetry(query: PlatformTelemetryQuery) {
    const deviceId = query.deviceId?.trim();
    if (!deviceId) {
      throw new DomainBadRequestException(
        ERROR_CODES.TelemetryHistoryQueryInvalid,
        'deviceId is required',
      );
    }

    const device = await this.prisma.device.findUnique({
      where: { id: deviceId },
      select: { id: true, name: true, tenantId: true, tenant: { select: { name: true } } },
    });
    if (!device) {
      throw new DomainNotFoundException(ERROR_CODES.DeviceNotFound, 'Device not found');
    }

    const from = this.parseOptionalDate(query.from, 'from');
    const to = this.parseOptionalDate(query.to, 'to');
    if (from && to && from.getTime() > to.getTime()) {
      throw new DomainBadRequestException(
        ERROR_CODES.TelemetryHistoryQueryInvalid,
        '`from` must be before `to`',
      );
    }

    const limit = this.parseLimit(query.limit, 100, MAX_TELEMETRY_RETURN);
    const capability = query.capability?.trim() || undefined;
    if (capability) {
      const registered = await this.prisma.capability.findUnique({
        where: { deviceId_key: { deviceId, key: capability } },
        select: { id: true, key: true, dataType: true, unit: true },
      });
      if (!registered) {
        throw new DomainBadRequestException(
          ERROR_CODES.CapabilityNotDefined,
          `Capability ${capability} is not registered for this device`,
        );
      }
    }

    const rows = await this.prisma.telemetry.findMany({
      where: {
        tenantId: device.tenantId,
        deviceId,
        ...(from || to
          ? {
              createdAt: {
                ...(from ? { gte: from } : {}),
                ...(to ? { lte: to } : {}),
              },
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: capability ? MAX_TELEMETRY_SCAN : limit,
      select: { id: true, eventId: true, payload: true, createdAt: true },
    });

    const items = rows
      .map((row) => {
        const payload = this.asRecord(row.payload);
        if (capability && !Object.prototype.hasOwnProperty.call(payload, capability)) {
          return null;
        }
        return {
          id: row.id,
          eventId: row.eventId,
          createdAt: row.createdAt.toISOString(),
          payload,
          capability: capability ?? null,
          value: capability ? payload[capability] : null,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null)
      .slice(0, limit);

    return {
      device: {
        id: device.id,
        name: device.name,
        tenantId: device.tenantId,
        tenantName: device.tenant.name,
      },
      capability: capability ?? null,
      total: items.length,
      bounded: rows.length >= (capability ? MAX_TELEMETRY_SCAN : limit),
      items,
    };
  }

  async getTenantSummaryReport(hoursRaw?: string) {
    const hours = this.parseLimit(hoursRaw, 24, MAX_REPORT_HOURS);
    const from = new Date(Date.now() - hours * 60 * 60 * 1000);

    const [tenants, commands, telemetry, findings, credentialedDevices] =
      await Promise.all([
        this.prisma.tenant.findMany({
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          take: MAX_DIRECTORY_TAKE,
          select: {
            id: true,
            name: true,
            _count: { select: { users: true, devices: true, deviceGroups: true } },
          },
        }),
        this.prisma.deviceCommand.groupBy({
          by: ['tenantId', 'status'],
          where: { createdAt: { gte: from } },
          _count: { _all: true },
        }),
        this.prisma.telemetry.groupBy({
          by: ['tenantId'],
          where: { createdAt: { gte: from } },
          _count: { _all: true },
        }),
        this.prisma.analyticsFinding.groupBy({
          by: ['tenantId', 'severity'],
          where: {
            createdAt: { gte: from },
            severity: { in: [AnalyticsSeverity.WARNING, AnalyticsSeverity.CRITICAL] },
          },
          _count: { _all: true },
        }),
        this.prisma.device.groupBy({
          by: ['tenantId'],
          where: { credential: { isNot: null } },
          _count: { _all: true },
        }),
      ]);

    const commandMap = new Map<string, Record<string, number>>();
    for (const row of commands) {
      const current = commandMap.get(row.tenantId) ?? {};
      current[row.status] = row._count._all;
      commandMap.set(row.tenantId, current);
    }
    const telemetryMap = new Map(telemetry.map((row) => [row.tenantId, row._count._all]));
    const credentialMap = new Map(
      credentialedDevices.map((row) => [row.tenantId, row._count._all]),
    );
    const findingMap = new Map<string, { warning: number; critical: number }>();
    for (const row of findings) {
      const current = findingMap.get(row.tenantId) ?? { warning: 0, critical: 0 };
      if (row.severity === AnalyticsSeverity.CRITICAL) current.critical += row._count._all;
      if (row.severity === AnalyticsSeverity.WARNING) current.warning += row._count._all;
      findingMap.set(row.tenantId, current);
    }

    return {
      generatedAt: new Date().toISOString(),
      from: from.toISOString(),
      hours,
      total: tenants.length,
      bounded: tenants.length === MAX_DIRECTORY_TAKE,
      items: tenants.map((tenant) => {
        const commandCounts = commandMap.get(tenant.id) ?? {};
        const findingCounts = findingMap.get(tenant.id) ?? { warning: 0, critical: 0 };
        return {
          tenantId: tenant.id,
          tenantName: tenant.name,
          users: tenant._count.users,
          devices: tenant._count.devices,
          deviceGroups: tenant._count.deviceGroups,
          credentialedDevices: credentialMap.get(tenant.id) ?? 0,
          telemetryEvents: telemetryMap.get(tenant.id) ?? 0,
          commands: {
            pending: commandCounts[CommandStatus.PENDING] ?? 0,
            sent: commandCounts[CommandStatus.SENT] ?? 0,
            acknowledged: commandCounts[CommandStatus.ACKNOWLEDGED] ?? 0,
            failed: commandCounts[CommandStatus.FAILED] ?? 0,
            timedOut: commandCounts[CommandStatus.TIMED_OUT] ?? 0,
          },
          analytics: findingCounts,
        };
      }),
    };
  }

  private parseCommandStatus(raw?: string): CommandStatus | undefined {
    const normalized = raw?.trim().toUpperCase();
    if (!normalized) return undefined;
    if (!Object.values(CommandStatus).includes(normalized as CommandStatus)) {
      throw new DomainBadRequestException(ERROR_CODES.BadRequest, 'Invalid command status');
    }
    return normalized as CommandStatus;
  }

  private parseOptionalDate(raw: string | undefined, field: string): Date | undefined {
    const normalized = raw?.trim();
    if (!normalized) return undefined;
    const value = new Date(normalized);
    if (Number.isNaN(value.getTime())) {
      throw new DomainBadRequestException(
        ERROR_CODES.TelemetryHistoryQueryInvalid,
        `Invalid ${field} timestamp`,
      );
    }
    return value;
  }

  private parseLimit(raw: string | undefined, fallback: number, max: number): number {
    if (!raw?.trim()) return fallback;
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      throw new DomainBadRequestException(ERROR_CODES.BadRequest, 'Invalid limit/range');
    }
    return Math.min(parsed, max);
  }

  private asRecord(value: Prisma.JsonValue): Record<string, Prisma.JsonValue> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return value as Record<string, Prisma.JsonValue>;
  }
}
