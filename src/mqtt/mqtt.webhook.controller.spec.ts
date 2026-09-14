import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { MqttService } from './mqtt.service';
import { MqttWebhookController } from './mqtt.webhook.controller';

describe('MqttWebhookController', () => {
  let controller: MqttWebhookController;
  let mqttService: MqttService;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MqttWebhookController],
      providers: [
        {
          provide: MqttService,
          useValue: {
            authenticateForBroker: jest.fn(),
            authorize: jest.fn(),
            handleAck: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('secret') },
        },
      ],
    }).compile();

    controller = module.get<MqttWebhookController>(MqttWebhookController);
    mqttService = module.get<MqttService>(MqttService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('auth: publisher service account receives command-only ACL', async () => {
    (configService.get as jest.Mock).mockImplementation((key: string) => {
      if (key === 'MQTT_WEBHOOK_SECRET') return 'secret';
      if (key === 'MQTT_USERNAME') return 'platform-publisher';
      if (key === 'MQTT_PASSWORD') return 'publisher-password';
      return undefined;
    });

    const result = await controller.auth('secret', {
      username: 'platform-publisher',
      password: 'publisher-password',
    });

    expect(result).toEqual({
      result: 'allow',
      is_superuser: false,
      acl: [
        {
          permission: 'allow',
          action: 'publish',
          topic: 'tenants/+/devices/+/commands',
        },
        { permission: 'deny', action: 'all', topic: '#' },
      ],
    });
    expect(mqttService.authenticateForBroker).not.toHaveBeenCalled();
  });

  it('auth: wrong publisher password is denied without device fallback', async () => {
    (configService.get as jest.Mock).mockImplementation((key: string) => {
      if (key === 'MQTT_WEBHOOK_SECRET') return 'secret';
      if (key === 'MQTT_USERNAME') return 'platform-publisher';
      if (key === 'MQTT_PASSWORD') return 'publisher-password';
      return undefined;
    });

    await expect(
      controller.auth('secret', {
        username: 'platform-publisher',
        password: 'wrong-password',
      }),
    ).resolves.toEqual({ result: 'deny' });
    expect(mqttService.authenticateForBroker).not.toHaveBeenCalled();
  });

  it('auth: valid secret returns device-bound EMQX 5.8 ACL', async () => {
    (mqttService.authenticateForBroker as jest.Mock).mockResolvedValue({
      authenticated: true,
      tenantId: 't1',
    });

    const result = await controller.auth('secret', {
      username: 'd1',
      password: 'p1',
    });

    expect(result).toEqual({
      result: 'allow',
      is_superuser: false,
      acl: [
        {
          permission: 'allow',
          action: 'publish',
          topic: 'eq tenants/t1/devices/d1/telemetry',
        },
        {
          permission: 'allow',
          action: 'publish',
          topic: 'eq tenants/t1/devices/d1/commands/ack',
        },
        {
          permission: 'allow',
          action: 'subscribe',
          topic: 'eq tenants/t1/devices/d1/commands',
        },
        { permission: 'deny', action: 'all', topic: '#' },
      ],
    });
  });

  it('auth: invalid device credentials return deny without ACL', async () => {
    (mqttService.authenticateForBroker as jest.Mock).mockResolvedValue({
      authenticated: false,
    });

    await expect(
      controller.auth('secret', { username: 'd1', password: 'bad' }),
    ).resolves.toEqual({ result: 'deny' });
  });

  it('auth: invalid webhook secret rejects', async () => {
    await expect(
      controller.auth('wrong', { username: 'd1', password: 'p1' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('auth: missing server webhook secret fails closed', async () => {
    (configService.get as jest.Mock).mockReturnValue(undefined);

    await expect(
      controller.auth(undefined as unknown as string, {
        username: 'd1',
        password: 'p1',
      }),
    ).rejects.toThrow(UnauthorizedException);
    expect(mqttService.authenticateForBroker).not.toHaveBeenCalled();
  });

  it('acl: valid secret accepts', async () => {
    (mqttService.authorize as jest.Mock).mockResolvedValue(true);
    const result = await controller.acl('secret', {
      username: 'd1',
      topic: 't1',
      action: 'publish',
    });
    expect(result).toEqual({ result: 'allow' });
  });

  it('acl: invalid secret rejects', async () => {
    await expect(
      controller.acl('wrong', {
        username: 'd1',
        topic: 't1',
        action: 'publish',
      }),
    ).rejects.toThrow(UnauthorizedException);
  });
});
