import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { EmailRelayTransport } from './email-relay.transport';
import { NotificationDeliveryWorker } from './notification-delivery.worker';
import { NotificationService } from './notification.service';
import { WebhookTransport } from './webhook.transport';

@Module({
  imports: [ConfigModule, PrismaModule],
  providers: [
    NotificationService,
    WebhookTransport,
    EmailRelayTransport,
    NotificationDeliveryWorker,
  ],
  exports: [NotificationService],
})
export class NotificationModule {}
