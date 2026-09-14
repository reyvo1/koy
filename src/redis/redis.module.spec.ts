import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import Redis from 'ioredis';
import { RedisModule } from './redis.module';

jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    quit: jest.fn(),
  })),
}));

describe('RedisModule', () => {
  let redisClient: Redis;
  const mockRedisUrl = 'redis://localhost:6379';
  const mockedRedis = Redis as unknown as jest.Mock;

  beforeEach(async () => {
    mockedRedis.mockClear();

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              REDIS_URL: mockRedisUrl,
            }),
          ],
        }),
        RedisModule,
      ],
    }).compile();

    redisClient = module.get<Redis>('REDIS_CLIENT');
  });

  it('should be defined', () => {
    expect(redisClient).toBeDefined();
  });

  it('should instantiate Redis with the correct URL', () => {
    expect(mockedRedis).toHaveBeenCalledWith(mockRedisUrl);
  });
});
