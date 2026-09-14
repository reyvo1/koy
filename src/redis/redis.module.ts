import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { RedisLifecycleService } from './redis-lifecycle.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: 'REDIS_CLIENT',
      useFactory: (configService: ConfigService) => {
        const redisUrl = configService.get<string>('REDIS_URL');
        return new Redis(redisUrl);
      },
      inject: [ConfigService],
    },
    RedisLifecycleService,
  ],
  exports: ['REDIS_CLIENT'],
})
export class RedisModule {}
