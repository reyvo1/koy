import { BadRequestException } from '@nestjs/common';
import { DeviceStatus } from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';
import { CommandService } from '../device/command.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  MQTT_PUBLISHER_TRANSPORT,
  MqttPublisherTransport,
} from './mqtt-publisher.transport';
import { MqttService } from './mqtt.service';

describe('MqttService', () => {
  let service: MqttService;
  let commandService: CommandService;
  let prisma: PrismaService;
  let publisherTransport: jest.Mocked<MqttPublisherTransport>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MqttService,
        {
          provide: PrismaService,
          useValue: {
            device: {
              findUnique: jest.fn(),
            },
          },
        },
        { provide: CommandService, useValue: { acknowledge: jest.fn() } },
        {
          provide: MQTT_PUBLISHER_TRANSPORT,
          useValue: {
            publish: jest.fn().mockResolvedValue(undefined),
            getReadiness: jest.fn().mockReturnValue({
              ready: false,
              reason: 'publisher_not_configured',
            }),
            shutdown: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<MqttService>(MqttService);
    commandService = module.get<CommandService>(CommandService);
    prisma = module.get<PrismaService>(PrismaService);
    publisherTransport = module.get(MQTT_PUBLISHER_TRANSPORT);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const cases = [
    {
      name: 'valid ACK topic + valid payload',
      topic: 'tenants/t1/devices/d1/commands/ack',
      payload: { commandId: 'c1' },
      expected: ['t1', 'd1', 'c1'],
    },
    {
      name: 'too few segments',
      topic: 'tenants/t1/devices/d1/ack',
      payload: { commandId: 'c1' },
      error: BadRequestException,
    },
    {
      name: 'too many segments',
      topic: 'tenants/t1/devices/d1/commands/ack/extra',
      payload: { commandId: 'c1' },
      error: BadRequestException,
    },
    {
      name: 'wrong tenants segment',
      topic: 'wrong/t1/devices/d1/commands/ack',
      payload: { commandId: 'c1' },
      error: BadRequestException,
    },
    {
      name: 'empty tenantId',
      topic: 'tenants//devices/d1/commands/ack',
      payload: { commandId: 'c1' },
      error: BadRequestException,
    },
    {
      name: 'wrong devices segment',
      topic: 'tenants/t1/wrong/d1/commands/ack',
      payload: { commandId: 'c1' },
      error: BadRequestException,
    },
    {
      name: 'empty deviceId',
      topic: 'tenants/t1/devices//commands/ack',
      payload: { commandId: 'c1' },
      error: BadRequestException,
    },
    {
      name: 'wrong commands segment',
      topic: 'tenants/t1/devices/d1/wrong/ack',
      payload: { commandId: 'c1' },
      error: BadRequestException,
    },
    {
      name: 'wrong ack segment',
      topic: 'tenants/t1/devices/d1/commands/wrong',
      payload: { commandId: 'c1' },
      error: BadRequestException,
    },
    {
      name: 'null payload',
      topic: 'tenants/t1/devices/d1/commands/ack',
      payload: null,
      error: BadRequestException,
    },
    {
      name: 'array payload',
      topic: 'tenants/t1/devices/d1/commands/ack',
      payload: [],
      error: BadRequestException,
    },
    {
      name: 'primitive payload',
      topic: 'tenants/t1/devices/d1/commands/ack',
      payload: 123,
      error: BadRequestException,
    },
    {
      name: 'empty object',
      topic: 'tenants/t1/devices/d1/commands/ack',
      payload: {},
      error: BadRequestException,
    },
    {
      name: 'missing commandId',
      topic: 'tenants/t1/devices/d1/commands/ack',
      payload: { foo: 'bar' },
      error: BadRequestException,
    },
    {
      name: 'empty commandId',
      topic: 'tenants/t1/devices/d1/commands/ack',
      payload: { commandId: '' },
      error: BadRequestException,
    },
    {
      name: 'whitespace commandId',
      topic: 'tenants/t1/devices/d1/commands/ack',
      payload: { commandId: '   ' },
      error: BadRequestException,
    },
    {
      name: 'non-string commandId',
      topic: 'tenants/t1/devices/d1/commands/ack',
      payload: { commandId: 123 },
      error: BadRequestException,
    },
  ];

  cases.forEach((testCase) => {
    it(testCase.name, async () => {
      if (testCase.error) {
        await expect(
          service.handleAck(testCase.topic, testCase.payload),
        ).rejects.toThrow(testCase.error);
      } else {
        await service.handleAck(testCase.topic, testCase.payload);
        expect(commandService.acknowledge).toHaveBeenCalledWith(
          ...testCase.expected,
        );
      }
    });
  });

  it('routes FAILED device result to command failure transition', async () => {
    await service.handleAck('tenants/t1/devices/d1/commands/ack', {
      commandId: 'c-failed',
      status: 'FAILED',
      reason: 'relay jammed',
    });

    expect(commandService.acknowledge).toHaveBeenCalledWith(
      't1',
      'd1',
      'c-failed',
      'FAILED',
    );
  });

  it('rejects unknown ACK status', async () => {
    await expect(
      service.handleAck('tenants/t1/devices/d1/commands/ack', {
        commandId: 'c1',
        status: 'MAYBE',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('payload tenantId cannot override topic tenantId', async () => {
    await service.handleAck('tenants/t1/devices/d1/commands/ack', {
      commandId: 'c1',
      tenantId: 't999',
    });
    expect(commandService.acknowledge).toHaveBeenCalledWith('t1', 'd1', 'c1');
  });

  it('payload deviceId cannot override topic deviceId', async () => {
    await service.handleAck('tenants/t1/devices/d1/commands/ack', {
      commandId: 'c1',
      deviceId: 'd999',
    });
    expect(commandService.acknowledge).toHaveBeenCalledWith('t1', 'd1', 'c1');
  });

  it('logs MQTT publish request without logging the message payload', async () => {
    const loggerLog = jest
      .spyOn((service as any).logger, 'log')
      .mockImplementation();

    await service.publish('tenants/t1/devices/d1/commands', {
      secretCommand: true,
    });

    expect(loggerLog).toHaveBeenCalledWith({
      event: 'mqtt.publish.requested',
      topic: 'tenants/t1/devices/d1/commands',
      outcome: 'accepted',
    });
    expect(loggerLog.mock.calls[0][0]).not.toHaveProperty('message');
    expect(loggerLog.mock.calls[0][0]).not.toHaveProperty('payload');
    expect(publisherTransport.publish).toHaveBeenCalledWith(
      'tenants/t1/devices/d1/commands',
      { secretCommand: true },
    );
  });

  it('logs a structured ACK received event', async () => {
    const loggerLog = jest
      .spyOn((service as any).logger, 'log')
      .mockImplementation();

    await service.handleAck('tenants/t1/devices/d1/commands/ack', {
      commandId: 'corr-1',
    });

    expect(loggerLog).toHaveBeenCalledWith({
      event: 'mqtt.ack.received',
      tenantId: 't1',
      deviceId: 'd1',
      correlationId: 'corr-1',
      outcome: 'accepted',
    });
    expect(commandService.acknowledge).toHaveBeenCalledWith(
      't1',
      'd1',
      'corr-1',
    );
  });

  it('logs malformed ACK topics without logging the raw topic', async () => {
    const loggerWarn = jest
      .spyOn((service as any).logger, 'warn')
      .mockImplementation();

    await expect(
      service.handleAck('untrusted/raw/topic', { commandId: 'corr-1' }),
    ).rejects.toThrow(BadRequestException);

    expect(loggerWarn).toHaveBeenCalledWith({
      event: 'mqtt.ack.rejected',
      tenantId: undefined,
      deviceId: undefined,
      outcome: 'rejected',
      reason: 'malformed_topic',
    });
    expect(loggerWarn.mock.calls[0][0]).not.toHaveProperty('topic');
  });

  it('returns the authenticated device tenant identity for broker ACL binding', async () => {
    (prisma.device.findUnique as jest.Mock).mockResolvedValue({
      id: 'd1',
      tenantId: 't1',
      status: DeviceStatus.ACTIVE,
      credential: { passwordHash: 'stored-hash' },
    });
    jest.spyOn(argon2, 'verify').mockResolvedValue(true);

    await expect(
      service.authenticateForBroker('d1', 'device-secret'),
    ).resolves.toEqual({ authenticated: true, tenantId: 't1' });
  });

  it('logs a structured authentication denial', async () => {
    (prisma.device.findUnique as jest.Mock).mockResolvedValue(null);

    const loggerWarn = jest
      .spyOn((service as any).logger, 'warn')
      .mockImplementation();

    await expect(service.authenticate('d1', 'device-secret')).resolves.toBe(
      false,
    );

    expect(loggerWarn).toHaveBeenCalledWith({
      event: 'mqtt.auth.denied',
      tenantId: undefined,
      deviceId: 'd1',
      outcome: 'denied',
      reason: 'device_not_found',
    });
    expect(loggerWarn.mock.calls[0][0]).not.toHaveProperty('secret');
  });

  it.each([
    ['publish', 'tenants/t1/devices/d1/telemetry'],
    ['publish', 'tenants/t1/devices/d1/commands/ack'],
    ['subscribe', 'tenants/t1/devices/d1/commands'],
  ] as const)('allows device %s on canonical topic %s', async (action, topic) => {
    (prisma.device.findUnique as jest.Mock).mockResolvedValue({
      id: 'd1',
      tenantId: 't1',
      status: DeviceStatus.ACTIVE,
    });

    await expect(service.authorize('d1', topic, action)).resolves.toBe(true);
  });

  it('logs a structured ACL denial', async () => {
    (prisma.device.findUnique as jest.Mock).mockResolvedValue({
      id: 'd1',
      tenantId: 't1',
      status: DeviceStatus.ACTIVE,
    });

    const loggerWarn = jest
      .spyOn((service as any).logger, 'warn')
      .mockImplementation();

    await expect(
      service.authorize('d1', 'tenants/t1/devices/d1/commands', 'publish'),
    ).resolves.toBe(false);

    expect(loggerWarn).toHaveBeenCalledWith({
      event: 'mqtt.acl.denied',
      tenantId: 't1',
      deviceId: 'd1',
      topic: 'tenants/t1/devices/d1/commands',
      action: 'publish',
      outcome: 'denied',
      reason: 'topic_not_allowed',
    });
  });
  describe('transport readiness', () => {
    it('delegates transport readiness without changing its reason', () => {
      expect(service.getTransportReadiness()).toEqual({
        ready: false,
        reason: 'publisher_not_configured',
      });
    });
  });
});
