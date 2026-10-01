import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PublicApiModule } from '../public-api/public-api.module';
import { WebhookController } from './webhook.controller';
import {
  WebhookDispatchService,
  WebhookRepository,
} from './webhook-runtime.service';

/**
 * The webhook runtime, wired explicitly.
 *
 * `PublicApiModule` is imported rather than assumed: `WebhookDispatchService` calls
 * `PublicApiService.signWebhookPayload`, and Nest resolves dependency injection per module, so
 * a service that is registered in `AppModule` is still not injectable here. A green build does
 * not catch that — only a boot does.
 */
@Module({
  imports: [PrismaModule, PublicApiModule],
  controllers: [WebhookController],
  providers: [WebhookRepository, WebhookDispatchService],
  exports: [WebhookRepository, WebhookDispatchService],
})
export class WebhookModule {}
