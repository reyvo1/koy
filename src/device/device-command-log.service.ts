import { Injectable } from '@nestjs/common';
import { CommandStatus } from '@prisma/client';

import { DomainNotFoundException } from '../common/errors/domain-exceptions';
import { ERROR_CODES } from '../common/errors/error-code';
import { PrismaService } from '../prisma/prisma.service';

/**
 * The technician's device log.
 *
 * ## What this is, and what it is not
 *
 * This is **what the platform sent to a device and what came back** — the `DeviceCommand` history,
 * read through the same tenant scope every other device read uses. It is not telemetry: telemetry is
 * what the device reported on its own initiative, and it already has a surface. Folding the two
 * together would produce a "device log" in which the platform's outbound commands and the device's
 * own observations are indistinguishable, and a technician would read intent where there was only
 * data.
 *
 * ## Why it was worth building
 *
 * Until now the technician page's log tab said no endpoint existed and pointed at Realtime. That was
 * true, and it left the most common question unanswered: not "what is this device reporting" but
 * "what did we just tell it to do, and did it comply".
 *
 * ## The settled flag
 *
 * `status` alone is not enough. A row can carry an old status alongside a fresher
 * `acknowledgedAt`, and a label that lags the timestamp is how a row ends up displayed as merely
 * "sent" after the device already confirmed it. {@link CommandLogRow.settled} is derived from the
 * timestamp, and the two are reported side by side so a disagreement is visible rather than resolved
 * silently in the label's favour.
 */

export const COMMAND_LOG_LIMITS = { defaultLimit: 50, maxLimit: 200 } as const;

export interface CommandLogRow {
  id: string;
  correlationId: string;
  deviceId: string;
  capabilityKey: string;
  status: CommandStatus;
  /** True once the device acknowledged, regardless of what `status` still says. */
  settled: boolean;
  sentAt: Date | null;
  acknowledgedAt: Date | null;
  createdAt: Date;
  /** Milliseconds from creation to acknowledgement, or null when it has not been acknowledged. */
  roundTripMs: number | null;
}

export interface CommandLogPage {
  items: CommandLogRow[];
  total: number;
  /** Rows returned, which is not the same number as `total`. */
  returned: number;
}

const COMMAND_LOG_SELECT = {
  id: true,
  correlationId: true,
  deviceId: true,
  status: true,
  sentAt: true,
  acknowledgedAt: true,
  createdAt: true,
  payload: true,
} as const;

@Injectable()
export class DeviceCommandLogService {
  constructor(private readonly prisma: PrismaService) {}

  async listForDevice(
    tenantId: string,
    deviceId: string,
    limit: number = COMMAND_LOG_LIMITS.defaultLimit,
  ): Promise<CommandLogPage> {
    const safeLimit = Number.isInteger(limit)
      ? Math.min(Math.max(limit, 1), COMMAND_LOG_LIMITS.maxLimit)
      : COMMAND_LOG_LIMITS.defaultLimit;

    // The device is read through a tenant-scoped lookup. Without the tenant here this would happily
    // return another tenant's command history for a guessed device id.
    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, tenantId },
      select: { id: true },
    });
    if (!device) {
      throw new DomainNotFoundException(
        ERROR_CODES.DeviceNotFound,
        'Device not found in this tenant.',
      );
    }

    // Both clauses are load-bearing. `tenantId` alone would leak another tenant's commands for a
    // device id that happened to collide; `deviceId` alone would leak across tenants entirely.
    //
    // Multi-line on purpose. As a one-line `const where = { deviceId, tenantId }` it compiled and
    // behaved correctly, but dropping `tenantId` from that line passed *both* this contract and
    // `tenant-isolation-at-query-layer.contract.spec.ts` -- the tenant guard scans for the clause
    // at the call site, and a single-line literal reads as one token to it. Same object, same
    // behaviour, and invisible to the check that exists to catch exactly this.
    const where = {
      deviceId,
      tenantId,
    };

    const [rows, total] = await Promise.all([
      this.prisma.deviceCommand.findMany({
        where,
        select: COMMAND_LOG_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: safeLimit,
      }),
      this.prisma.deviceCommand.count({ where }),
    ]);

    const items = rows.map((row) => this.present(row));
    return { items, total, returned: items.length };
  }

  private present(row: {
    id: string;
    correlationId: string;
    deviceId: string;
    status: CommandStatus;
    sentAt: Date | null;
    acknowledgedAt: Date | null;
    createdAt: Date;
    payload: unknown;
  }): CommandLogRow {
    const payload = (row.payload ?? {}) as Record<string, unknown>;
    const capabilityKey =
      typeof payload.capabilityKey === 'string' ? payload.capabilityKey : 'unknown';

    const settled = row.acknowledgedAt !== null;
    const roundTripMs = settled
      ? row.acknowledgedAt!.getTime() - row.createdAt.getTime()
      : null;

    return {
      id: row.id,
      correlationId: row.correlationId,
      deviceId: row.deviceId,
      capabilityKey,
      status: row.status,
      settled,
      sentAt: row.sentAt,
      acknowledgedAt: row.acknowledgedAt,
      createdAt: row.createdAt,
      // A negative round trip would mean the acknowledgement predates its own command, which is
      // worth showing rather than clamping — it is a clock or ordering fault, not a fast device.
      roundTripMs,
    };
  }
}