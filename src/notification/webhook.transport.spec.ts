import {
  NotificationHttpsClient,
  NotificationHttpsError,
} from './notification-https.client';
import { NotificationService } from './notification.service';
import { WebhookTransport } from './webhook.transport';

describe('WebhookTransport', () => {
  let recordAttempt: jest.Mock;
  let postJson: jest.Mock;
  let transport: WebhookTransport;

  const input = {
    notificationId: 'n1',
    deliveryLeaseId: 'lease-1',
    channel: 'WEBHOOK' as const,
    destination: 'https://hooks.example.com/x',
    subject: null,
    body: 'hello',
  };

  beforeEach(() => {
    recordAttempt = jest.fn().mockResolvedValue({});
    postJson = jest.fn().mockResolvedValue({ statusCode: 200 });
    transport = new WebhookTransport(
      { recordAttempt } as unknown as NotificationService,
      { postJson } as unknown as NotificationHttpsClient,
    );
  });

  it('delivers and completes the same durable lease', async () => {
    await transport.deliverAndRecord(input);

    expect(postJson).toHaveBeenCalledWith(
      new URL(input.destination),
      expect.objectContaining({
        'idempotency-key': 'iot-notification:n1',
        'x-iot-notification-id': 'n1',
      }),
      expect.objectContaining({
        notificationId: 'n1',
        channel: 'WEBHOOK',
      }),
      10_000,
    );
    expect(recordAttempt).toHaveBeenCalledWith({
      notificationId: 'n1',
      deliveryLeaseId: 'lease-1',
      ok: true,
    });
  });

  it('records a bounded HTTP error against the same lease', async () => {
    postJson.mockResolvedValue({ statusCode: 503 });

    await expect(transport.deliverAndRecord(input)).rejects.toMatchObject({
      code: 'WEBHOOK_HTTP_503',
    });

    expect(recordAttempt).toHaveBeenCalledWith({
      notificationId: 'n1',
      deliveryLeaseId: 'lease-1',
      ok: false,
      errorCode: 'WEBHOOK_HTTP_503',
    });
  });

  it('maps shared HTTPS TLS failures to terminal WEBHOOK_TLS_INVALID with cause evidence', async () => {
    postJson.mockRejectedValue(
      new NotificationHttpsError('TLS', { code: 'DEPTH_ZERO_SELF_SIGNED_CERT' }),
    );

    await expect(transport.deliverAndRecord(input)).rejects.toMatchObject({
      code: 'WEBHOOK_TLS_INVALID',
      causeCode: 'DEPTH_ZERO_SELF_SIGNED_CERT',
    });
    expect(recordAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: 'WEBHOOK_TLS_INVALID' }),
    );
  });

  it('maps shared HTTPS timeouts without flattening them into unreachable', async () => {
    postJson.mockRejectedValue(
      new NotificationHttpsError('TIMEOUT', { code: 'ETIMEDOUT' }),
    );

    await expect(transport.deliverAndRecord(input)).rejects.toMatchObject({
      code: 'WEBHOOK_TIMEOUT',
      causeCode: 'ETIMEDOUT',
    });
  });

});
