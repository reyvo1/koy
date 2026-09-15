import { ConfigService } from '@nestjs/config';
import { EmailRelayTransport } from './email-relay.transport';
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
  let transport: EmailRelayTransport;

  beforeEach(() => {
    recordAttempt = jest.fn().mockResolvedValue({});
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
    );
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 202 }) as any;
  });

  afterEach(() => {
    delete (global as any).fetch;
  });

  it('posts provider-neutral email payload over HTTPS and completes the lease', async () => {
    await transport.deliverAndRecord(input);

    expect(fetch).toHaveBeenCalledWith(
      new URL('https://relay.example.com/v1/send'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          authorization: 'Bearer relay-secret',
          'idempotency-key': 'iot-notification:n1',
          'x-iot-notification-id': 'n1',
        }),
      }),
    );
    expect(recordAttempt).toHaveBeenCalledWith({
      notificationId: 'n1',
      deliveryLeaseId: 'lease-1',
      ok: true,
    });
  });

  it('records non-2xx relay responses as explicit failure', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 429 }) as any;

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
});
