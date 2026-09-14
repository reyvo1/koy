import { Injectable, Logger } from '@nestjs/common';
import { NotificationService } from './notification.service';

export const WEBHOOK_TRANSPORT_LIMITS = {
  timeoutMs: 10_000,
} as const;

export interface NotificationTransport {
  deliver(input: {
    channel: 'WEBHOOK' | 'EMAIL';
    destination: string;
    subject: string | null;
    body: string;
  }): Promise<void>;
}

/**
 * Module 14 Slice 14.2 — webhook-ready transport. POSTs the notification body
 * to the destination URL with a hard timeout; any non-2xx response or timeout
 * is a failed attempt recorded through NotificationService.recordAttempt.
 */
@Injectable()
export class WebhookTransport implements NotificationTransport {
  private readonly logger = new Logger(WebhookTransport.name);

  constructor(private readonly notifications: NotificationService) {}

  async deliverAndRecord(input: {
    notificationId: string;
    channel: 'WEBHOOK' | 'EMAIL';
    destination: string;
    subject: string | null;
    body: string;
  }): Promise<void> {
    try {
      await this.deliver({
        channel: input.channel,
        destination: input.destination,
        subject: input.subject,
        body: input.body,
      });
      await this.notifications.recordAttempt({
        notificationId: input.notificationId,
        ok: true,
      });
    } catch (error) {
      await this.notifications.recordAttempt({
        notificationId: input.notificationId,
        ok: false,
        errorCode: this.errorCode(error),
      });
    }
  }

  async deliver(input: {
    channel: 'WEBHOOK' | 'EMAIL';
    destination: string;
    subject: string | null;
    body: string;
  }): Promise<void> {
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
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
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
      typeof (error as { code?: unknown }).code === 'string' &&
      /^[A-Z][A-Z0-9_]{0,127}$/.test((error as { code: string }).code)
    ) {
      return (error as { code: string }).code;
    }
    return 'WEBHOOK_UNEXPECTED';
  }
}
