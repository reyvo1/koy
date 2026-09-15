import { Test, TestingModule } from '@nestjs/testing';
import { CommandService } from './command.service';
import { PrismaService } from '../prisma/prisma.service';
import { MqttService } from '../mqtt/mqtt.service';
import { CapabilityValidator } from './capability.validator';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { CommandStatus } from '@prisma/client';
import { MetricsService } from '../metrics/metrics.service';

describe('CommandService', () => {
  let service: CommandService;
  let prisma: PrismaService;
  let mqttService: MqttService;
  let metrics: { recordCommandLifecycle: jest.Mock };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommandService,
        CapabilityValidator,
        {
          provide: PrismaService,
          useValue: {
            device: { findFirst: jest.fn() },
            deviceCommand: {
              create: jest.fn(),
              update: jest.fn(),
              findUnique: jest.fn(),
              findMany: jest.fn(),
              updateMany: jest.fn(),
              count: jest.fn(),
            },
          },
        },
        { provide: MqttService, useValue: { publish: jest.fn() } },
        {
          provide: MetricsService,
          useValue: { recordCommandLifecycle: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<CommandService>(CommandService);
    prisma = module.get<PrismaService>(PrismaService);
    mqttService = module.get<MqttService>(MqttService);
    metrics = module.get(MetricsService);
  });

  it('rejects duplicate idempotency key with conflicting payload', async () => {
    (prisma.device.findFirst as jest.Mock).mockResolvedValue({
      id: 'd1',
      tenantId: 't1',
      status: 'ACTIVE',
      capabilities: [{ key: 'cmd', isWritable: true, dataType: 'string' }],
    });

    (prisma.deviceCommand.findUnique as jest.Mock).mockResolvedValue({
      id: 'c1',
      tenantId: 't1',
      deviceId: 'd1',
      payload: { cmd: 'reset' },
    });

    await expect(
      service.publish('t1', 'd1', { cmd: 'shutdown' }, 'key1'),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.deviceCommand.create).not.toHaveBeenCalled();
    expect(mqttService.publish).not.toHaveBeenCalled();
    expect(metrics.recordCommandLifecycle).not.toHaveBeenCalled();
  });

  it('treats duplicate command payload with different object key order as identical', async () => {
    (prisma.device.findFirst as jest.Mock).mockResolvedValue({
      id: 'd1',
      tenantId: 't1',
      status: 'ACTIVE',
      capabilities: [],
    });

    const existing = {
      id: 'c1',
      tenantId: 't1',
      deviceId: 'd1',
      payload: {
        config: {
          enabled: true,
          mode: 'eco',
        },
      },
    };

    (prisma.deviceCommand.findUnique as jest.Mock).mockResolvedValue(existing);

    const result = await service.publish(
      't1',
      'd1',
      {
        config: {
          mode: 'eco',
          enabled: true,
        },
      },
      'key1',
    );

    expect(result).toEqual(existing);
    expect(prisma.deviceCommand.create).not.toHaveBeenCalled();
    expect(mqttService.publish).not.toHaveBeenCalled();
    expect(metrics.recordCommandLifecycle).toHaveBeenCalledWith(
      'idempotent_replay',
    );
  });

  it('re-arms and republishes the same failed command identity for an explicit retry', async () => {
    (prisma.device.findFirst as jest.Mock).mockResolvedValue({
      id: 'd1',
      tenantId: 't1',
      status: 'ACTIVE',
      capabilities: [{ key: 'cmd', isWritable: true, dataType: 'string' }],
    });
    (prisma.deviceCommand.findUnique as jest.Mock).mockResolvedValue({
      id: 'c1',
      correlationId: 'corr1',
      tenantId: 't1',
      deviceId: 'd1',
      payload: { cmd: 'reset' },
      idempotencyKey: 'automation:e1:a1',
      status: CommandStatus.FAILED,
      sentAt: null,
      acknowledgedAt: null,
    });
    (prisma.deviceCommand.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    (mqttService.publish as jest.Mock).mockResolvedValue(undefined);

    const result = await service.retryPublish(
      't1',
      'd1',
      { cmd: 'reset' },
      'automation:e1:a1',
    );

    expect(mqttService.publish).toHaveBeenCalledWith(
      'tenants/t1/devices/d1/commands',
      { commandId: 'corr1', payload: { cmd: 'reset' } },
    );
    expect(prisma.deviceCommand.updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({ id: 'c1' }),
        data: expect.objectContaining({ status: CommandStatus.PENDING }),
      }),
    );
    expect(prisma.deviceCommand.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { id: 'c1', status: CommandStatus.PENDING },
        data: expect.objectContaining({ status: CommandStatus.SENT }),
      }),
    );
    expect(result).toMatchObject({ id: 'c1', correlationId: 'corr1', status: CommandStatus.SENT });
  });

  it('never republishes an already live or acknowledged command during retry replay', async () => {
    (prisma.device.findFirst as jest.Mock).mockResolvedValue({
      id: 'd1',
      tenantId: 't1',
      status: 'ACTIVE',
      capabilities: [{ key: 'cmd', isWritable: true, dataType: 'string' }],
    });
    (prisma.deviceCommand.findUnique as jest.Mock).mockResolvedValue({
      id: 'c1',
      correlationId: 'corr1',
      tenantId: 't1',
      deviceId: 'd1',
      payload: { cmd: 'reset' },
      idempotencyKey: 'automation:e1:a1',
      status: CommandStatus.ACKNOWLEDGED,
    });

    await expect(
      service.retryPublish('t1', 'd1', { cmd: 'reset' }, 'automation:e1:a1'),
    ).resolves.toMatchObject({ status: CommandStatus.ACKNOWLEDGED });

    expect(prisma.deviceCommand.updateMany).not.toHaveBeenCalled();
    expect(mqttService.publish).not.toHaveBeenCalled();
  });

  it('rejects blank idempotency key', async () => {
    await expect(
      service.publish('t1', 'd1', { cmd: 'reset' }, '   '),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.device.findFirst).not.toHaveBeenCalled();
  });

  it('publish valid same-tenant command', async () => {
    (prisma.device.findFirst as jest.Mock).mockResolvedValue({
      id: 'd1',
      tenantId: 't1',
      capabilities: [{ key: 'cmd', isWritable: true, dataType: 'string' }],
    });
    (prisma.deviceCommand.create as jest.Mock).mockResolvedValue({
      id: 'c1',
      correlationId: 'corr1',
      status: CommandStatus.PENDING,
      sentAt: null,
    });
    (prisma.deviceCommand.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    const payload = { cmd: 'reset' };
    await service.publish('t1', 'd1', payload);
    expect(mqttService.publish).toHaveBeenCalledWith(
      'tenants/t1/devices/d1/commands',
      { commandId: 'corr1', payload },
    );
    expect(prisma.deviceCommand.updateMany).toHaveBeenCalledWith({
      where: { id: 'c1', status: CommandStatus.PENDING },
      data: { status: CommandStatus.SENT, sentAt: expect.any(Date) },
    });
    expect(metrics.recordCommandLifecycle).toHaveBeenNthCalledWith(
      1,
      'created',
    );
    expect(metrics.recordCommandLifecycle).toHaveBeenNthCalledWith(2, 'sent');
  });

  it('cross-tenant command rejected', async () => {
    (prisma.device.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(service.publish('t2', 'd1', { cmd: 'reset' })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('empty payload rejected', async () => {
    await expect(service.publish('t1', 'd1', {})).rejects.toThrow(
      BadRequestException,
    );
  });

  it('finds an exact same-tenant command by device idempotency identity', async () => {
    const existing = {
      id: 'c1',
      tenantId: 't1',
      deviceId: 'd1',
      idempotencyKey: 'automation:e1:a1',
    };
    (prisma.deviceCommand.findUnique as jest.Mock).mockResolvedValue(existing);

    await expect(
      service.findTenantDeviceCommandByIdempotencyKey(
        't1',
        'd1',
        ' automation:e1:a1 ',
      ),
    ).resolves.toEqual(existing);
    expect(prisma.deviceCommand.findUnique).toHaveBeenCalledWith({
      where: {
        deviceId_idempotencyKey: {
          deviceId: 'd1',
          idempotencyKey: 'automation:e1:a1',
        },
      },
    });
  });

  it('reads command status only for the same tenant and device', async () => {
    const command = {
      id: 'c1',
      correlationId: 'corr1',
      tenantId: 't1',
      deviceId: 'd1',
      status: CommandStatus.ACKNOWLEDGED,
    };
    (prisma.deviceCommand.findUnique as jest.Mock).mockResolvedValue(command);

    await expect(
      service.getByCorrelationId('t1', 'd1', ' corr1 '),
    ).resolves.toEqual(command);
    expect(prisma.deviceCommand.findUnique).toHaveBeenCalledWith({
      where: { correlationId: 'corr1' },
    });
  });

  it('does not expose command status across tenant or device boundaries', async () => {
    (prisma.deviceCommand.findUnique as jest.Mock).mockResolvedValue({
      id: 'c1',
      correlationId: 'corr1',
      tenantId: 'other-tenant',
      deviceId: 'd1',
      status: CommandStatus.SENT,
    });

    await expect(
      service.getByCorrelationId('t1', 'd1', 'corr1'),
    ).rejects.toThrow(NotFoundException);
  });

  it('does not expose a cross-tenant command through idempotency lookup', async () => {
    (prisma.deviceCommand.findUnique as jest.Mock).mockResolvedValue({
      id: 'c1',
      tenantId: 'other-tenant',
      deviceId: 'd1',
      idempotencyKey: 'automation:e1:a1',
    });

    await expect(
      service.findTenantDeviceCommandByIdempotencyKey(
        't1',
        'd1',
        'automation:e1:a1',
      ),
    ).resolves.toBeNull();
  });

  it('acknowledge valid command', async () => {
    (prisma.deviceCommand.findUnique as jest.Mock).mockResolvedValue({
      id: 'c1',
      tenantId: 't1',
      deviceId: 'd1',
      status: CommandStatus.SENT,
    });
    (prisma.deviceCommand.updateMany as jest.Mock).mockResolvedValue({
      count: 1,
    });
    await service.acknowledge('t1', 'd1', 'corr1');
    expect(prisma.deviceCommand.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'c1',
        status: { in: [CommandStatus.PENDING, CommandStatus.SENT] },
      },
      data: {
        status: CommandStatus.ACKNOWLEDGED,
        acknowledgedAt: expect.any(Date),
      },
    });
    expect(metrics.recordCommandLifecycle).toHaveBeenCalledWith('acknowledged');
  });

  it('accepts a valid ACK while durable state is still PENDING after broker delivery', async () => {
    (prisma.deviceCommand.findUnique as jest.Mock).mockResolvedValue({
      id: 'c-pending',
      tenantId: 't1',
      deviceId: 'd1',
      status: CommandStatus.PENDING,
    });
    (prisma.deviceCommand.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

    const result = await service.acknowledge('t1', 'd1', 'corr-pending');

    expect(result.status).toBe(CommandStatus.ACKNOWLEDGED);
    expect(prisma.deviceCommand.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'c-pending',
        status: { in: [CommandStatus.PENDING, CommandStatus.SENT] },
      },
      data: {
        status: CommandStatus.ACKNOWLEDGED,
        acknowledgedAt: expect.any(Date),
      },
    });
  });

  it('treats a duplicate QoS-1 ACK as an idempotent replay', async () => {
    (prisma.deviceCommand.findUnique as jest.Mock).mockResolvedValue({
      id: 'c-acked',
      tenantId: 't1',
      deviceId: 'd1',
      status: CommandStatus.ACKNOWLEDGED,
    });

    const result = await service.acknowledge('t1', 'd1', 'corr-acked');

    expect(result.status).toBe(CommandStatus.ACKNOWLEDGED);
    expect(prisma.deviceCommand.updateMany).not.toHaveBeenCalled();
    expect(metrics.recordCommandLifecycle).toHaveBeenCalledWith(
      'acknowledgement_replayed',
    );
  });

  it('accepts an identical ACK that loses the concurrent status update race', async () => {
    (prisma.deviceCommand.findUnique as jest.Mock)
      .mockResolvedValueOnce({
        id: 'c-race',
        tenantId: 't1',
        deviceId: 'd1',
        status: CommandStatus.SENT,
      })
      .mockResolvedValueOnce({
        id: 'c-race',
        tenantId: 't1',
        deviceId: 'd1',
        status: CommandStatus.ACKNOWLEDGED,
      });
    (prisma.deviceCommand.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

    const result = await service.acknowledge('t1', 'd1', 'corr-race');

    expect(result.status).toBe(CommandStatus.ACKNOWLEDGED);
    expect(metrics.recordCommandLifecycle).toHaveBeenCalledWith(
      'acknowledgement_replayed',
    );
  });

  it('acknowledge fails if status changed concurrently', async () => {
    (prisma.deviceCommand.findUnique as jest.Mock).mockResolvedValue({
      id: 'c1',
      tenantId: 't1',
      deviceId: 'd1',
      status: CommandStatus.SENT,
    });
    (prisma.deviceCommand.updateMany as jest.Mock).mockResolvedValue({
      count: 0,
    });
    await expect(service.acknowledge('t1', 'd1', 'corr1')).rejects.toThrow(
      BadRequestException,
    );
    expect(metrics.recordCommandLifecycle).toHaveBeenCalledWith(
      'acknowledgement_rejected',
    );
  });

  it('publish idempotent command does not call create/mqtt/update', async () => {
    (prisma.device.findFirst as jest.Mock).mockResolvedValue({
      id: 'd1',
      status: 'ACTIVE',
    });
    (prisma.deviceCommand.findUnique as jest.Mock).mockResolvedValue({
      id: 'c1',
      tenantId: 't1',
      deviceId: 'd1',
      payload: { cmd: 'reset' },
    });
    const result = await service.publish('t1', 'd1', { cmd: 'reset' }, 'key1');
    expect(result.id).toBe('c1');
    expect(prisma.deviceCommand.create).not.toHaveBeenCalled();
    expect(mqttService.publish).not.toHaveBeenCalled();
    expect(prisma.deviceCommand.update).not.toHaveBeenCalled();
  });

  it('returns existing command when idempotency create hits unique constraint race', async () => {
    (prisma.device.findFirst as jest.Mock).mockResolvedValue({
      id: 'd1',
      tenantId: 't1',
      status: 'ACTIVE',
      capabilities: [
        {
          key: 'cmd',
          isWritable: true,
          dataType: 'string',
        },
      ],
    });

    (prisma.deviceCommand.findUnique as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'c-existing',
        tenantId: 't1',
        deviceId: 'd1',
        idempotencyKey: 'key1',
        payload: { cmd: 'reset' },
      });

    const uniqueConstraintError = Object.assign(
      new Error('Unique constraint failed'),
      {
        code: 'P2002',
        clientVersion: 'test',
      },
    );

    Object.setPrototypeOf(
      uniqueConstraintError,
      require('@prisma/client/runtime/library').PrismaClientKnownRequestError
        .prototype,
    );

    (prisma.deviceCommand.create as jest.Mock).mockRejectedValue(
      uniqueConstraintError,
    );

    const result = await service.publish('t1', 'd1', { cmd: 'reset' }, 'key1');

    expect(result.id).toBe('c-existing');
    expect(mqttService.publish).not.toHaveBeenCalled();
  });

  it('cross-tenant device lookup before idempotency lookup', async () => {
    (prisma.device.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(
      service.publish('t2', 'd1', { cmd: 'reset' }, 'key1'),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.deviceCommand.findUnique).not.toHaveBeenCalled();
  });

  it('getHistory normalizes pagination strictly', async () => {
    (prisma.deviceCommand.findMany as jest.Mock).mockResolvedValue([]);

    // "1.5" limit -> 10, "2.5" offset -> 0
    await service.getHistory('t1', 'd1', '1.5', '2.5');
    expect(prisma.deviceCommand.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 10,
        skip: 0,
      }),
    );

    // invalid strings -> defaults
    await service.getHistory('t1', 'd1', 'abc', 'xyz');
    expect(prisma.deviceCommand.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 10,
        skip: 0,
      }),
    );

    // limit 200 -> 100, negative offset -> 0
    await service.getHistory('t1', 'd1', 200, -5);
    expect(prisma.deviceCommand.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 100,
        skip: 0,
      }),
    );
  });

  it('getHistory enforces correct isolation', async () => {
    (prisma.deviceCommand.findMany as jest.Mock).mockResolvedValue([]);
    await service.getHistory('t1', 'd1', 10, 0);

    expect(prisma.deviceCommand.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 't1', deviceId: 'd1' },
      }),
    );
  });

  it('markTimedOut transitions stale SENT commands', async () => {
    const threshold = new Date('2026-07-14T12:00:00Z');
    (prisma.deviceCommand.updateMany as jest.Mock).mockResolvedValue({
      count: 1,
    });

    await service.markTimedOut(threshold);

    expect(prisma.deviceCommand.updateMany).toHaveBeenCalledWith({
      where: {
        status: CommandStatus.SENT,
        sentAt: { lt: threshold },
      },
      data: {
        status: CommandStatus.TIMED_OUT,
      },
    });
  });

  it('countStalePending returns correct count', async () => {
    const threshold = new Date('2026-07-14T12:00:00Z');
    (prisma.deviceCommand.count as jest.Mock).mockResolvedValue(5);

    const count = await service.countStalePending(threshold);

    expect(prisma.deviceCommand.count).toHaveBeenCalledWith({
      where: {
        status: CommandStatus.PENDING,
        createdAt: { lt: threshold },
      },
    });
    expect(count).toBe(5);
  });

  it('logs a structured command publish success event without the payload', async () => {
    (prisma.device.findFirst as jest.Mock).mockResolvedValue({
      id: 'd1',
      tenantId: 't1',
      status: 'ACTIVE',
      capabilities: [{ key: 'cmd', isWritable: true, dataType: 'string' }],
    });
    (prisma.deviceCommand.create as jest.Mock).mockResolvedValue({
      id: 'c1',
      correlationId: 'corr1',
      status: CommandStatus.PENDING,
      sentAt: null,
    });
    (prisma.deviceCommand.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

    const loggerLog = jest
      .spyOn((service as any).logger, 'log')
      .mockImplementation();

    await service.publish('t1', 'd1', { cmd: 'reset' });

    expect(loggerLog).toHaveBeenCalledWith({
      event: 'command.publish.succeeded',
      tenantId: 't1',
      deviceId: 'd1',
      commandId: 'c1',
      correlationId: 'corr1',
      outcome: 'succeeded',
    });
    expect(loggerLog.mock.calls[0][0]).not.toHaveProperty('payload');
  });

  it('logs a structured command publish failure', async () => {
    const error = new Error('broker unavailable');

    (prisma.device.findFirst as jest.Mock).mockResolvedValue({
      id: 'd1',
      tenantId: 't1',
      status: 'ACTIVE',
      capabilities: [{ key: 'cmd', isWritable: true, dataType: 'string' }],
    });
    (prisma.deviceCommand.create as jest.Mock).mockResolvedValue({
      id: 'c1',
      correlationId: 'corr1',
    });
    (mqttService.publish as jest.Mock).mockRejectedValue(error);
    (prisma.deviceCommand.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

    const loggerError = jest
      .spyOn((service as any).logger, 'error')
      .mockImplementation();

    await expect(service.publish('t1', 'd1', { cmd: 'reset' })).rejects.toThrow(
      BadRequestException,
    );

    expect(loggerError).toHaveBeenCalledWith({
      event: 'command.publish.failed',
      tenantId: 't1',
      deviceId: 'd1',
      commandId: 'c1',
      correlationId: 'corr1',
      outcome: 'failed',
      error: {
        type: 'Error',
        message: 'broker unavailable',
        stack: error.stack,
      },
    });
  });

  it('logs a structured acknowledgement success event', async () => {
    (prisma.deviceCommand.findUnique as jest.Mock).mockResolvedValue({
      id: 'c1',
      tenantId: 't1',
      deviceId: 'd1',
      status: CommandStatus.SENT,
    });
    (prisma.deviceCommand.updateMany as jest.Mock).mockResolvedValue({
      count: 1,
    });

    const loggerLog = jest
      .spyOn((service as any).logger, 'log')
      .mockImplementation();

    await service.acknowledge('t1', 'd1', 'corr1');

    expect(loggerLog).toHaveBeenCalledWith({
      event: 'command.acknowledge.succeeded',
      tenantId: 't1',
      deviceId: 'd1',
      commandId: 'c1',
      correlationId: 'corr1',
      outcome: 'succeeded',
    });
  });

  it('logs a structured acknowledgement rejection event', async () => {
    (prisma.deviceCommand.findUnique as jest.Mock).mockResolvedValue(null);

    const loggerWarn = jest
      .spyOn((service as any).logger, 'warn')
      .mockImplementation();

    await expect(service.acknowledge('t1', 'd1', 'corr1')).rejects.toThrow(
      BadRequestException,
    );

    expect(loggerWarn).toHaveBeenCalledWith({
      event: 'command.acknowledge.rejected',
      tenantId: 't1',
      deviceId: 'd1',
      correlationId: 'corr1',
      outcome: 'rejected',
      commandId: undefined,
      reason: 'command_not_found_or_wrong_device',
    });
  });

  it('records the number of commands transitioned to timed out', async () => {
    (prisma.deviceCommand.updateMany as jest.Mock).mockResolvedValue({
      count: 4,
    });

    await expect(service.markTimedOut(new Date())).resolves.toEqual({
      count: 4,
    });

    expect(metrics.recordCommandLifecycle).toHaveBeenCalledWith('timed_out', 4);
  });
  it('marks a SENT command FAILED when the device returns FAILED', async () => {
    (prisma.deviceCommand.findUnique as jest.Mock).mockResolvedValue({
      id: 'cmd-device-failed',
      tenantId: 't1',
      deviceId: 'd1',
      correlationId: 'corr-device-failed',
      status: CommandStatus.SENT,
    });
    (prisma.deviceCommand.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

    const result = await service.acknowledge(
      't1',
      'd1',
      'corr-device-failed',
      'FAILED',
    );

    expect(prisma.deviceCommand.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: CommandStatus.FAILED }),
      }),
    );
    expect(result.status).toBe(CommandStatus.FAILED);
  });

  it('never regresses a fast terminal ACK back to SENT after broker confirmation', async () => {
    (prisma.device.findFirst as jest.Mock).mockResolvedValue({
      id: 'd1',
      tenantId: 't1',
      status: 'ACTIVE',
      capabilities: [{ key: 'cmd', isWritable: true, dataType: 'string' }],
    });
    (prisma.deviceCommand.create as jest.Mock).mockResolvedValue({
      id: 'c-fast-ack',
      correlationId: 'corr-fast-ack',
      tenantId: 't1',
      deviceId: 'd1',
      status: CommandStatus.PENDING,
      sentAt: null,
      payload: { cmd: 'reset' },
    });
    (prisma.deviceCommand.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
    (prisma.deviceCommand.findUnique as jest.Mock).mockResolvedValue({
      id: 'c-fast-ack',
      correlationId: 'corr-fast-ack',
      tenantId: 't1',
      deviceId: 'd1',
      status: CommandStatus.ACKNOWLEDGED,
      payload: { cmd: 'reset' },
    });

    const result = await service.publish('t1', 'd1', { cmd: 'reset' });

    expect(result.status).toBe(CommandStatus.ACKNOWLEDGED);
    expect(prisma.deviceCommand.updateMany).toHaveBeenCalledWith({
      where: { id: 'c-fast-ack', status: CommandStatus.PENDING },
      data: { status: CommandStatus.SENT, sentAt: expect.any(Date) },
    });
    expect(metrics.recordCommandLifecycle).toHaveBeenCalledWith('sent_state_raced');
  });

  it('does not fabricate FAILED when SENT persistence fails after broker confirmation', async () => {
    (prisma.device.findFirst as jest.Mock).mockResolvedValue({
      id: 'd1',
      tenantId: 't1',
      status: 'ACTIVE',
      capabilities: [{ key: 'cmd', isWritable: true, dataType: 'string' }],
    });
    const created = {
      id: 'c-persist-gap',
      correlationId: 'corr-persist-gap',
      tenantId: 't1',
      deviceId: 'd1',
      status: CommandStatus.PENDING,
      sentAt: null,
      payload: { cmd: 'reset' },
    };
    (prisma.deviceCommand.create as jest.Mock).mockResolvedValue(created);
    (prisma.deviceCommand.updateMany as jest.Mock).mockRejectedValue(
      new Error('database temporarily unavailable'),
    );

    const result = await service.publish('t1', 'd1', { cmd: 'reset' });

    expect(mqttService.publish).toHaveBeenCalledTimes(1);
    expect(result).toEqual(created);
    expect(metrics.recordCommandLifecycle).toHaveBeenCalledWith(
      'sent_persistence_failed',
    );
  });

});
