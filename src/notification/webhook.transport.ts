import { Injectable, Logger } from '@nestjs/common';
import {
  NotificationHttpsClient,
  NotificationHttpsError,
} from './notification-https.client';
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

@Injectable()
export class WebhookTransport implements NotificationTransport {
  private readonly logger = new Logger(WebhookTransport.name);

  constructor(
    private readonly notifications: NotificationService,
    private readonly https: NotificationHttpsClient,
  ) {}

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
      throw this.deliveryError(errorCode, error);
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

    let destination: URL;
    try {
      destination = new URL(input.destination);
    } catch {
      throw Object.assign(new Error('destination must be valid https'), {
        code: 'WEBHOOK_DESTINATION_INVALID',
      });
    }
    if (
      destination.protocol !== 'https:' ||
      destination.username ||
      destination.password
    ) {
      throw Object.assign(new Error('destination must be credential-free https'), {
        code: 'WEBHOOK_DESTINATION_INVALID',
      });
    }

    const response = await this.https.postJson(
      destination,
      {
        'content-type': 'application/json',
        'idempotency-key': `iot-notification:${input.notificationId}`,
        'x-iot-notification-id': input.notificationId,
      },
      {
        notificationId: input.notificationId,
        channel: input.channel,
        subject: input.subject,
        body: input.body,
      },
      WEBHOOK_TRANSPORT_LIMITS.timeoutMs,
    );

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Object.assign(
        new Error(`webhook responded ${response.statusCode}`),
        { code: `WEBHOOK_HTTP_${response.statusCode}` },
      );
    }
  }

  private errorCode(error: unknown): string {
    if (error instanceof NotificationHttpsError) {
      if (error.kind === 'TIMEOUT') return 'WEBHOOK_TIMEOUT';
      if (error.kind === 'TLS') return 'WEBHOOK_TLS_INVALID';
      return 'WEBHOOK_UNREACHABLE';
    }
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

  private deliveryError(errorCode: string, cause: unknown): Error {
    const error = Object.assign(new Error(errorCode), {
      code: errorCode,
      causeCode:
        cause instanceof NotificationHttpsError ? cause.causeCode : undefined,
    });
    if (cause instanceof Error) {
      (error as Error & { cause?: unknown }).cause = cause;
    }
    return error;
  }
}
