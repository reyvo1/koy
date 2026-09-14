import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TelemetryAggregationController } from './telemetry-aggregation.controller';
import { TelemetryAggregationService } from './telemetry-aggregation.service';

const VALID_FROM = '2026-07-17T00:00:00.000Z';
const VALID_TO = '2026-07-18T00:00:00.000Z';

describe('TelemetryAggregationController', () => {
  it('delegates trusted tenant context and query values to the service', async () => {
    const aggregationService = {
      getAggregate: jest.fn().mockResolvedValue({ buckets: [] }),
    };
    const controller = new TelemetryAggregationController(
      aggregationService as unknown as TelemetryAggregationService,
    );
    const request = {
      user: {
        tenantContext: {
          tenantId: 'tenant-1',
        },
      },
    };

    await expect(
      controller.getAggregate(
        request,
        'device-1',
        'temperature',
        VALID_FROM,
        VALID_TO,
        '1h',
      ),
    ).resolves.toEqual({ buckets: [] });

    expect(aggregationService.getAggregate).toHaveBeenCalledWith(
      'tenant-1',
      'device-1',
      'temperature',
      VALID_FROM,
      VALID_TO,
      '1h',
    );
  });
});

describe('TelemetryAggregationService', () => {
  let service: TelemetryAggregationService;
  let prisma: {
    device: { findFirst: jest.Mock };
    $queryRaw: jest.Mock;
  };
  let metrics: { recordTelemetryAggregation: jest.Mock };

  beforeEach(() => {
    prisma = {
      device: { findFirst: jest.fn() },
      $queryRaw: jest.fn(),
    };
    metrics = {
      recordTelemetryAggregation: jest.fn(),
    };
    service = new TelemetryAggregationService(prisma as any, metrics as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function allowNumericCapability(overrides: Record<string, unknown> = {}) {
    prisma.device.findFirst.mockResolvedValue({
      id: 'device-1',
      capabilities: [
        {
          key: 'temperature',
          dataType: 'number',
          unit: 'celsius',
          isReportable: true,
          ...overrides,
        },
      ],
    });
  }

  it('returns bounded numeric buckets and capability metadata', async () => {
    allowNumericCapability();
    prisma.$queryRaw.mockResolvedValue([
      {
        start: '2026-07-17T10:00:00.000Z',
        count: 2,
        min: 24.1,
        max: 27.4,
        avg: 25.75,
      },
    ]);
    const debug = jest.spyOn(Logger.prototype, 'debug').mockImplementation();

    await expect(
      service.getAggregate(
        'tenant-1',
        'device-1',
        'temperature',
        VALID_FROM,
        VALID_TO,
        '1h',
      ),
    ).resolves.toEqual({
      capability: {
        key: 'temperature',
        dataType: 'number',
        unit: 'celsius',
      },
      from: VALID_FROM,
      to: VALID_TO,
      bucket: '1h',
      buckets: [
        {
          start: '2026-07-17T10:00:00.000Z',
          end: '2026-07-17T11:00:00.000Z',
          count: 2,
          min: 24.1,
          max: 27.4,
          avg: 25.75,
        },
      ],
    });

    expect(prisma.device.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'device-1',
        tenantId: 'tenant-1',
      },
      select: {
        id: true,
        capabilities: {
          where: {
            key: 'temperature',
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
    expect(metrics.recordTelemetryAggregation).toHaveBeenCalledWith(
      'succeeded',
      '1h',
      expect.any(Number),
    );
    expect(debug).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'telemetry.aggregate.succeeded',
        tenantId: 'tenant-1',
        deviceId: 'device-1',
        capabilityKey: 'temperature',
        bucket: '1h',
        bucketCount: 1,
        outcome: 'succeeded',
      }),
    );
    expect(debug.mock.calls[0][0]).not.toHaveProperty('payload');
  });

  it('builds a parameterized PostgreSQL date_bin and JSONB query', async () => {
    allowNumericCapability();
    prisma.$queryRaw.mockResolvedValue([]);

    await service.getAggregate(
      'tenant-1',
      'device-1',
      'temperature',
      VALID_FROM,
      VALID_TO,
      '15m',
    );

    const sql = prisma.$queryRaw.mock.calls[0][0] as Prisma.Sql;
    const source = (sql as any).strings.join('?');

    expect(source).toContain('date_bin(');
    expect(source).toContain('jsonb_typeof(payload -> (?::text))');
    expect(source).toContain('"tenantId" = ?');
    expect(source).toContain('"deviceId" = ?');
    expect(source).toContain("AT TIME ZONE 'UTC'");
    expect(source).toContain('COUNT(*)::integer');
    expect(source).toContain('MIN(value)::double precision');
    expect(source).toContain('MAX(value)::double precision');
    expect(source).toContain('AVG(value)::double precision');
    expect((sql as any).values).toEqual(
      expect.arrayContaining([
        '15 minutes',
        'temperature',
        'tenant-1',
        'device-1',
        VALID_FROM,
        VALID_TO,
      ]),
    );
  });

  it('returns an empty bucket list when no numeric observation exists', async () => {
    allowNumericCapability();
    prisma.$queryRaw.mockResolvedValue([]);

    await expect(
      service.getAggregate(
        'tenant-1',
        'device-1',
        'temperature',
        VALID_FROM,
        VALID_TO,
        '1d',
      ),
    ).resolves.toMatchObject({
      bucket: '1d',
      buckets: [],
    });
  });

  it.each([
    ['missing capability', undefined, VALID_FROM, VALID_TO, '1h'],
    ['blank capability', '   ', VALID_FROM, VALID_TO, '1h'],
    ['invalid from', 'temperature', '2026-07-17', VALID_TO, '1h'],
    ['invalid to', 'temperature', VALID_FROM, '2026-07-18', '1h'],
    ['unknown bucket', 'temperature', VALID_FROM, VALID_TO, '2h'],
    ['reversed range', 'temperature', VALID_TO, VALID_FROM, '1h'],
  ])(
    'rejects %s before querying the database',
    async (_name, capability, from, to, bucket) => {
      await expect(
        service.getAggregate(
          'tenant-1',
          'device-1',
          capability,
          from,
          to,
          bucket,
        ),
      ).rejects.toThrow();

      expect(prisma.device.findFirst).not.toHaveBeenCalled();
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    },
  );

  it('rejects a range longer than 31 days', async () => {
    await expect(
      service.getAggregate(
        'tenant-1',
        'device-1',
        'temperature',
        '2026-06-01T00:00:00.000Z',
        '2026-07-03T00:00:00.000Z',
        '1d',
      ),
    ).rejects.toThrow('must not exceed 31 days');
  });

  it('rejects a query that would exceed 744 buckets', async () => {
    await expect(
      service.getAggregate(
        'tenant-1',
        'device-1',
        'temperature',
        '2026-07-01T00:00:00.000Z',
        '2026-07-09T00:00:00.000Z',
        '15m',
      ),
    ).rejects.toThrow('must not exceed 744 buckets');
  });

  it('rejects a missing or cross-tenant device before raw SQL', async () => {
    prisma.device.findFirst.mockResolvedValue(null);

    await expect(
      service.getAggregate(
        'tenant-2',
        'device-1',
        'temperature',
        VALID_FROM,
        VALID_TO,
        '1h',
      ),
    ).rejects.toThrow('Device not found');

    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('rejects a capability not owned by the device', async () => {
    prisma.device.findFirst.mockResolvedValue({
      id: 'device-1',
      capabilities: [],
    });

    await expect(
      service.getAggregate(
        'tenant-1',
        'device-1',
        'temperature',
        VALID_FROM,
        VALID_TO,
        '1h',
      ),
    ).rejects.toThrow('not defined for device');
  });

  it('rejects a non-reportable capability', async () => {
    allowNumericCapability({ isReportable: false });

    await expect(
      service.getAggregate(
        'tenant-1',
        'device-1',
        'temperature',
        VALID_FROM,
        VALID_TO,
        '1h',
      ),
    ).rejects.toThrow('is not reportable');
  });

  it.each(['boolean', 'string', 'enum', 'object'])(
    'rejects non-numeric capability data type %s',
    async (dataType) => {
      allowNumericCapability({ dataType });

      await expect(
        service.getAggregate(
          'tenant-1',
          'device-1',
          'temperature',
          VALID_FROM,
          VALID_TO,
          '1h',
        ),
      ).rejects.toThrow('requires an integer or number capability');

      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    },
  );

  it('records and logs a parameterized query failure without payload data', async () => {
    allowNumericCapability();
    const failure = new Error('database unavailable');
    prisma.$queryRaw.mockRejectedValue(failure);
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();

    await expect(
      service.getAggregate(
        'tenant-1',
        'device-1',
        'temperature',
        VALID_FROM,
        VALID_TO,
        '1h',
      ),
    ).rejects.toThrow(failure);

    expect(metrics.recordTelemetryAggregation).toHaveBeenCalledWith(
      'failed',
      '1h',
      expect.any(Number),
    );
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'telemetry.aggregate.failed',
        outcome: 'failed',
        error: expect.any(Object),
      }),
    );
    expect(error.mock.calls[0][0]).not.toHaveProperty('payload');
  });
});
