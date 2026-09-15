import { ConfigService } from '@nestjs/config';
import { EmailRelayTransport } from './email-relay.transport';
import {
  NotificationHttpsClient,
  NotificationHttpsError,
} from './notification-https.client';
import { NotificationService } from './notification.service';

describe('EmailRelayTransport', () => {
  const input = {
    notificationId: 'n1',
    deliveryLeaseId: 'lease-1',
    channel: 'EMAIL' as const,
    destination: 'user@example.com',
    subject: 'Verify account',
    body: 'Verification token: abc',
  };

  let recordAttempt: jest.Mock;
  let postJson: jest.Mock;
  let transport: EmailRelayTransport;

  beforeEach(() => {
    recordAttempt = jest.fn().mockResolvedValue({});
    postJson = jest.fn().mockResolvedValue({ statusCode: 202 });
    const values: Record<string, unknown> = {
      EMAIL_RELAY_URL: 'https://relay.example.com/v1/send',
      EMAIL_RELAY_TOKEN: 'relay-secret',
      EMAIL_FROM: 'no-reply@example.com',
      EMAIL_RELAY_TIMEOUT_MS: 10_000,
    };
    const config = {
      get: jest.fn((key: string, fallback?: unknown) => values[key] ?? fallback),
    };
    transport = new EmailRelayTransport(
      { recordAttempt } as unknown as NotificationService,
      config as unknown as ConfigService,
      { postJson } as unknown as NotificationHttpsClient,
    );
  });

  it('posts provider-neutral email payload over HTTPS and completes the lease', async () => {
    await transport.deliverAndRecord(input);

    expect(postJson).toHaveBeenCalledWith(
      new URL('https://relay.example.com/v1/send'),
      expect.objectContaining({
        authorization: 'Bearer relay-secret',
        'idempotency-key': 'iot-notification:n1',
        'x-iot-notification-id': 'n1',
      }),
      expect.objectContaining({
        to: 'user@example.com',
        text: 'Verification token: abc',
      }),
      10_000,
    );
    expect(recordAttempt).toHaveBeenCalledWith({
      notificationId: 'n1',
      deliveryLeaseId: 'lease-1',
      ok: true,
    });
  });

  it('records non-2xx relay responses as explicit failure', async () => {
    postJson.mockResolvedValue({ statusCode: 429 });

    await expect(transport.deliverAndRecord(input)).rejects.toMatchObject({
      code: 'EMAIL_RELAY_HTTP_429',
    });

    expect(recordAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: false,
        errorCode: 'EMAIL_RELAY_HTTP_429',
      }),
    );
  });

  it('maps shared HTTPS TLS failures to terminal EMAIL_RELAY_TLS_INVALID', async () => {
    postJson.mockRejectedValue(
      new NotificationHttpsError('TLS', { code: 'CERT_HAS_EXPIRED' }),
    );

    await expect(transport.deliverAndRecord(input)).rejects.toMatchObject({
      code: 'EMAIL_RELAY_TLS_INVALID',
      causeCode: 'CERT_HAS_EXPIRED',
    });
    expect(recordAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: 'EMAIL_RELAY_TLS_INVALID' }),
    );
  });

});
