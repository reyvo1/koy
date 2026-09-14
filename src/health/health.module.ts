import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MqttModule } from '../mqtt/mqtt.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({
  imports: [ConfigModule, PrismaModule, RedisModule, MqttModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
