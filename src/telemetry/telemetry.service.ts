import { Injectable, Logger, Optional } from '@nestjs/common';
import { ERROR_CODES } from '../common/errors/error-code';
import {
  DomainBadRequestException,
  DomainNotFoundException,
  DomainUnauthorizedException,
} from '../common/errors/domain-exceptions';
import { DeviceStatus, Prisma } from '@prisma/client';
import { toStructuredLogError } from '../common/logging/log-error';
import {
  AutomationTelemetryCapabilityReport,
  AutomationTelemetryCoordinationEnvelope,
} from '../automation/automation-telemetry-coordination.types';
import { AutomationTelemetryCoordinator } from '../automation/automation-telemetry-coordinator';
import { isAutomationRuntimeEnabled } from '../automation/automation-runtime-policy';
import { CapabilityValidator } from '../device/capability.validator';
import { MetricsService } from '../metrics/metrics.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TelemetryService {
  private readonly logger = new Logger(TelemetryService.name);
  private readonly MAX_PAYLOAD_DEPTH = 10;
  private readonly MAX_PAYLOAD_KEYS = 100;
  private readonly MAX_PAYLOAD_SIZE = 32 * 1024;
  /**
   * Slice 11.13 — automation coordination hook. Defaults to disabled; enabling
   * requires the explicit AUTOMATION_RUNTIME_ENABLED=true environment flag AND
   * a separately approved activation checkpoint.
   */
  private readonly automationRuntimeEnabled =
    isAutomationRuntimeEnabled();
  /**
   * Per-device capabilityKey -> capabilityId map used to build valid automation
   * coordination envelopes. Bounded so a large fleet cannot grow it without limit.
   */
  private readonly capabilityIdCache = new Map<string, Map<string, string>>();
  private readonly CAPABILITY_CACHE_LIMIT = 10_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly capabilityValidator: CapabilityValidator,
    @Optional() private readonly metrics?: MetricsService,
    @Optional() private readonly automationCoordinator?: AutomationTelemetryCoordinator,
  ) {}

  async ingest(
    tenantId: string,
    deviceId: string,
    eventId: string,
    payload: any,
  ) {
    if (
      !payload ||
      typeof payload !== 'object' ||
      Array.isArray(payload) ||
      Object.keys(payload).length === 0
    ) {
      this.logRejectedPayload('invalid_payload', tenantId, deviceId, eventId);
      throw new DomainBadRequestException(
        ERROR_CODES.TelemetryPayloadInvalid,
        'Invalid payload',
      );
    }

    const normalizedEventId = eventId?.trim();

    if (!normalizedEventId) {
      this.logRejectedPayload('missing_event_id', tenantId, deviceId, eventId);
      throw new DomainBadRequestException(
        ERROR_CODES.TelemetryEventIdRequired,
        'Missing eventId',
      );
    }

    if (!this.isValidJsonValue(payload)) {
      this.logRejectedPayload('invalid_payload', tenantId, deviceId, eventId);
      throw new DomainBadRequestException(
        ERROR_CODES.TelemetryPayloadInvalid,
        'Invalid payload',
      );
    }

    if (!this.isWithinPayloadSize(payload)) {
      this.logRejectedPayload('payload_too_large', tenantId, deviceId, eventId);
      throw new DomainBadRequestException(
        ERROR_CODES.TelemetryPayloadTooLarge,
        'Payload too large',
      );
    }

    const device = await this.prisma.device.findFirst({
      where: {
        id: deviceId,
        tenantId,
      },
      include: {
        capabilities: true,
      },
    });

    if (!device || device.status === DeviceStatus.REVOKED) {
      this.logRejectedPayload(
        'device_unauthorized_or_revoked',
        tenantId,
        deviceId,
        normalizedEventId,
      );
      throw new DomainUnauthorizedException(
        ERROR_CODES.TelemetryDeviceUnauthorized,
        'Device not found, unauthorized, or revoked',
      );
    }

    for (const key of Object.keys(payload)) {
      const capability = device.capabilities.find(
        (candidate) => candidate.key === key,
      );

      if (!capability) {
        this.logRejectedPayload(
          'capability_not_defined',
          tenantId,
          deviceId,
          normalizedEventId,
        );
        throw new DomainBadRequestException(
          ERROR_CODES.CapabilityNotDefined,
          `Capability ${key} not defined for device`,
        );
      }

      if (!capability.isReportable) {
        this.logRejectedPayload(
          'capability_not_reportable',
          tenantId,
          deviceId,
          normalizedEventId,
        );
        throw new DomainBadRequestException(
          ERROR_CODES.CapabilityNotReportable,
          `Capability ${key} is not reportable`,
        );
      }

      try {
        this.capabilityValidator.validateValue(payload[key], capability);
      } catch (error) {
        this.logRejectedPayload(
          'capability_value_invalid',
          tenantId,
          deviceId,
          normalizedEventId,
        );
        throw error;
      }
    }

    try {
      const telemetry = await this.prisma.telemetry.create({
        data: {
          tenantId,
          deviceId,
          eventId: normalizedEventId,
          payload,
        },
      });

      this.metrics?.recordTelemetryIngestion('accepted');

      this.logger.debug({
        event: 'telemetry.ingest.succeeded',
        tenantId,
        deviceId,
        eventId: normalizedEventId,
        telemetryId: telemetry.id,
        outcome: 'succeeded',
      });

      // Fire-and-forget: automation coordination must never affect the ingest response.
      void this.coordinateAutomationsSafely({
        tenantId,
        deviceId,
        telemetryId: telemetry.id,
        eventId: normalizedEventId,
        payload,
        // AutomationRuntimeReadRepository.assertAcceptedTelemetry re-reads the persisted
        // row and requires envelope.occurredAt to equal telemetry.createdAt exactly. A
        // fresh `new Date()` here is always a few microseconds later, so every envelope
        // was rejected with AUTOMATION_RUNTIME_READ_TELEMETRY_MISMATCH. Use the stored
        // value so the envelope describes the row it claims to describe.
        occurredAt: telemetry.createdAt,
      });

      return telemetry;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const duplicate = await this.prisma.telemetry.findUnique({
          where: {
            deviceId_eventId: {
              deviceId,
              eventId: normalizedEventId,
            },
          },
        });

        if (!duplicate) {
          this.logIngestFailure(tenantId, deviceId, normalizedEventId, error);
          throw error;
        }

        if (
          duplicate.tenantId !== tenantId ||
          duplicate.deviceId !== deviceId ||
          !this.isSamePayload(duplicate.payload, payload)
        ) {
          this.logRejectedPayload(
            'conflicting_telemetry_event',
            tenantId,
            deviceId,
            normalizedEventId,
          );
          throw new DomainBadRequestException(
            ERROR_CODES.TelemetryEventConflict,
            'Conflicting telemetry event',
          );
        }

        this.metrics?.recordTelemetryIngestion('duplicate');

        this.logger.debug({
          event: 'telemetry.ingest.duplicate_replayed',
          tenantId,
          deviceId,
          eventId: normalizedEventId,
          telemetryId: duplicate.id,
          outcome: 'replayed',
        });

        return duplicate;
      }

      this.logIngestFailure(tenantId, deviceId, normalizedEventId, error);
      throw error;
    }
  }

  async getLatest(tenantId: string, deviceId: string) {
    await this.ensureDeviceInTenant(tenantId, deviceId);

    return this.prisma.telemetry.findFirst({
      where: {
        tenantId,
        deviceId,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }

  async getHistory(
    tenantId: string,
    deviceId: string,
    limit = 50,
    cursor?: string,
  ) {
    const safeLimit = this.validateHistoryLimit(limit);
    const decodedCursor = cursor ? this.decodeHistoryCursor(cursor) : undefined;

    await this.ensureDeviceInTenant(tenantId, deviceId);

    const rows = await this.prisma.telemetry.findMany({
      where: {
        tenantId,
        deviceId,
        ...(decodedCursor
          ? {
              OR: [
                { createdAt: { lt: decodedCursor.createdAt } },
                {
                  createdAt: decodedCursor.createdAt,
                  id: { lt: decodedCursor.id },
                },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: safeLimit + 1,
    });

    const hasMore = rows.length > safeLimit;
    const items = hasMore ? rows.slice(0, safeLimit) : rows;
    const lastItem = items[items.length - 1];

    return {
      items,
      nextCursor:
        hasMore && lastItem ? this.encodeHistoryCursor(lastItem) : null,
    };
  }

  private validateHistoryLimit(limit: number): number {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new DomainBadRequestException(
        ERROR_CODES.TelemetryHistoryQueryInvalid,
        'Telemetry history limit must be an integer between 1 and 100',
      );
    }

    return limit;
  }

  private decodeHistoryCursor(cursor: string): {
    createdAt: Date;
    id: string;
  } {
    const normalizedCursor = cursor.trim();

    if (
      !normalizedCursor ||
      normalizedCursor.length > 512 ||
      !/^[A-Za-z0-9_-]+$/.test(normalizedCursor)
    ) {
      throw this.invalidHistoryCursor();
    }

    try {
      const decoded = JSON.parse(
        Buffer.from(normalizedCursor, 'base64url').toString('utf8'),
      ) as unknown;

      if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) {
        throw this.invalidHistoryCursor();
      }

      const record = decoded as Record<string, unknown>;
      const keys = Object.keys(record).sort();

      if (
        keys.length !== 2 ||
        keys[0] !== 'createdAt' ||
        keys[1] !== 'id' ||
        typeof record.createdAt !== 'string' ||
        typeof record.id !== 'string' ||
        !record.id.trim() ||
        record.id.length > 128
      ) {
        throw this.invalidHistoryCursor();
      }

      const createdAt = new Date(record.createdAt);

      if (
        Number.isNaN(createdAt.getTime()) ||
        createdAt.toISOString() !== record.createdAt
      ) {
        throw this.invalidHistoryCursor();
      }

      return {
        createdAt,
        id: record.id,
      };
    } catch (error) {
      if (error instanceof DomainBadRequestException) {
        throw error;
      }

      throw this.invalidHistoryCursor();
    }
  }

  private encodeHistoryCursor(record: { createdAt: Date; id: string }): string {
    return Buffer.from(
      JSON.stringify({
        createdAt: record.createdAt.toISOString(),
        id: record.id,
      }),
      'utf8',
    ).toString('base64url');
  }

  private invalidHistoryCursor(): DomainBadRequestException {
    return new DomainBadRequestException(
      ERROR_CODES.TelemetryHistoryQueryInvalid,
      'Invalid telemetry history cursor',
    );
  }

  private async ensureDeviceInTenant(
    tenantId: string,
    deviceId: string,
  ): Promise<void> {
    const device = await this.prisma.device.findFirst({
      where: {
        id: deviceId,
        tenantId,
      },
      select: {
        id: true,
      },
    });

    if (!device) {
      throw new DomainNotFoundException(
        ERROR_CODES.DeviceNotFound,
        'Device not found',
      );
    }
  }

  private isSamePayload(existing: unknown, incoming: unknown): boolean {
    return this.canonicalize(existing) === this.canonicalize(incoming);
  }

  private isWithinPayloadSize(payload: unknown): boolean {
    try {
      const serialized = JSON.stringify(payload);

      return Buffer.byteLength(serialized, 'utf8') <= this.MAX_PAYLOAD_SIZE;
    } catch {
      return false;
    }
  }

  private logRejectedPayload(
    reason: string,
    tenantId?: string,
    deviceId?: string,
    eventId?: string,
  ): void {
    this.metrics?.recordTelemetryIngestion('rejected');

    this.logger.warn({
      event: 'telemetry.ingest.rejected',
      tenantId,
      deviceId,
      eventId,
      outcome: 'rejected',
      reason,
    });
  }

  private logIngestFailure(
    tenantId: string,
    deviceId: string,
    eventId: string,
    error: unknown,
  ): void {
    this.metrics?.recordTelemetryIngestion('failed');

    this.logger.error({
      event: 'telemetry.ingest.failed',
      tenantId,
      deviceId,
      eventId,
      outcome: 'failed',
      error: toStructuredLogError(error),
    });
  }
  private isUnsafeKey(key: string): boolean {
    return key === '__proto__' || key === 'prototype' || key === 'constructor';
  }

  /**
   * Resolve capabilityKey -> capabilityId for one device.
   *
   * The automation coordinator validates every report with `assertUuid(capabilityId)`,
   * so ingestion must supply a real UUID. Previously this forwarded an empty string with
   * the comment that the coordinator would resolve it; the coordinator does not, and
   * `assertUuid('')` rejects the whole envelope, so every ingested event failed to
   * coordinate. Capability identity is immutable per device in practice, so the map is
   * cached per device and re-read whenever a key cannot be resolved from cache.
   */
  private async capabilityIdsForDevice(
    deviceId: string,
  ): Promise<Map<string, string>> {
    const cached = this.capabilityIdCache.get(deviceId);
    if (cached) return cached;

    const rows = await this.prisma.capability.findMany({
      where: { deviceId },
      select: { id: true, key: true },
    });
    const map = new Map<string, string>();
    for (const row of rows) map.set(row.key, row.id);
    if (this.capabilityIdCache.size >= this.CAPABILITY_CACHE_LIMIT) {
      // Cheap bounded eviction: drop the oldest entry rather than growing without limit.
      const oldest = this.capabilityIdCache.keys().next();
      if (!oldest.done) this.capabilityIdCache.delete(oldest.value);
    }
    this.capabilityIdCache.set(deviceId, map);
    return map;
  }

  private invalidateCapabilityIds(deviceId: string): void {
    this.capabilityIdCache.delete(deviceId);
  }
  private isValidJsonValue(
    value: unknown,
    depth = 0,
    state = { keys: 0 },
  ): boolean {
    if (depth > this.MAX_PAYLOAD_DEPTH) {
      return false;
    }

    if (value === null) {
      return true;
    }

    switch (typeof value) {
      case 'string':
        return Buffer.byteLength(value, 'utf8') <= this.MAX_PAYLOAD_SIZE;

      case 'boolean':
        return true;

      case 'number':
        return Number.isFinite(value);

      case 'object':
        if (Array.isArray(value)) {
          return value.every((item) =>
            this.isValidJsonValue(item, depth + 1, state),
          );
        }

        for (const [key, item] of Object.entries(
          value as Record<string, unknown>,
        )) {
          if (this.isUnsafeKey(key)) {
            return false;
          }

          state.keys += 1;

          if (state.keys > this.MAX_PAYLOAD_KEYS) {
            return false;
          }

          if (!this.isValidJsonValue(item, depth + 1, state)) {
            return false;
          }
        }

        return true;

      default:
        return false;
    }
  }

  private canonicalize(value: unknown): string {
    if (Array.isArray(value)) {
      return `[${value.map((item) => this.canonicalize(item)).join(',')}]`;
    }

    if (value !== null && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      const entries = Object.keys(record)
        .sort()
        .map(
          (key) => `${JSON.stringify(key)}:${this.canonicalize(record[key])}`,
        );

      return `{${entries.join(',')}}`;
    }

    return JSON.stringify(value);
  }

  /**
   * Slice 11.13 — fire-and-forget automation coordination after durable
   * telemetry persistence. Fully isolated from the ingest path: any failure is
   * logged with a bounded structured event and never propagates to the caller.
   */
  private async coordinateAutomationsSafely(input: {
    tenantId: string;
    deviceId: string;
    telemetryId: string;
    eventId: string;
    payload: Record<string, unknown>;
    occurredAt: Date;
  }): Promise<void> {
    if (!this.automationRuntimeEnabled || !this.automationCoordinator) {
      return;
    }

    let capabilityIds: Map<string, string>;
    try {
      capabilityIds = await this.capabilityIdsForDevice(input.deviceId);
    } catch (error) {
      this.logger.warn({
        event: 'telemetry.automation_coordination.capability_lookup_failed',
        outcome: 'failed',
        tenantId: input.tenantId,
        deviceId: input.deviceId,
        telemetryId: input.telemetryId,
        errorCode:
          error && typeof error === 'object' && 'code' in error
            ? String((error as { code?: unknown }).code)
            : 'CAPABILITY_LOOKUP_FAILED',
      });
      return;
    }

    const reports: AutomationTelemetryCapabilityReport[] = [];
    for (const [key, value] of Object.entries(input.payload)) {
      if (this.isUnsafeKey(key)) continue;
      if (
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean'
      ) {
        const capabilityId = capabilityIds.get(key);
        // A payload key with no registered capability cannot form a valid report: the
        // coordinator requires a UUID capabilityId, and inventing one would be worse than
        // forwarding nothing. It is skipped, and the skip is logged below.
        if (!capabilityId) continue;
        reports.push({
          capabilityKey: key,
          // The coordinator requires a UUID capabilityId (validateEnvelope calls
          // assertUuid on every report). Capability identity must therefore be resolved
          // here, tenant- and device-bound, rather than forwarded as an empty string:
          // an empty value is rejected, which made every ingested telemetry event fail
          // envelope validation even once the coordinator was actually injected.
          capabilityId,
          value,
        });
      }
    }

    if (reports.length === 0) {
      this.logger.warn({
        event: 'telemetry.automation_coordination.no_mapped_capability',
        outcome: 'skipped',
        tenantId: input.tenantId,
        deviceId: input.deviceId,
        telemetryId: input.telemetryId,
        payloadKeys: Object.keys(input.payload).length,
      });
      return;
    }

    const envelope: AutomationTelemetryCoordinationEnvelope = {
      tenantId: input.tenantId,
      telemetryId: input.telemetryId,
      deviceId: input.deviceId,
      eventId: input.eventId,
      occurredAt: input.occurredAt,
      origin: 'EXTERNAL_ACCEPTED',
      ancestry: [],
      reports,
    };

    void this.automationCoordinator.coordinate(envelope).catch((error) => {
      this.logger.warn({
        event: 'telemetry.automation_coordination.failed',
        outcome: 'failed',
        tenantId: input.tenantId,
        deviceId: input.deviceId,
        telemetryId: input.telemetryId,
        errorCode:
          error && typeof error === 'object' && 'code' in error
            ? String((error as { code?: unknown }).code)
            : 'AUTOMATION_COORDINATION_FAILED',
      });
    });
  }
}
