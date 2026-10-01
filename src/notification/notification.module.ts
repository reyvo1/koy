import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { EmailRelayTransport } from './email-relay.transport';
import { NotificationDeliveryWorker } from './notification-delivery.worker';
import { NotificationHttpsClient } from './notification-https.client';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';
import { WebhookTransport } from './webhook.transport';

@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [NotificationController],
  providers: [
    NotificationService,
    NotificationHttpsClient,
    WebhookTransport,
    EmailRelayTransport,
    NotificationDeliveryWorker,
  ],
  exports: [NotificationService],
})
export class NotificationModule {}
