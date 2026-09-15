import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  NotificationTransport,
  NotificationTransportInput,
} from './webhook.transport';
import { NotificationService } from './notification.service';

const EMAIL_RELAY_DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Provider-neutral HTTPS email relay adapter. Wave 2 deliberately avoids a
 * vendor SDK: operators can point this contract at a trusted internal relay or
 * a later Wave 8 provider bridge without changing notification persistence.
 */
@Injectable()
export class EmailRelayTransport implements NotificationTransport {
  private readonly logger = new Logger(EmailRelayTransport.name);

  constructor(
    private readonly notifications: NotificationService,
    private readonly config: ConfigService,
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
      throw Object.assign(new Error(errorCode), { code: errorCode });
    }

    await this.notifications.recordAttempt({
      notificationId: input.notificationId,
      deliveryLeaseId: input.deliveryLeaseId,
      ok: true,
    });
  }

  async deliver(input: NotificationTransportInput): Promise<void> {
    if (input.channel !== 'EMAIL') {
      throw Object.assign(new Error('invalid email channel'), {
        code: 'EMAIL_RELAY_CHANNEL_INVALID',
      });
    }

    const relayUrl = this.config.get<string>('EMAIL_RELAY_URL')?.trim();
    const relayToken = this.config.get<string>('EMAIL_RELAY_TOKEN')?.trim();
    const from = this.config.get<string>('EMAIL_FROM')?.trim();
    const timeoutMs = this.config.get<number>(
      'EMAIL_RELAY_TIMEOUT_MS',
      EMAIL_RELAY_DEFAULT_TIMEOUT_MS,
    );

    if (!relayUrl || !relayToken || !from) {
      throw Object.assign(new Error('email relay is not configured'), {
        code: 'EMAIL_RELAY_NOT_CONFIGURED',
      });
    }

    let url: URL;
    try {
      url = new URL(relayUrl);
    } catch {
      throw Object.assign(new Error('email relay URL is invalid'), {
        code: 'EMAIL_RELAY_URL_INVALID',
      });
    }
    if (url.protocol !== 'https:' || url.username || url.password) {
      throw Object.assign(new Error('email relay URL must use https'), {
        code: 'EMAIL_RELAY_URL_INVALID',
      });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${relayToken}`,
          'content-type': 'application/json',
          'idempotency-key': `iot-notification:${input.notificationId}`,
          'x-iot-notification-id': input.notificationId,
        },
        body: JSON.stringify({
          notificationId: input.notificationId,
          from,
          to: input.destination,
          subject: input.subject ?? '',
          text: input.body,
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw Object.assign(
          new Error(`email relay responded ${response.status}`),
          { code: `EMAIL_RELAY_HTTP_${response.status}` },
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
          ? 'EMAIL_RELAY_TIMEOUT'
          : 'EMAIL_RELAY_UNREACHABLE';
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
      event: 'notification.email_relay.unknown_error',
      outcome: 'failed',
    });
    return 'EMAIL_RELAY_UNREACHABLE';
  }
}
