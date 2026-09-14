import { Test, TestingModule } from '@nestjs/testing';
import { MqttService } from '../mqtt/mqtt.service';
import { PrismaService } from '../prisma/prisma.service';
import { HealthModule } from './health.module';
import { HealthService } from './health.service';

describe('HealthModule', () => {
  it('should resolve the health dependency graph', async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [HealthModule],
    })
      .overrideProvider(PrismaService)
      .useValue({ $queryRaw: jest.fn() })
      .overrideProvider('REDIS_CLIENT')
      .useValue({
        status: 'ready',
        ping: jest.fn(),
        quit: jest.fn().mockResolvedValue('OK'),
        disconnect: jest.fn(),
      })
      .overrideProvider(MqttService)
      .useValue({ getTransportReadiness: jest.fn() })
      .compile();

    expect(module.get<HealthService>(HealthService)).toBeDefined();

    await module.close();
  });
});
