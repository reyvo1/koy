import { Injectable, Logger, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ERROR_CODES } from '../common/errors/error-code';
import {
  DomainBadRequestException,
  DomainNotFoundException,
} from '../common/errors/domain-exceptions';
import { toStructuredLogError } from '../common/logging/log-error';
import { MetricsService } from '../metrics/metrics.service';
import { PrismaService } from '../prisma/prisma.service';

const MAX_AGGREGATION_RANGE_MS = 31 * 24 * 60 * 60 * 1000;
const MAX_AGGREGATION_BUCKETS = 744;
const MAX_CAPABILITY_KEY_LENGTH = 128;

const AGGREGATION_BUCKETS = {
  '15m': { interval: '15 minutes', durationMs: 15 * 60 * 1000 },
  '1h': { interval: '1 hour', durationMs: 60 * 60 * 1000 },
  '1d': { interval: '1 day', durationMs: 24 * 60 * 60 * 1000 },
} as const;

type AggregationBucket = keyof typeof AGGREGATION_BUCKETS;

interface AggregationRow {
  start: string;
  count: number;
  min: number;
  max: number;
  avg: number;
}

interface ValidatedAggregationQuery {
  capabilityKey: string;
  from: Date;
  fromIso: string;
  to: Date;
  toIso: string;
  bucketKey: AggregationBucket;
  bucket: (typeof AGGREGATION_BUCKETS)[AggregationBucket];
}

@Injectable()
export class TelemetryAggregationService {
  private readonly logger = new Logger(TelemetryAggregationService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly metrics?: MetricsService,
  ) {}

  async getAggregate(
    tenantId: string,
    deviceId: string,
    capability?: string,
    from?: string,
    to?: string,
    bucket?: string,
  ) {
    const query = this.validateQuery(capability, from, to, bucket);
    const capabilityRecord = await this.ensureNumericCapability(
      tenantId,
      deviceId,
      query.capabilityKey,
    );

    const sql = Prisma.sql`
      WITH numeric_observations AS (
        SELECT
          date_bin(
            ${query.bucket.interval}::interval,
            "createdAt",
            TIMESTAMP '1970-01-01 00:00:00'
          ) AS bucket_start,
          (payload ->> (${query.capabilityKey}::text))::double precision AS value
        FROM "telemetry"
        WHERE "tenantId" = ${tenantId}
          AND "deviceId" = ${deviceId}
          AND "createdAt" >= (${query.fromIso}::timestamptz AT TIME ZONE 'UTC')
          AND "createdAt" < (${query.toIso}::timestamptz AT TIME ZONE 'UTC')
          AND jsonb_typeof(payload -> (${query.capabilityKey}::text)) = 'number'
      )
      SELECT
        to_char(
          bucket_start,
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
        ) AS "start",
        COUNT(*)::integer AS "count",
        MIN(value)::double precision AS "min",
        MAX(value)::double precision AS "max",
        AVG(value)::double precision AS "avg"
      FROM numeric_observations
      GROUP BY bucket_start
      ORDER BY bucket_start ASC
      LIMIT ${MAX_AGGREGATION_BUCKETS + 1}
    `;

    const startedAt = process.hrtime.bigint();

    try {
      const rows = await this.prisma.$queryRaw<AggregationRow[]>(sql);
      const durationSeconds = this.elapsedSeconds(startedAt);

      if (rows.length > MAX_AGGREGATION_BUCKETS) {
        throw this.invalidQuery(
          'Telemetry aggregation result exceeds the maximum bucket count',
        );
      }

      const buckets = rows.map((row) =>
        this.mapBucket(row, query.bucket.durationMs),
      );

      this.metrics?.recordTelemetryAggregation(
        'succeeded',
        query.bucketKey,
        durationSeconds,
      );

      this.logger.debug({
        event: 'telemetry.aggregate.succeeded',
        tenantId,
        deviceId,
        capabilityKey: query.capabilityKey,
        bucket: query.bucketKey,
        from: query.fromIso,
        to: query.toIso,
        bucketCount: buckets.length,
        durationMs: Math.round(durationSeconds * 1000),
        outcome: 'succeeded',
      });

      return {
        capability: {
          key: capabilityRecord.key,
          dataType: capabilityRecord.dataType,
          unit: capabilityRecord.unit,
        },
        from: query.fromIso,
        to: query.toIso,
        bucket: query.bucketKey,
        buckets,
      };
    } catch (error) {
      const durationSeconds = this.elapsedSeconds(startedAt);

      this.metrics?.recordTelemetryAggregation(
        'failed',
        query.bucketKey,
        durationSeconds,
      );

      this.logger.error({
        event: 'telemetry.aggregate.failed',
        tenantId,
        deviceId,
        capabilityKey: query.capabilityKey,
        bucket: query.bucketKey,
        from: query.fromIso,
        to: query.toIso,
        durationMs: Math.round(durationSeconds * 1000),
        outcome: 'failed',
        error: toStructuredLogError(error),
      });

      throw error;
    }
  }

