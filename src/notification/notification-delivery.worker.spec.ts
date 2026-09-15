import { ConfigService } from '@nestjs/config';
import { EmailRelayTransport } from './email-relay.transport';
import { NotificationDeliveryWorker } from './notification-delivery.worker';
import { NotificationService } from './notification.service';
import { WebhookTransport } from './webhook.transport';

describe('NotificationDeliveryWorker', () => {
  const webhookItem = {
    id: 'webhook-1',
    tenantId: 'tenant-1',
    channel: 'WEBHOOK' as const,
    subject: null,
    body: 'hello',
    destination: 'https://hooks.example.com/x',
    deliveryLeaseId: 'lease-webhook',
  };
  const emailItem = {
    id: 'email-1',
    tenantId: 'tenant-1',
    channel: 'EMAIL' as const,
    subject: 'subject',
    body: 'hello',
    destination: 'user@example.com',
    deliveryLeaseId: 'lease-email',
  };

  let notifications: { claimDueBatch: jest.Mock };
  let webhooks: { deliverAndRecord: jest.Mock };
  let emails: { deliverAndRecord: jest.Mock };
  let config: { get: jest.Mock };
  let worker: NotificationDeliveryWorker;

  beforeEach(() => {
    notifications = {
      claimDueBatch: jest.fn().mockResolvedValue({
        recoveredStale: 0,
        items: [webhookItem, emailItem],
      }),
    };
    webhooks = { deliverAndRecord: jest.fn().mockResolvedValue(undefined) };
    emails = { deliverAndRecord: jest.fn().mockResolvedValue(undefined) };
    config = {
      get: jest.fn((key: string, fallback?: unknown) => {
        if (key === 'NOTIFICATION_RUNTIME_ENABLED') return true;
        if (key === 'NOTIFICATION_CLAIM_TIMEOUT_MS') return 60_000;
        return fallback;
      }),
    };
    worker = new NotificationDeliveryWorker(
      notifications as unknown as NotificationService,
      webhooks as unknown as WebhookTransport,
      emails as unknown as EmailRelayTransport,
      config as unknown as ConfigService,
    );
  });

  it('stays inert while notification runtime is disabled', async () => {
    config.get.mockImplementation((key: string, fallback?: unknown) =>
      key === 'NOTIFICATION_RUNTIME_ENABLED' ? false : fallback,
    );

    await worker.tick();

    expect(notifications.claimDueBatch).not.toHaveBeenCalled();
  });

  it('routes each leased row to exactly one channel transport', async () => {
    await worker.tick();

    expect(notifications.claimDueBatch).toHaveBeenCalledWith(25, 60_000);
    expect(webhooks.deliverAndRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        notificationId: 'webhook-1',
        deliveryLeaseId: 'lease-webhook',
        channel: 'WEBHOOK',
      }),
    );
    expect(emails.deliverAndRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        notificationId: 'email-1',
        deliveryLeaseId: 'lease-email',
        channel: 'EMAIL',
      }),
    );
  });

  it('isolates one transport failure and continues the batch', async () => {
    webhooks.deliverAndRecord.mockRejectedValueOnce(new Error('lease lost'));

    await worker.tick();

    expect(emails.deliverAndRecord).toHaveBeenCalledTimes(1);
  });
});
