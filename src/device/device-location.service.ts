import { Injectable } from '@nestjs/common';

import { ERROR_CODES } from '../common/errors/error-code';
import {
  DomainBadRequestException,
  DomainNotFoundException,
} from '../common/errors/domain-exceptions';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Device location: the GPS half of Wave 9.
 *
 * ## Why this is append-only
 *
 * ADR-004 stored one row per device and overwrote it on every fix. That answers "where is it now"
 * and nothing else, and in a NOC the question that matters is usually the other one: where was this
 * device when it went offline. An overwritten position answers that confidently and wrongly, which is
 * worse than not answering. So each fix is a row and `latest` is a query, not a stored truth.
 *
 * ## Why the device is looked up before anything is written
 *
 * The table now carries `tenantId`, but a caller could still name a `deviceId` belonging to another
 * tenant. Writing would plant a coordinate in that tenant's history — permanently, because this is
 * append-only. So the device is resolved through a tenant-scoped lookup first, and the tenant that
 * comes back from that lookup is the one written, not the one the caller supplied.
 *
 * ## Why coordinates are range-checked
 *
 * `NaN` passes every naive `>= -90 && <= 90` comparison, because every comparison with `NaN` is
 * false and the negation is therefore true. A `NaN` latitude then renders as a broken map pin and a
 * stored history row nobody can interpret. `Number.isFinite` is the check, and it comes first.
 *
 * ## Why 0,0 is a position
 *
 * `0,0` is in the Gulf of Guinea and is a legitimate fix. Treating it as "no data" would silently
 * drop a device that is genuinely there — so "never reported" is `null`, never a sentinel coordinate.
 */

export const DEVICE_LOCATION_LIMITS = { defaultHistoryLimit: 50, maxHistoryLimit: 200 } as const;

export interface LocationFix {
  id: string;
  deviceId: string;
  latitude: number;
  longitude: number;
  label: string | null;
  /** When the fix arrived, per the device, not per this row's creation. */
  recordedAt: Date;
}

export interface LocationHistory {
  /** The most recent fix, or null when the device has never reported one. */
  latest: LocationFix | null;
  items: LocationFix[];
  total: number;
}

@Injectable()
export class DeviceLocationService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Record a fix for a device in this tenant.
   *
   * `recordedAt` comes from the caller rather than being stamped here. A device that buffered fixes
   * while offline reports them late, and a server-side `now()` would place all of them at the moment
   * of reconnect — losing the ordering that makes the history worth keeping.
   */
  async recordFix(input: {
    tenantId: string;
    deviceId: string;
    latitude: number;
    longitude: number;
    label?: string | null;
    recordedAt?: Date;
  }): Promise<LocationFix> {
    if (!Number.isFinite(input.latitude) || !Number.isFinite(input.longitude)) {
      throw new DomainBadRequestException(
        ERROR_CODES.BadRequest,
        'latitude dan longitude harus angka finite.',
      );
    }
    if (input.latitude < -90 || input.latitude > 90) {
      throw new DomainBadRequestException(
        ERROR_CODES.BadRequest,
        'latitude harus antara -90 dan 90.',
      );
    }
    if (input.longitude < -180 || input.longitude > 180) {
      throw new DomainBadRequestException(
        ERROR_CODES.BadRequest,
        'longitude harus antara -180 dan 180.',
      );
    }

    if (input.label != null && (typeof input.label !== 'string' || input.label.length > 120)) throw new DomainBadRequestException(ERROR_CODES.BadRequest, 'Label lokasi maksimal 120 karakter.');
    if (input.recordedAt && !Number.isFinite(input.recordedAt.getTime())) throw new DomainBadRequestException(ERROR_CODES.BadRequest, 'Waktu lokasi tidak valid.');

    // Provenance before the write, and the tenant recorded is the one that came back from the
    // lookup rather than the one supplied. Without this, a caller could write into another tenant's
    // permanent history by naming their device id.
    const device = await this.prisma.device.findFirst({
      where: { id: input.deviceId, tenantId: input.tenantId },
      select: { id: true },
    });
    if (!device) {
      throw new DomainNotFoundException(
        ERROR_CODES.DeviceNotFound,
        'Device tidak ditemukan pada tenant ini.',
      );
    }

    const row = await this.prisma.deviceLocation.create({
      data: {
        tenantId: input.tenantId,
        deviceId: device.id,
        latitude: input.latitude,
        longitude: input.longitude,
        label: input.label ?? null,
        recordedAt: input.recordedAt ?? new Date(),
      },
    });

    return this.present(row);
  }

  /**
   * Latest fix and history for one device.
   *
   * Two separate reads because they answer different questions and have different costs: `latest` is
   * one row, `history` is bounded. `latest` being null means the device has never reported — which is
   * a real answer, distinct from a device reporting 0,0.
   */
  async historyFor(input: {
    tenantId: string;
    deviceId: string;
    limit?: number;
  }): Promise<LocationHistory> {
    const requested = input.limit ?? DEVICE_LOCATION_LIMITS.defaultHistoryLimit;
    const safeLimit = Number.isInteger(requested)
      ? Math.min(Math.max(requested, 1), DEVICE_LOCATION_LIMITS.maxHistoryLimit)
      : DEVICE_LOCATION_LIMITS.defaultHistoryLimit;

    // Both clauses load-bearing, as always: `tenantId` alone leaks other tenants' devices, `deviceId`
    // alone leaks across tenants entirely.
    const where = {
      tenantId: input.tenantId,
      deviceId: input.deviceId,
    };

    const [latest, rows, total] = await Promise.all([
      this.prisma.deviceLocation.findFirst({
        where,
        orderBy: [{ recordedAt: 'desc' }, { id: 'asc' }],
      }),
      this.prisma.deviceLocation.findMany({
        where,
        orderBy: [{ recordedAt: 'desc' }, { id: 'asc' }],
        take: safeLimit,
      }),
      this.prisma.deviceLocation.count({ where }),
    ]);

    const items = rows.map((row) => this.present(row));
    return {
      latest: latest ? this.present(latest) : null,
      items,
      total,
    };
  }

  /**
   * Latest fix for every device in a tenant, for the map.
   *
   * One row per device, so this has to be a per-device latest rather than a plain page: a plain page
   * of a history table would show three pins for one device and none for another, and a map that does
   * that is not a map.
   */
  async latestForTenant(tenantId: string): Promise<LocationFix[]> {
    const rows = await this.prisma.deviceLocation.findMany({
      where: { tenantId },
      distinct: ['deviceId'],
      orderBy: [{ deviceId: 'asc' }, { recordedAt: 'desc' }],
    });
    return rows.map((row) => this.present(row));
  }

  private present(row: {
    id: string;
    deviceId: string;
    latitude: number;
    longitude: number;
    label: string | null;
    recordedAt: Date;
  }): LocationFix {
    return {
      id: row.id,
      deviceId: row.deviceId,
      latitude: row.latitude,
      longitude: row.longitude,
      label: row.label,
      recordedAt: row.recordedAt,
    };
  }
}