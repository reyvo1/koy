import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { toStructuredLogError } from '../common/logging/log-error';
import { EmailRelayTransport } from './email-relay.transport';
import {
  NOTIFICATION_LIMITS,
  NotificationService,
} from './notification.service';
import { WebhookTransport } from './webhook.transport';

const NOTIFICATION_TICK_MS = 5_000;

/** Wave 2 — opt-in, leased, bounded notification delivery runtime. */
@Injectable()
export class NotificationDeliveryWorker {
  private readonly logger = new Logger(NotificationDeliveryWorker.name);
  private running = false;

  constructor(
    private readonly notifications: NotificationService,
    private readonly webhooks: WebhookTransport,
    private readonly emails: EmailRelayTransport,
    private readonly config: ConfigService,
  ) {}

  @Interval(NOTIFICATION_TICK_MS)
  async tick(): Promise<void> {
    if (!this.config.get<boolean>('NOTIFICATION_RUNTIME_ENABLED', false)) return;
    if (this.running) {
      this.logger.warn({
        event: 'notification.runtime.tick_skipped',
        outcome: 'overlap',
      });
      return;
    }

    this.running = true;
    let delivered = 0;
    let failed = 0;

    try {
      const claimTimeoutMs = this.config.get<number>(
        'NOTIFICATION_CLAIM_TIMEOUT_MS',
        NOTIFICATION_LIMITS.defaultClaimTimeoutMs,
      );
      const batch = await this.notifications.claimDueBatch(
        NOTIFICATION_LIMITS.defaultDeliveryBatch,
        claimTimeoutMs,
      );

      for (const item of batch.items) {
        try {
          if (item.channel === 'WEBHOOK') {
            await this.webhooks.deliverAndRecord({
              notificationId: item.id,
              deliveryLeaseId: item.deliveryLeaseId,
              channel: item.channel,
              destination: item.destination,
              subject: item.subject,
              body: item.body,
            });
          } else {
            await this.emails.deliverAndRecord({
              notificationId: item.id,
              deliveryLeaseId: item.deliveryLeaseId,
              channel: item.channel,
              destination: item.destination,
              subject: item.subject,
              body: item.body,
            });
          }
          delivered += 1;
        } catch (error) {
          failed += 1;
          this.logger.error({
            event: 'notification.runtime.delivery_failed',
            outcome: 'failed',
            notificationId: item.id,
            channel: item.channel,
            error: toStructuredLogError(error),
          });
        }
      }

      if (batch.recoveredStale > 0 || batch.items.length > 0) {
        this.logger.log({
          event: 'notification.runtime.tick_completed',
          outcome: failed === 0 ? 'succeeded' : 'partially_failed',
          recoveredStale: batch.recoveredStale,
          claimed: batch.items.length,
          delivered,
          failed,
        });
      }
    } catch (error) {
      this.logger.error({
        event: 'notification.runtime.tick_failed',
        outcome: 'failed',
        error: toStructuredLogError(error),
      });
    } finally {
      this.running = false;
    }
  }
}
