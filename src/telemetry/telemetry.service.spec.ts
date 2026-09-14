import { Test, TestingModule } from '@nestjs/testing';
import { TelemetryService } from './telemetry.service';
import { PrismaService } from '../prisma/prisma.service';
import { CapabilityValidator } from '../device/capability.validator';
import {
  UnauthorizedException,
  BadRequestException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DeviceStatus, Prisma } from '@prisma/client';
import { MetricsService } from '../metrics/metrics.service';

describe('TelemetryService', () => {
  let service: TelemetryService;
  let prisma: PrismaService;
  let warnSpy: jest.SpyInstance;
  let metrics: { recordTelemetryIngestion: jest.Mock };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelemetryService,
        CapabilityValidator,
        {
          provide: MetricsService,
          useValue: { recordTelemetryIngestion: jest.fn() },
        },
        {
          provide: PrismaService,
          useValue: {
            device: { findFirst: jest.fn() },
            telemetry: {
              findUnique: jest.fn(),
              findFirst: jest.fn(),
              findMany: jest.fn(),
              create: jest.fn().mockResolvedValue({ id: 'telemetry-created' }),
            },
          },
        },
      ],
    }).compile();

    service = module.get<TelemetryService>(TelemetryService);
    prisma = module.get<PrismaService>(PrismaService);
    metrics = module.get(MetricsService);
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('successful ingestion', async () => {
    (prisma.device.findFirst as jest.Mock).mockResolvedValue({
      id: 'd1',
      tenantId: 't1',
      status: DeviceStatus.ACTIVE,
      capabilities: [{ key: 'temp', dataType: 'number', isReportable: true }],
    });
    const payload = { temp: 25 };
    await service.ingest('t1', 'd1', 'evt-001', payload);
    expect(prisma.telemetry.create).toHaveBeenCalledWith({
      data: { tenantId: 't1', deviceId: 'd1', eventId: 'evt-001', payload },
    });
    expect(metrics.recordTelemetryIngestion).toHaveBeenCalledWith('accepted');
  });

  it('cross tenant rejection', async () => {
    (prisma.device.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(
      service.ingest('t2', 'd1', 'evt-001', { temp: 25 }),
    ).rejects.toThrow(UnauthorizedException);

    expect(metrics.recordTelemetryIngestion).toHaveBeenCalledWith('rejected');
    expect(warnSpy).toHaveBeenCalledWith({
      event: 'telemetry.ingest.rejected',
      outcome: 'rejected',
      reason: 'device_unauthorized_or_revoked',
      tenantId: 't2',
      deviceId: 'd1',
      eventId: 'evt-001',
    });
  });

  it('revoked device rejection', async () => {
    (prisma.device.findFirst as jest.Mock).mockResolvedValue({
      id: 'd1',
      tenantId: 't1',
      status: DeviceStatus.REVOKED,
    });
    await expect(
      service.ingest('t1', 'd1', 'evt-001', { temp: 25 }),
    ).rejects.toThrow(UnauthorizedException);

    expect(warnSpy).toHaveBeenCalledWith({
      event: 'telemetry.ingest.rejected',
      outcome: 'rejected',
      reason: 'device_unauthorized_or_revoked',
      tenantId: 't1',
      deviceId: 'd1',
      eventId: 'evt-001',
    });
  });

  it('array payload rejection', async () => {
    await expect(service.ingest('t1', 'd1', 'evt-001', [])).rejects.toThrow(
      BadRequestException,
    );

    expect(warnSpy).toHaveBeenCalledWith({
      event: 'telemetry.ingest.rejected',
      outcome: 'rejected',
      reason: 'invalid_payload',
      tenantId: 't1',
      deviceId: 'd1',
      eventId: 'evt-001',
    });
  });

  it('logs missing eventId rejection reason', async () => {
    await expect(
      service.ingest('t1', 'd1', '   ', { temp: 25 }),
    ).rejects.toThrow(BadRequestException);

    expect(warnSpy).toHaveBeenCalledWith({
      event: 'telemetry.ingest.rejected',
      outcome: 'rejected',
      reason: 'missing_event_id',
      tenantId: 't1',
      deviceId: 'd1',
      eventId: '   ',
    });
  });

  it('logs capability_not_defined rejection reason', async () => {
    (prisma.device.findFirst as jest.Mock).mockResolvedValue({
      id: 'd1',
      tenantId: 't1',
      status: DeviceStatus.ACTIVE,
      capabilities: [],
    });

    await expect(
      service.ingest('t1', 'd1', 'evt-undefined', { temp: 25 }),
    ).rejects.toThrow(BadRequestException);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'telemetry.ingest.rejected',
        outcome: 'rejected',
        reason: 'capability_not_defined',
        tenantId: 't1',
        deviceId: 'd1',
        eventId: 'evt-undefined',
      }),
    );
    expect(prisma.telemetry.create).not.toHaveBeenCalled();
  });

  it('logs capability_not_reportable rejection reason', async () => {
    (prisma.device.findFirst as jest.Mock).mockResolvedValue({
      id: 'd1',
      tenantId: 't1',
      status: DeviceStatus.ACTIVE,
      capabilities: [
        {
          key: 'temp',
          dataType: 'number',
          isReportable: false,
        },
      ],
    });

    await expect(
      service.ingest('t1', 'd1', 'evt-not-reportable', { temp: 25 }),
    ).rejects.toThrow(BadRequestException);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'telemetry.ingest.rejected',
        outcome: 'rejected',
        reason: 'capability_not_reportable',
        tenantId: 't1',
        deviceId: 'd1',
        eventId: 'evt-not-reportable',
      }),
    );
    expect(prisma.telemetry.create).not.toHaveBeenCalled();
  });
  it('returns existing telemetry when duplicate event has identical payload', async () => {
    (prisma.device.findFirst as jest.Mock).mockResolvedValue({
      id: 'd1',
      tenantId: 't1',
      status: DeviceStatus.ACTIVE,
      capabilities: [
        {
          key: 'temp',
          dataType: 'number',
          isReportable: true,
        },
      ],
    });

    const duplicate = {
      id: 'telemetry-1',
      tenantId: 't1',
      deviceId: 'd1',
      eventId: 'evt-001',
      payload: { temp: 25 },
    };

    const error = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      {
        code: 'P2002',
        clientVersion: '5.22.0',
      },
    );

    (prisma.telemetry.create as jest.Mock).mockRejectedValue(error);
    (prisma.telemetry.findUnique as jest.Mock).mockResolvedValue(duplicate);

    const result = await service.ingest('t1', 'd1', 'evt-001', { temp: 25 });

    expect(result).toEqual(duplicate);
    expect(prisma.telemetry.create).toHaveBeenCalledTimes(1);
    expect(metrics.recordTelemetryIngestion).toHaveBeenCalledWith('duplicate');
  });

  it('rejects duplicate eventId with conflicting payload', async () => {
    (prisma.device.findFirst as jest.Mock).mockResolvedValue({
      id: 'd1',
      tenantId: 't1',
      status: DeviceStatus.ACTIVE,
      capabilities: [
        {
          key: 'temp',
          dataType: 'number',
          isReportable: true,
        },
      ],
    });

    const error = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      {
        code: 'P2002',
        clientVersion: '5.22.0',
      },
    );

    (prisma.telemetry.create as jest.Mock).mockRejectedValue(error);

    (prisma.telemetry.findUnique as jest.Mock).mockResolvedValue({
      id: 'telemetry-1',
      tenantId: 't1',
      deviceId: 'd1',
      eventId: 'evt-001',
      payload: { temp: 25 },
    });

    await expect(
      service.ingest('t1', 'd1', 'evt-001', { temp: 30 }),
    ).rejects.toThrow(BadRequestException);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'telemetry.ingest.rejected',
        outcome: 'rejected',
        reason: 'conflicting_telemetry_event',
        tenantId: 't1',
        deviceId: 'd1',
        eventId: 'evt-001',
      }),
    );
  });
  it('treats duplicate payload with different object key order as identical', async () => {
    (prisma.device.findFirst as jest.Mock).mockResolvedValue({
      id: 'd1',
      tenantId: 't1',
      status: DeviceStatus.ACTIVE,
      capabilities: [
        {
          key: 'temp',
          dataType: 'number',
          isReportable: true,
        },
        {
          key: 'humidity',
          dataType: 'number',
          isReportable: true,
        },
      ],
    });

    const error = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      {
        code: 'P2002',
        clientVersion: '5.22.0',
      },
    );

    const duplicate = {
      id: 'telemetry-1',
      tenantId: 't1',
      deviceId: 'd1',
      eventId: 'evt-001',
      payload: {
        temp: 25,
        humidity: 60,
      },
    };

    (prisma.telemetry.create as jest.Mock).mockRejectedValue(error);
    (prisma.telemetry.findUnique as jest.Mock).mockResolvedValue(duplicate);

    const result = await service.ingest('t1', 'd1', 'evt-001', {
      humidity: 60,
      temp: 25,
    });

    expect(result).toEqual(duplicate);
  });
  it('rejects duplicate telemetry record owned by another tenant', async () => {
    (prisma.device.findFirst as jest.Mock).mockResolvedValue({
      id: 'd1',
      tenantId: 't1',
      status: DeviceStatus.ACTIVE,
      capabilities: [
        {
          key: 'temp',
          dataType: 'number',
          isReportable: true,
        },
      ],
    });

    const error = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      {
        code: 'P2002',
        clientVersion: '5.22.0',
      },
    );

    (prisma.telemetry.create as jest.Mock).mockRejectedValue(error);
    (prisma.telemetry.findUnique as jest.Mock).mockResolvedValue({
      id: 'telemetry-evil',
      tenantId: 't2',
      deviceId: 'd1',
      eventId: 'evt-001',
      payload: { temp: 25 },
    });

    await expect(
      service.ingest('t1', 'd1', 'evt-001', { temp: 25 }),
    ).rejects.toThrow(BadRequestException);
  });
  it('stores trimmed eventId', async () => {
    (prisma.device.findFirst as jest.Mock).mockResolvedValue({
      id: 'd1',
      tenantId: 't1',
      status: DeviceStatus.ACTIVE,
      capabilities: [
        {
          key: 'temp',
          dataType: 'number',
          isReportable: true,
        },
      ],
    });

    (prisma.telemetry.create as jest.Mock).mockResolvedValue({
      id: 'telemetry-1',
    });

    await service.ingest('t1', 'd1', '  evt-001  ', { temp: 25 });

    expect(prisma.telemetry.create).toHaveBeenCalledWith({
      data: {
        tenantId: 't1',
        deviceId: 'd1',
        eventId: 'evt-001',
        payload: { temp: 25 },
      },
    });
  });

  it('rejects normalized eventId collision with conflicting payload', async () => {
    (prisma.device.findFirst as jest.Mock).mockResolvedValue({
      id: 'd1',
      tenantId: 't1',
      status: DeviceStatus.ACTIVE,
      capabilities: [
        {
          key: 'temp',
          dataType: 'number',
          isReportable: true,
        },
      ],
    });

    const error = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      {
        code: 'P2002',
        clientVersion: '5.22.0',
      },
    );

    (prisma.telemetry.create as jest.Mock).mockRejectedValue(error);
    (prisma.telemetry.findUnique as jest.Mock).mockResolvedValue({
      id: 'telemetry-1',
      tenantId: 't1',
      deviceId: 'd1',
      eventId: 'evt-001',
      payload: { temp: 25 },
    });

    await expect(
      service.ingest('t1', 'd1', '  evt-001  ', { temp: 30 }),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.telemetry.findUnique).toHaveBeenCalledWith({
      where: {
        deviceId_eventId: {
          deviceId: 'd1',
          eventId: 'evt-001',
        },
      },
    });
  });
  it('treats deeply nested payload with different object key order as identical', async () => {
    (prisma.device.findFirst as jest.Mock).mockResolvedValue({
      id: 'd1',
      tenantId: 't1',
      status: DeviceStatus.ACTIVE,
      capabilities: [
        {
          key: 'metrics',
          dataType: 'object',
          isReportable: true,
        },
      ],
    });

    const error = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      {
        code: 'P2002',
        clientVersion: '5.22.0',
      },
    );

    const duplicate = {
      id: 'telemetry-1',
      tenantId: 't1',
      deviceId: 'd1',
      eventId: 'evt-001',
      payload: {
        metrics: {
          environment: {
            temperature: 25,
            humidity: 60,
          },
          battery: {
            voltage: 3.7,
            level: 80,
          },
        },
      },
    };

    (prisma.telemetry.create as jest.Mock).mockRejectedValue(error);
    (prisma.telemetry.findUnique as jest.Mock).mockResolvedValue(duplicate);

    const result = await service.ingest('t1', 'd1', 'evt-001', {
      metrics: {
        battery: {
          level: 80,
          voltage: 3.7,
        },
        environment: {
          humidity: 60,
          temperature: 25,
        },
      },
    });

    expect(result).toEqual(duplicate);
  });
  it('rejects non-JSON finite values nested inside object capability', async () => {
    (prisma.device.findFirst as jest.Mock).mockResolvedValue({
      id: 'd1',
      tenantId: 't1',
      status: DeviceStatus.ACTIVE,
      capabilities: [
        {
          key: 'metrics',
          dataType: 'object',
          isReportable: true,
        },
      ],
    });

    await expect(
      service.ingest('t1', 'd1', 'evt-001', {
        metrics: {
          temperature: Number.NaN,
        },
      }),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.telemetry.create).not.toHaveBeenCalled();
  });

  it('rejects payload exceeding maximum nesting depth', async () => {
    (prisma.device.findFirst as jest.Mock).mockResolvedValue({
      id: 'd1',
      tenantId: 't1',
      status: DeviceStatus.ACTIVE,
      capabilities: [
        {
          key: 'metrics',
          dataType: 'object',
          isReportable: true,
        },
      ],
    });

    let payload: any = 'leaf';

    for (let i = 0; i < 12; i++) {
      payload = { metrics: payload };
    }

    await expect(
      service.ingest('t1', 'd1', 'evt-depth', payload),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.telemetry.create).not.toHaveBeenCalled();
  });

  it('rejects payload exceeding maximum key count', async () => {
    (prisma.device.findFirst as jest.Mock).mockResolvedValue({
      id: 'd1',
      tenantId: 't1',
      status: DeviceStatus.ACTIVE,
      capabilities: [
        {
          key: 'metrics',
          dataType: 'object',
          isReportable: true,
        },
      ],
    });

    const metrics: Record<string, number> = {};

    for (let i = 0; i < 120; i++) {
      metrics[`key_${i}`] = i;
    }

    await expect(
      service.ingest('t1', 'd1', 'evt-keys', {
        metrics,
      }),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.telemetry.create).not.toHaveBeenCalled();
  });

  it('rejects oversized string payload values', async () => {
    (prisma.device.findFirst as jest.Mock).mockResolvedValue({
      id: 'd1',
      tenantId: 't1',
      status: DeviceStatus.ACTIVE,
      capabilities: [
        {
          key: 'message',
          dataType: 'string',
          isReportable: true,
        },
      ],
    });

    await expect(
      service.ingest('t1', 'd1', 'evt-size', {
        message: 'x'.repeat(33000),
      }),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.telemetry.create).not.toHaveBeenCalled();
  });
  it('rejects prototype pollution payload keys', async () => {
    (prisma.device.findFirst as jest.Mock).mockResolvedValue({
      id: 'd1',
      tenantId: 't1',
      status: DeviceStatus.ACTIVE,
      capabilities: [
        {
          key: 'metrics',
          dataType: 'object',
          isReportable: true,
        },
      ],
    });

    const payload = Object.create(null) as Record<string, unknown>;
    payload.metrics = Object.create(null);

    (payload.metrics as Record<string, unknown>).__proto__ = {
      polluted: true,
    };

    await expect(
      service.ingest('t1', 'd1', 'evt-proto', payload),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.telemetry.create).not.toHaveBeenCalled();
  });

  it('logs successful telemetry ingestion at debug without the payload', async () => {
    (prisma.device.findFirst as jest.Mock).mockResolvedValue({
      id: 'd1',
      tenantId: 't1',
      status: DeviceStatus.ACTIVE,
      capabilities: [{ key: 'temp', dataType: 'number', isReportable: true }],
    });
    (prisma.telemetry.create as jest.Mock).mockResolvedValue({
      id: 'telemetry-1',
      tenantId: 't1',
      deviceId: 'd1',
      eventId: 'evt-001',
      payload: { temp: 25 },
    });

    const loggerDebug = jest
      .spyOn((service as any).logger, 'debug')
      .mockImplementation();

    await service.ingest('t1', 'd1', 'evt-001', { temp: 25 });

    expect(loggerDebug).toHaveBeenCalledWith({
      event: 'telemetry.ingest.succeeded',
      tenantId: 't1',
      deviceId: 'd1',
      eventId: 'evt-001',
      telemetryId: 'telemetry-1',
      outcome: 'succeeded',
    });
    expect(loggerDebug.mock.calls[0][0]).not.toHaveProperty('payload');
  });

  it('logs identical duplicate telemetry as a replay at debug', async () => {
    (prisma.device.findFirst as jest.Mock).mockResolvedValue({
      id: 'd1',
      tenantId: 't1',
      status: DeviceStatus.ACTIVE,
      capabilities: [{ key: 'temp', dataType: 'number', isReportable: true }],
    });

    const error = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      { code: 'P2002', clientVersion: '5.22.0' },
    );
    (prisma.telemetry.create as jest.Mock).mockRejectedValue(error);
    (prisma.telemetry.findUnique as jest.Mock).mockResolvedValue({
      id: 'telemetry-1',
      tenantId: 't1',
      deviceId: 'd1',
      eventId: 'evt-001',
      payload: { temp: 25 },
    });

    const loggerDebug = jest
      .spyOn((service as any).logger, 'debug')
      .mockImplementation();

    await service.ingest('t1', 'd1', 'evt-001', { temp: 25 });

    expect(loggerDebug).toHaveBeenCalledWith({
      event: 'telemetry.ingest.duplicate_replayed',
      tenantId: 't1',
      deviceId: 'd1',
      eventId: 'evt-001',
      telemetryId: 'telemetry-1',
      outcome: 'replayed',
    });
  });

  it('logs unexpected telemetry persistence failures as structured errors', async () => {
    (prisma.device.findFirst as jest.Mock).mockResolvedValue({
      id: 'd1',
      tenantId: 't1',
      status: DeviceStatus.ACTIVE,
      capabilities: [{ key: 'temp', dataType: 'number', isReportable: true }],
    });

    const error = new Error('database unavailable');
    (prisma.telemetry.create as jest.Mock).mockRejectedValue(error);

    const loggerError = jest
      .spyOn((service as any).logger, 'error')
      .mockImplementation();

    await expect(
      service.ingest('t1', 'd1', 'evt-001', { temp: 25 }),
    ).rejects.toThrow(error);

    expect(loggerError).toHaveBeenCalledWith({
      event: 'telemetry.ingest.failed',
      tenantId: 't1',
      deviceId: 'd1',
      eventId: 'evt-001',
      outcome: 'failed',
      error: {
        type: 'Error',
        message: 'database unavailable',
        stack: error.stack,
      },
    });
  });

  describe('getLatest', () => {
    it('returns the latest telemetry using tenant and device isolation', async () => {
      const latest = {
        id: 'telemetry-2',
        tenantId: 'tenant-1',
        deviceId: 'device-1',
        createdAt: new Date('2026-07-18T02:00:00.000Z'),
      };
      (prisma.device.findFirst as jest.Mock).mockResolvedValue({
        id: 'device-1',
      });
      (prisma.telemetry.findFirst as jest.Mock).mockResolvedValue(latest);

      await expect(service.getLatest('tenant-1', 'device-1')).resolves.toEqual(
        latest,
      );

      expect(prisma.device.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'device-1',
          tenantId: 'tenant-1',
        },
        select: {
          id: true,
        },
      });
      expect(prisma.telemetry.findFirst).toHaveBeenCalledWith({
        where: {
          tenantId: 'tenant-1',
          deviceId: 'device-1',
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
    });

    it('returns null when the authorized device has no telemetry', async () => {
      (prisma.device.findFirst as jest.Mock).mockResolvedValue({
        id: 'device-1',
      });
      (prisma.telemetry.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        service.getLatest('tenant-1', 'device-1'),
      ).resolves.toBeNull();
    });

    it('does not query telemetry for a missing or cross-tenant device', async () => {
      (prisma.device.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(service.getLatest('tenant-1', 'device-1')).rejects.toThrow(
        NotFoundException,
      );

      expect(prisma.telemetry.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('getHistory', () => {
    const authorizeDevice = () =>
      (prisma.device.findFirst as jest.Mock).mockResolvedValue({
        id: 'device-1',
      });

    it('returns a bounded first page with an opaque next cursor', async () => {
      authorizeDevice();
      const rows = [
        {
          id: 'telemetry-3',
          tenantId: 'tenant-1',
          deviceId: 'device-1',
          createdAt: new Date('2026-07-18T03:00:00.000Z'),
        },
        {
          id: 'telemetry-2',
          tenantId: 'tenant-1',
          deviceId: 'device-1',
          createdAt: new Date('2026-07-18T02:00:00.000Z'),
        },
        {
          id: 'telemetry-1',
          tenantId: 'tenant-1',
          deviceId: 'device-1',
          createdAt: new Date('2026-07-18T01:00:00.000Z'),
        },
      ];
      (prisma.telemetry.findMany as jest.Mock).mockResolvedValue(rows);

      const result = await service.getHistory('tenant-1', 'device-1', 2);

      expect(prisma.telemetry.findMany).toHaveBeenCalledWith({
        where: {
          tenantId: 'tenant-1',
          deviceId: 'device-1',
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 3,
      });
      expect(result.items).toEqual(rows.slice(0, 2));
      expect(result.nextCursor).toEqual(expect.any(String));
    });

    it('applies a decoded seek cursor without offset pagination', async () => {
      authorizeDevice();
      (prisma.telemetry.findMany as jest.Mock).mockResolvedValue([]);
      const cursor = Buffer.from(
        JSON.stringify({
          createdAt: '2026-07-18T02:00:00.000Z',
          id: 'telemetry-2',
        }),
        'utf8',
      ).toString('base64url');

      await service.getHistory('tenant-1', 'device-1', 25, cursor);

      expect(prisma.telemetry.findMany).toHaveBeenCalledWith({
        where: {
          tenantId: 'tenant-1',
          deviceId: 'device-1',
          OR: [
            {
              createdAt: {
                lt: new Date('2026-07-18T02:00:00.000Z'),
              },
            },
            {
              createdAt: new Date('2026-07-18T02:00:00.000Z'),
              id: {
                lt: 'telemetry-2',
              },
            },
          ],
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 26,
      });
    });

    it('returns null nextCursor on the final page', async () => {
      authorizeDevice();
      const rows = [
        {
          id: 'telemetry-1',
          tenantId: 'tenant-1',
          deviceId: 'device-1',
          createdAt: new Date('2026-07-18T01:00:00.000Z'),
        },
      ];
      (prisma.telemetry.findMany as jest.Mock).mockResolvedValue(rows);

      await expect(
        service.getHistory('tenant-1', 'device-1', 50),
      ).resolves.toEqual({
        items: rows,
        nextCursor: null,
      });
    });

    it.each([0, 101, 1.5, Number.NaN])(
      'rejects invalid history limit %p before querying the database',
      async (limit) => {
        await expect(
          service.getHistory('tenant-1', 'device-1', limit),
        ).rejects.toThrow(BadRequestException);

        expect(prisma.device.findFirst).not.toHaveBeenCalled();
        expect(prisma.telemetry.findMany).not.toHaveBeenCalled();
      },
    );

    it.each([
      'not-base64!',
      'e30',
      Buffer.from('{"id":"x"}').toString('base64url'),
    ])(
      'rejects malformed history cursor %s before querying the database',
      async (cursor) => {
        await expect(
          service.getHistory('tenant-1', 'device-1', 50, cursor),
        ).rejects.toThrow(BadRequestException);

        expect(prisma.device.findFirst).not.toHaveBeenCalled();
        expect(prisma.telemetry.findMany).not.toHaveBeenCalled();
      },
    );

    it('does not query telemetry for a missing or cross-tenant device', async () => {
      (prisma.device.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        service.getHistory('tenant-1', 'device-1', 50),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.telemetry.findMany).not.toHaveBeenCalled();
    });
  });
});