  private validateQuery(
    capability?: string,
    from?: string,
    to?: string,
    bucket?: string,
  ): ValidatedAggregationQuery {
    const capabilityKey = this.requireString(
      capability,
      'Telemetry aggregation capability is required',
      MAX_CAPABILITY_KEY_LENGTH,
    );
    const fromDate = this.parseCanonicalUtcTimestamp(from, 'from');
    const toDate = this.parseCanonicalUtcTimestamp(to, 'to');
    const bucketKey = this.requireString(
      bucket,
      'Telemetry aggregation bucket is required',
      3,
    );

    if (!(bucketKey in AGGREGATION_BUCKETS)) {
      throw this.invalidQuery(
        'Telemetry aggregation bucket must be one of 15m, 1h, or 1d',
      );
    }

    const normalizedBucketKey = bucketKey as AggregationBucket;
    const bucketDefinition = AGGREGATION_BUCKETS[normalizedBucketKey];
    const rangeMs = toDate.getTime() - fromDate.getTime();

    if (rangeMs <= 0) {
      throw this.invalidQuery(
        'Telemetry aggregation to must be later than from',
      );
    }

    if (rangeMs > MAX_AGGREGATION_RANGE_MS) {
      throw this.invalidQuery(
        'Telemetry aggregation range must not exceed 31 days',
      );
    }

    if (
      Math.ceil(rangeMs / bucketDefinition.durationMs) > MAX_AGGREGATION_BUCKETS
    ) {
      throw this.invalidQuery(
        'Telemetry aggregation query must not exceed 744 buckets',
      );
    }

    return {
      capabilityKey,
      from: fromDate,
      fromIso: fromDate.toISOString(),
      to: toDate,
      toIso: toDate.toISOString(),
      bucketKey: normalizedBucketKey,
      bucket: bucketDefinition,
    };
  }

  private async ensureNumericCapability(
    tenantId: string,
    deviceId: string,
    capabilityKey: string,
  ): Promise<{
    key: string;
    dataType: string;
    unit: string | null;
    isReportable: boolean;
  }> {
    const device = await this.prisma.device.findFirst({
      where: {
        id: deviceId,
        tenantId,
      },
      select: {
        id: true,
        capabilities: {
          where: {
            key: capabilityKey,
          },
          select: {
            key: true,
            dataType: true,
            unit: true,
            isReportable: true,
          },
        },
      },
    });

    if (!device) {
      throw new DomainNotFoundException(
        ERROR_CODES.DeviceNotFound,
        'Device not found',
      );
    }

    const capability = device.capabilities[0];

    if (!capability) {
      throw new DomainBadRequestException(
        ERROR_CODES.CapabilityNotDefined,
        `Capability ${capabilityKey} not defined for device`,
      );
    }

    if (!capability.isReportable) {
      throw new DomainBadRequestException(
        ERROR_CODES.CapabilityNotReportable,
        `Capability ${capabilityKey} is not reportable`,
      );
    }

    if (capability.dataType !== 'integer' && capability.dataType !== 'number') {
      throw this.invalidQuery(
        'Telemetry aggregation requires an integer or number capability',
      );
    }

    return capability;
  }

  private parseCanonicalUtcTimestamp(
    value: string | undefined,
    field: 'from' | 'to',
  ): Date {
    const normalized = this.requireString(
      value,
      `Telemetry aggregation ${field} is required`,
      64,
    );
    const date = new Date(normalized);

    if (
      Number.isNaN(date.getTime()) ||
      date.toISOString() !== normalized ||
      !normalized.endsWith('Z')
    ) {
      throw this.invalidQuery(
        `Telemetry aggregation ${field} must be a canonical UTC ISO-8601 timestamp`,
      );
    }

    return date;
  }

  private requireString(
    value: string | undefined,
    message: string,
    maxLength: number,
  ): string {
    if (typeof value !== 'string') {
      throw this.invalidQuery(message);
    }

    const normalized = value.trim();

    if (!normalized || normalized.length > maxLength) {
      throw this.invalidQuery(message);
    }

    return normalized;
  }

  private mapBucket(row: AggregationRow, durationMs: number) {
    const start = new Date(row.start);
    const count = Number(row.count);
    const min = Number(row.min);
    const max = Number(row.max);
    const avg = Number(row.avg);

    if (
      Number.isNaN(start.getTime()) ||
      start.toISOString() !== row.start ||
      !Number.isInteger(count) ||
      count < 1 ||
      !Number.isFinite(min) ||
      !Number.isFinite(max) ||
      !Number.isFinite(avg)
    ) {
      throw new Error('Invalid telemetry aggregation database result');
    }

    return {
      start: row.start,
      end: new Date(start.getTime() + durationMs).toISOString(),
      count,
      min,
      max,
      avg,
    };
  }

  private invalidQuery(message: string): DomainBadRequestException {
    return new DomainBadRequestException(
      ERROR_CODES.TelemetryAggregationQueryInvalid,
      message,
    );
  }

  private elapsedSeconds(startedAt: bigint): number {
    return Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
  }
}
