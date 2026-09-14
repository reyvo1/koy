import { CommandStatus, DeviceStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AdminOperationalSummaryService } from './admin-operational-summary.service';

const tenantId = '11111111-1111-4111-8111-111111111111';
const now = new Date('2026-07-19T10:00:00.000Z');

describe('AdminOperationalSummaryService', () => {
  let prisma: {
    device: { groupBy: jest.Mock; count: jest.Mock };
    capability: { count: jest.Mock };
    telemetry: { findFirst: jest.Mock };
    deviceCommand: { groupBy: jest.Mock };
  };
  let service: AdminOperationalSummaryService;

  beforeEach(() => {
    prisma = {
      device: {
        groupBy: jest.fn(),
        count: jest.fn(),
      },
      capability: {
        count: jest.fn(),
      },
      telemetry: {
        findFirst: jest.fn(),
      },
      deviceCommand: {
        groupBy: jest.fn(),
      },
    };
    service = new AdminOperationalSummaryService(
      prisma as unknown as PrismaService,
    );
  });

  it('returns a bounded tenant-isolated summary with complete enum maps', async () => {
    prisma.device.groupBy.mockResolvedValue([
      { status: DeviceStatus.ACTIVE, _count: { _all: 3 } },
      { status: DeviceStatus.INACTIVE, _count: { _all: 2 } },
    ]);
    prisma.device.count.mockResolvedValueOnce(1).mockResolvedValueOnce(4);
    prisma.capability.count
      .mockResolvedValueOnce(9)
      .mockResolvedValueOnce(7)
      .mockResolvedValueOnce(2);
    prisma.telemetry.findFirst.mockResolvedValue({
      createdAt: new Date('2026-07-19T09:59:30.000Z'),
    });
    prisma.deviceCommand.groupBy.mockResolvedValue([
      { status: CommandStatus.PENDING, _count: { _all: 2 } },
      { status: CommandStatus.ACKNOWLEDGED, _count: { _all: 5 } },
      { status: CommandStatus.FAILED, _count: { _all: 1 } },
    ]);

    const result = await service.summarize(tenantId, now);

    expect(prisma.device.groupBy).toHaveBeenCalledWith({
      by: ['status'],
      where: { tenantId },
      _count: { _all: true },
    });
    expect(prisma.device.count).toHaveBeenNthCalledWith(1, {
      where: {
        tenantId,
        status: { not: DeviceStatus.REVOKED },
        lastHeartbeatAt: { lt: new Date('2026-07-19T09:55:00.000Z') },
      },
    });
    expect(prisma.device.count).toHaveBeenNthCalledWith(2, {
      where: {
        tenantId,
        status: { not: DeviceStatus.REVOKED },
        lastHeartbeatAt: null,
      },
    });
    expect(prisma.capability.count).toHaveBeenNthCalledWith(1, {
      where: { device: { tenantId }, isReadable: true },
    });
    expect(prisma.capability.count).toHaveBeenNthCalledWith(2, {
      where: { device: { tenantId }, isReportable: true },
    });
    expect(prisma.capability.count).toHaveBeenNthCalledWith(3, {
      where: { device: { tenantId }, isWritable: true },
    });
    expect(prisma.telemetry.findFirst).toHaveBeenCalledWith({
      where: { tenantId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { createdAt: true },
    });
    expect(prisma.deviceCommand.groupBy).toHaveBeenCalledWith({
      by: ['status'],
      where: { tenantId },
      _count: { _all: true },
    });

    expect(result).toEqual({
      generatedAt: '2026-07-19T10:00:00.000Z',
      staleThresholdSeconds: 300,
      devices: {
        total: 5,
        byStatus: {
          PROVISIONING: 0,
          PAIRED: 0,
          ACTIVE: 3,
          INACTIVE: 2,
          REVOKED: 0,
        },
        staleHeartbeat: 1,
        neverReportedHeartbeat: 4,
      },
      capabilities: {
        readable: 9,
        reportable: 7,
        writable: 2,
      },
      telemetry: {
        latestObservedAt: '2026-07-19T09:59:30.000Z',
      },
      commands: {
        total: 8,
        byStatus: {
          PENDING: 2,
          SENT: 0,
          ACKNOWLEDGED: 5,
          FAILED: 1,
          TIMED_OUT: 0,
        },
      },
    });
  });

  it('returns explicit zero counts and null telemetry for an empty tenant', async () => {
    prisma.device.groupBy.mockResolvedValue([]);
    prisma.device.count.mockResolvedValue(0);
    prisma.capability.count.mockResolvedValue(0);
    prisma.telemetry.findFirst.mockResolvedValue(null);
    prisma.deviceCommand.groupBy.mockResolvedValue([]);

    const result = await service.summarize(tenantId, now);

    expect(result.devices.total).toBe(0);
    expect(Object.values(result.devices.byStatus)).toEqual([0, 0, 0, 0, 0]);
    expect(result.commands.total).toBe(0);
    expect(Object.values(result.commands.byStatus)).toEqual([0, 0, 0, 0, 0]);
    expect(result.telemetry.latestObservedAt).toBeNull();
  });
});
