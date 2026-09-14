import { WebhookTransport } from './webhook.transport';
import { NotificationService } from './notification.service';

describe('WebhookTransport', () => {
  let recordAttempt: jest.Mock;
  let transport: WebhookTransport;
  const okResponse = { ok: true, status: 200 };

  beforeEach(() => {
    recordAttempt = jest.fn().mockResolvedValue({});
    transport = new WebhookTransport({
      recordAttempt,
    } as unknown as NotificationService);
    global.fetch = (jest.fn().mockResolvedValue(okResponse) as any);
  });

  afterEach(() => {
    delete (global as any).fetch;
  });

  it('delivers and records a successful attempt', async () => {
    await transport.deliverAndRecord({
      notificationId: 'n1',
      channel: 'WEBHOOK',
      destination: 'https://hooks.example.com/x',
      subject: null,
      body: 'hello',
    });

    expect(fetch).toHaveBeenCalledWith(
      'https://hooks.example.com/x',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(recordAttempt).toHaveBeenCalledWith({
      notificationId: 'n1',
      ok: true,
    });
  });

  it('rejects non-https destinations before any network call', async () => {
    await transport.deliverAndRecord({
      notificationId: 'n1',
      channel: 'WEBHOOK',
      destination: 'http://insecure.example.com',
      subject: null,
      body: 'hello',
    });

    expect(recordAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: false,
        errorCode: 'WEBHOOK_DESTINATION_INVALID',
      }),
    );
  });

  it('records a bounded HTTP error code on non-2xx responses', async () => {
    global.fetch = (jest.fn().mockResolvedValue({ ok: false, status: 503 }) as any);

    await transport.deliverAndRecord({
      notificationId: 'n1',
      channel: 'WEBHOOK',
      destination: 'https://hooks.example.com/x',
      subject: null,
      body: 'hello',
    });

    expect(recordAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ ok: false, errorCode: 'WEBHOOK_HTTP_503' }),
    );
  });

  it('maps timeouts to WEBHOOK_TIMEOUT', async () => {
    const abort = new DOMException('aborted', 'AbortError');
    global.fetch = (jest.fn().mockRejectedValue(abort) as any);

    await transport.deliverAndRecord({
      notificationId: 'n1',
      channel: 'WEBHOOK',
      destination: 'https://hooks.example.com/x',
      subject: null,
      body: 'hello',
    });

    expect(recordAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ ok: false, errorCode: 'WEBHOOK_TIMEOUT' }),
    );
  });
});
