import { Test, TestingModule } from '@nestjs/testing';
import { MqttTelemetryWebhookController } from './mqtt.webhook.controller';
import { TelemetryService } from '../telemetry/telemetry.service';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';

describe('MqttTelemetryWebhookController', () => {
  let controller: MqttTelemetryWebhookController;
  let telemetryService: TelemetryService;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MqttTelemetryWebhookController],
      providers: [
        { provide: TelemetryService, useValue: { ingest: jest.fn() } },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('secret') },
        },
      ],
    }).compile();

    controller = module.get<MqttTelemetryWebhookController>(
      MqttTelemetryWebhookController,
    );
    telemetryService = module.get<TelemetryService>(TelemetryService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('missing server webhook secret fails closed', async () => {
    (configService.get as jest.Mock).mockReturnValue(undefined);

    await expect(
      controller.ingest(undefined as unknown as string, {
        topic: 'tenants/t1/devices/d1/telemetry',
        eventId: 'evt-001',
        payload: { temp: 25 },
      }),
    ).rejects.toThrow(UnauthorizedException);
    expect(telemetryService.ingest).not.toHaveBeenCalled();
  });

  const cases = [
    {
      name: 'valid secret + valid topic',
      secret: 'secret',
      topic: 'tenants/t1/devices/d1/telemetry',
      eventId: 'evt-001',
      payload: { temp: 25 },
      expected: {
        tenantId: 't1',
        deviceId: 'd1',
        eventId: 'evt-001',
        payload: { temp: 25 },
      },
    },
    {
      name: 'invalid secret rejected',
      secret: 'wrong',
      topic: 'tenants/t1/devices/d1/telemetry',
      eventId: 'evt-001',
      payload: { temp: 25 },
      error: UnauthorizedException,
    },
    {
      name: 'malformed topic rejected',
      secret: 'secret',
      topic: 'malformed/topic',
      eventId: 'evt-001',
      payload: { temp: 25 },
      error: BadRequestException,
    },
    {
      name: 'too few segments rejected',
      secret: 'secret',
      topic: 'tenants/t1/devices/d1',
      eventId: 'evt-001',
      payload: { temp: 25 },
      error: BadRequestException,
    },
    {
      name: 'too many segments rejected',
      secret: 'secret',
      topic: 'tenants/t1/devices/d1/telemetry/extra',
      eventId: 'evt-001',
      payload: { temp: 25 },
      error: BadRequestException,
    },
    {
      name: 'wrong tenants segment rejected',
      secret: 'secret',
      topic: 'wrong/t1/devices/d1/telemetry',
      eventId: 'evt-001',
      payload: { temp: 25 },
      error: BadRequestException,
    },
    {
      name: 'wrong devices segment rejected',
      secret: 'secret',
      topic: 'tenants/t1/wrong/d1/telemetry',
      eventId: 'evt-001',
      payload: { temp: 25 },
      error: BadRequestException,
    },
    {
      name: 'wrong telemetry segment rejected',
      secret: 'secret',
      topic: 'tenants/t1/devices/d1/wrong',
      eventId: 'evt-001',
      payload: { temp: 25 },
      error: BadRequestException,
    },
    {
      name: 'empty object rejected',
      secret: 'secret',
      topic: 'tenants/t1/devices/d1/telemetry',
      eventId: 'evt-001',
      payload: {},
      error: BadRequestException,
    },
    {
      name: 'array rejected',
      secret: 'secret',
      topic: 'tenants/t1/devices/d1/telemetry',
      eventId: 'evt-001',
      payload: [],
      error: BadRequestException,
    },
    {
      name: 'null rejected',
      secret: 'secret',
      topic: 'tenants/t1/devices/d1/telemetry',
      eventId: 'evt-001',
      payload: null,
      error: BadRequestException,
    },
    {
      name: 'primitive rejected',
      secret: 'secret',
      topic: 'tenants/t1/devices/d1/telemetry',
      eventId: 'evt-001',
      payload: 123,
      error: BadRequestException,
    },
  ];

  cases.forEach((c) => {
    it(c.name, async () => {
      if (c.error) {
        await expect(
          controller.ingest(c.secret, {
            topic: c.topic,
            eventId: c.eventId,
            payload: c.payload,
          }),
        ).rejects.toThrow(c.error);
      } else {
        await controller.ingest(c.secret, {
          topic: c.topic,
          eventId: c.eventId,
          payload: c.payload,
        });

        expect(telemetryService.ingest).toHaveBeenCalledWith(
          c.expected.tenantId,
          c.expected.deviceId,
          c.expected.eventId,
          c.expected.payload,
        );
      }
    });
  });

  it('payload tenantId cannot override topic tenantId', async () => {
    const payload = { temp: 25, tenantId: 't999' };

    await controller.ingest('secret', {
      topic: 'tenants/t1/devices/d1/telemetry',
      eventId: 'evt-001',
      payload,
    });

    expect(telemetryService.ingest).toHaveBeenCalledWith(
      't1',
      'd1',
      'evt-001',
      payload,
    );
  });

  it('payload deviceId cannot override topic deviceId', async () => {
    const payload = { temp: 25, deviceId: 'd999' };

    await controller.ingest('secret', {
      topic: 'tenants/t1/devices/d1/telemetry',
      eventId: 'evt-001',
      payload,
    });

    expect(telemetryService.ingest).toHaveBeenCalledWith(
      't1',
      'd1',
      'evt-001',
      payload,
    );
  });
  it('null webhook body rejected', async () => {
    await expect(controller.ingest('secret', null)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('non-string topic rejected', async () => {
    await expect(
      controller.ingest('secret', {
        topic: 123,
        eventId: 'evt-001',
        payload: { temp: 25 },
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('empty tenantId in topic rejected', async () => {
    await expect(
      controller.ingest('secret', {
        topic: 'tenants//devices/d1/telemetry',
        eventId: 'evt-001',
        payload: { temp: 25 },
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('empty deviceId in topic rejected', async () => {
    await expect(
      controller.ingest('secret', {
        topic: 'tenants/t1/devices//telemetry',
        eventId: 'evt-001',
        payload: { temp: 25 },
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('blank eventId rejected', async () => {
    await expect(
      controller.ingest('secret', {
        topic: 'tenants/t1/devices/d1/telemetry',
        eventId: '   ',
        payload: { temp: 25 },
      }),
    ).rejects.toThrow(BadRequestException);
  });
});
