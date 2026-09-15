import { Injectable, Logger } from '@nestjs/common';
import { NotificationService } from './notification.service';

export const WEBHOOK_TRANSPORT_LIMITS = {
  timeoutMs: 10_000,
} as const;

export interface NotificationTransportInput {
  notificationId: string;
  deliveryLeaseId: string;
  channel: 'WEBHOOK' | 'EMAIL';
  destination: string;
  subject: string | null;
  body: string;
}

export interface NotificationTransport {
  deliverAndRecord(input: NotificationTransportInput): Promise<void>;
}

/**
 * HTTPS webhook delivery. Network success is recorded only after a 2xx
 * response and only while the caller still owns the durable delivery lease.
 */
@Injectable()
export class WebhookTransport implements NotificationTransport {
  private readonly logger = new Logger(WebhookTransport.name);

  constructor(private readonly notifications: NotificationService) {}

  async deliverAndRecord(input: NotificationTransportInput): Promise<void> {
    try {
      await this.deliver(input);
    } catch (error) {
      const errorCode = this.errorCode(error);
      await this.notifications.recordAttempt({
        notificationId: input.notificationId,
        deliveryLeaseId: input.deliveryLeaseId,
        ok: false,
        errorCode,
      });
      throw Object.assign(new Error(errorCode), { code: errorCode });
    }

    await this.notifications.recordAttempt({
      notificationId: input.notificationId,
      deliveryLeaseId: input.deliveryLeaseId,
      ok: true,
    });
  }

  async deliver(input: NotificationTransportInput): Promise<void> {
    if (input.channel !== 'WEBHOOK') {
      throw Object.assign(new Error('invalid webhook channel'), {
        code: 'WEBHOOK_CHANNEL_INVALID',
      });
    }
    if (!/^https:\/\/.+/.test(input.destination)) {
      throw Object.assign(new Error('destination must be https'), {
        code: 'WEBHOOK_DESTINATION_INVALID',
      });
    }

    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      WEBHOOK_TRANSPORT_LIMITS.timeoutMs,
    );

    try {
      const response = await fetch(input.destination, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': `iot-notification:${input.notificationId}`,
          'x-iot-notification-id': input.notificationId,
        },
        body: JSON.stringify({
          notificationId: input.notificationId,
          channel: input.channel,
          subject: input.subject,
          body: input.body,
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw Object.assign(
          new Error(`webhook responded ${response.status}`),
          { code: `WEBHOOK_HTTP_${response.status}` },
        );
      }
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        typeof (error as { code?: unknown }).code === 'string'
      ) {
        throw error;
      }
      const code =
        (error as { name?: string })?.name === 'AbortError'
          ? 'WEBHOOK_TIMEOUT'
          : 'WEBHOOK_UNREACHABLE';
      throw Object.assign(new Error(code), { code });
    } finally {
      clearTimeout(timer);
    }
  }

  private errorCode(error: unknown): string {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      typeof (error as { code?: unknown }).code === 'string'
    ) {
      return (error as { code: string }).code;
    }
    this.logger.warn({
      event: 'notification.webhook.unknown_error',
      outcome: 'failed',
    });
    return 'WEBHOOK_UNREACHABLE';
  }
}
