import { Injectable, Logger } from '@nestjs/common';
import { DeviceTwinVerdict, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Wave 12 — the digital twin as reconciliation (ADR-011).
 *
 * This is not a simulation of the asset. It is a dated comparison of what the platform believes about a
 * device against what the device last actually reported, and it is allowed to say "I do not know".
 *
 * That last part is the whole slice. `Device` already caches `status`, `lastHeartbeatAt`, `healthScore` and
 * `riskBand`, all of which go stale silently. A dashboard that reads a cached `ONLINE` from four days ago
 * shows a confident falsehood. So a snapshot carries `observedAt` — when the DEVICE reported — and the
 * verdict becomes STALE once that observation is past the horizon, regardless of what the value says.
 *
 * UNKNOWN is equally load-bearing: a device that has never reported leaves observed status and payload null.
 * There is no default reading to fall back on, because a fallback would be a fabricated observation.
 */
@Injectable()
export class DeviceTwinService {
  private readonly log = new Logger(DeviceTwinService.name);

  /**
   * How long an observation stays current. Past this, the twin reports STALE rather than repeating a value
   * nobody has confirmed.
   */
  static readonly DEFAULT_HORIZON_MINUTES = 15;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Reconcile what the platform believes against what the device last reported, and store the snapshot.
   *
   * `now` is supplied so a snapshot is reproducible and so a test can state "four days stale" rather than
   * "some time during the run".
   */
  async reconcile(options: {
    tenantId: string;
    deviceId: string;
    /** What the platform believes should be true. Null when nothing has been declared. */
    desiredStatus?: string | null;
    horizonMinutes?: number;
    now?: Date;
  }): Promise<TwinSnapshot> {
    if (!options.tenantId) {
      throw new RangeError('tenantId is required: a twin must never be reconciled unscoped');
    }
    if (!options.deviceId) {
      throw new RangeError('deviceId is required: a twin needs a device');
    }

    const now = options.now ?? new Date();
    const horizonMinutes = options.horizonMinutes ?? DeviceTwinService.DEFAULT_HORIZON_MINUTES;

    // Tenant-scoped: a twin cannot be reconciled for a device the caller does not own.
    const device = await this.prisma.device.findFirst({
      where: { id: options.deviceId, tenantId: options.tenantId },
      select: { id: true, status: true },
    });
    if (!device) {
      throw new RangeError(`device ${options.deviceId} does not exist in this tenant`);
    }

    // The most recent thing the device actually reported. observedAt comes from the row itself, not from
    // the clock: it is when the device reported, which is the only honest answer to "how fresh is this".
    const latest = await this.prisma.telemetry.findFirst({
      where: { deviceId: options.deviceId, tenantId: options.tenantId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { createdAt: true, payload: true },
    });

    const observedAt = latest?.createdAt ?? null;
    const observedPayload = (latest?.payload as Prisma.JsonValue | undefined) ?? null;

    const desired = options.desiredStatus ?? device.status;

      // The observed status is what the device REPORTED, never a copy of what we want it to be. A payload
    // without a status field means the device did not tell us its status, so there is nothing to compare --
    // inventing one from `desired` would make divergence undetectable by construction.
    const reportedStatus = readReportedStatus(observedPayload);

    const verdict = this.verdictFor({
      observedAt,
      reportedStatus,
      desiredStatus: desired,
      now,
      horizonMinutes,
    });

    const snapshot = await this.prisma.deviceTwinSnapshot.create({
      data: {
        tenantId: options.tenantId,
        deviceId: options.deviceId,
        twinVersion: await this.nextVersion(options.tenantId, options.deviceId),
        desiredStatus: desired,
        // Null stays null. There is no default reading to invent for a device that never reported.
        observedStatus: reportedStatus,
        observedPayload,
        observedAt,
        verdict: verdict.verdict,
        divergenceReason: verdict.reason,
      },
      select: {
        id: true,
        deviceId: true,
        twinVersion: true,
        desiredStatus: true,
        observedStatus: true,
        observedPayload: true,
        observedAt: true,
        verdict: true,
        divergenceReason: true,
      },
    });

    this.log.log(
      `twin v${snapshot.twinVersion} for ${options.deviceId}: ${verdict.verdict}${
        verdict.reason ? ` (${verdict.reason})` : ''
      }`,
    );

    return snapshot;
  }

  /**
   * Decide the verdict. Pure, so the rules are testable without a database.
   *
   * Order matters and is deliberate:
   *
   * - Never reported beats everything. There is nothing to compare, so no verdict about agreement is possible.
   * - Stale is checked BEFORE agreement, and reports STALE even when the value happens to match. "It agrees,
   *   as of eight days ago" is a different claim from "it agrees", and only the second one is useful.
   * - Divergence needs a reported status. If the device sent data but no status field, we know it is alive and
   *   we know nothing about its state, so the verdict is UNKNOWN rather than a guess.
   */
  private verdictFor(input: {
    observedAt: Date | null;
    reportedStatus: string | null;
    desiredStatus: string;
    now: Date;
    horizonMinutes: number;
  }): { verdict: DeviceTwinVerdict; reason: string | null } {
    if (!input.observedAt) {
      return {
        verdict: DeviceTwinVerdict.UNKNOWN,
        reason: 'this device did not report any observation yet, so nothing is known about it',
      };
    }

    const ageMs = input.now.getTime() - input.observedAt.getTime();
    if (ageMs > input.horizonMinutes * 60_000) {
      const ageMinutes = Math.floor(ageMs / 60_000);
      return {
        verdict: DeviceTwinVerdict.STALE,
        reason: `the last observation is ${ageMinutes} minutes old, past the ${input.horizonMinutes} minute horizon`,
      };
    }

    if (input.reportedStatus === null) {
      return {
        verdict: DeviceTwinVerdict.UNKNOWN,
        reason: 'this device reported data but no status, so its state cannot be compared to what we expect',
      };
    }

    if (input.reportedStatus !== input.desiredStatus) {
      return {
        verdict: DeviceTwinVerdict.DIVERGENT,
        reason: `the device reports ${input.reportedStatus} but ${input.desiredStatus} is expected`,
      };
    }

    return { verdict: DeviceTwinVerdict.ALIGNED, reason: null };
  }

  private async nextVersion(tenantId: string, deviceId: string): Promise<number> {
    const latest = await this.prisma.deviceTwinSnapshot.findFirst({
      where: { deviceId, tenantId },
      orderBy: { twinVersion: 'desc' },
      take: 1,
      select: { twinVersion: true },
    });
    return (latest?.twinVersion ?? 0) + 1;
  }

  /** A device's twin history, newest first, bounded. */
  async history(options: { tenantId: string; deviceId: string; limit?: number }): Promise<TwinSnapshot[]> {
    if (!options.tenantId) {
      throw new RangeError('tenantId is required: twin history must never be read unscoped');
    }
    if (!options.deviceId) {
      throw new RangeError('deviceId is required: twin history needs a device');
    }

    return this.prisma.deviceTwinSnapshot.findMany({
      where: { deviceId: options.deviceId, tenantId: options.tenantId },
      orderBy: { twinVersion: 'desc' },
      take: options.limit ?? 50,
      select: {
        id: true,
        deviceId: true,
        twinVersion: true,
        desiredStatus: true,
        observedStatus: true,
        observedPayload: true,
        observedAt: true,
        verdict: true,
        divergenceReason: true,
      },
    });
  }
}

export interface TwinSnapshot {
  id: string;
  deviceId: string;
  twinVersion: number;
  desiredStatus: string | null;
  observedStatus: string | null;
  /** The raw reading behind the verdict, so an operator can check the judgement rather than trust it. */
  observedPayload: Prisma.JsonValue | null;
  observedAt: Date | null;
  verdict: DeviceTwinVerdict;
  divergenceReason: string | null;
}

/**
 * Pull the status a device reported out of its payload.
 *
 * Returns null when there is none, and never falls back to the desired status. Copying `desired` in here
 * would make every device look ALIGNED by construction and divergence would be unreachable -- the one thing
 * a twin exists to detect.
 */
export function readReportedStatus(payload: Prisma.JsonValue | null | undefined): string | null {
  if (payload === null || payload === undefined) return null;
  if (typeof payload !== 'object' || Array.isArray(payload)) return null;
  const status = (payload as Record<string, unknown>).status;
  return typeof status === 'string' && status.trim() ? status.trim() : null;
}