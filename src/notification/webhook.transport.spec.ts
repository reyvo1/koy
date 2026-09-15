import { NotificationService } from './notification.service';
import { WebhookTransport } from './webhook.transport';

describe('WebhookTransport', () => {
  let recordAttempt: jest.Mock;
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
    transport = new WebhookTransport({ recordAttempt } as unknown as NotificationService);
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 }) as any;
  });

  afterEach(() => {
    delete (global as any).fetch;
  });

  it('delivers and completes the same durable lease', async () => {
    await transport.deliverAndRecord(input);

    expect(fetch).toHaveBeenCalledWith(
      input.destination,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
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

  it('records a bounded HTTP error against the same lease', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 }) as any;

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

  it('maps timeout to WEBHOOK_TIMEOUT', async () => {
    global.fetch = jest.fn().mockRejectedValue(new DOMException('aborted', 'AbortError')) as any;

    await expect(transport.deliverAndRecord(input)).rejects.toMatchObject({
      code: 'WEBHOOK_TIMEOUT',
    });

    expect(recordAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: 'WEBHOOK_TIMEOUT' }),
    );
  });
});
