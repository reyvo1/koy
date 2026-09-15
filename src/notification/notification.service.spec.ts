import { NotificationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from './notification.service';

const tenantId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const databaseNow = new Date('2026-09-15T06:30:00.000Z');

describe('NotificationService Wave 2 runtime', () => {
  let notificationRow: Record<string, any>;
  let notification: {
    findUnique: jest.Mock;
    create: jest.Mock;
    updateMany: jest.Mock;
    findMany: jest.Mock;
  };
  let tx: Record<string, any>;
  let service: NotificationService;

  beforeEach(() => {
    notificationRow = {
      id: 'n1',
      tenantId,
      channel: 'WEBHOOK',
      subject: null,
      body: 'hello',
      destination: 'https://hooks.example.com/x',
      status: NotificationStatus.DELIVERING,
      attemptCount: 0,
      lastErrorCode: null,
      nextRetryAt: null,
      deliveryLeaseId: 'lease-1',
      deliveryLeaseAt: databaseNow,
      sentAt: null,
    };
    notification = {
      findUnique: jest.fn().mockImplementation(({ where }) => {
        if (where.tenantId_idempotencyKey) return Promise.resolve(null);
        return Promise.resolve(notificationRow);
      }),
      create: jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({ id: 'n1', ...data }),
      ),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue([]),
    };
    tx = {
      notification,
      $queryRaw: jest.fn().mockResolvedValue([{ databaseNow }]),
    };
    service = new NotificationService({
      notification,
      $transaction: jest.fn(async (callback) => callback(tx)),
    } as unknown as PrismaService);
  });

  it('enqueues a new webhook notification idempotently', async () => {
    const result = await service.enqueue({
      tenantId,
      channel: 'WEBHOOK',
      body: 'hello',
      destination: 'https://hooks.example.com/x',
      idempotencyKey: 'key-12345678',
    });

    expect(result).toEqual({ created: true, notificationId: 'n1' });
    expect(notification.create).toHaveBeenCalledTimes(1);
  });

  it('replays an existing idempotency key without creating a duplicate', async () => {
    notification.findUnique.mockResolvedValueOnce({
      id: 'existing',
      channel: 'WEBHOOK',
      destination: 'https://hooks.example.com/x',
      subject: null,
      body: 'hello',
      templateKey: null,
    });

    await expect(
      service.enqueue({
        tenantId,
        channel: 'WEBHOOK',
        body: 'hello',
        destination: 'https://hooks.example.com/x',
        idempotencyKey: 'key-12345678',
      }),
    ).resolves.toEqual({ created: false, notificationId: 'existing' });
    expect(notification.create).not.toHaveBeenCalled();
  });

  it('fails closed on an idempotency-key payload collision', async () => {
    notification.findUnique.mockResolvedValueOnce({
      id: 'existing',
      channel: 'WEBHOOK',
      destination: 'https://hooks.example.com/x',
      subject: null,
      body: 'different',
      templateKey: null,
    });

    await expect(
      service.enqueue({
        tenantId,
        channel: 'WEBHOOK',
        body: 'hello',
        destination: 'https://hooks.example.com/x',
        idempotencyKey: 'key-12345678',
      }),
    ).rejects.toMatchObject({ code: 'NOTIFICATION_IDEMPOTENCY_CONFLICT' });
    expect(notification.create).not.toHaveBeenCalled();
  });

  it('queues verification email with a hashed idempotency key', async () => {
    await service.sendVerificationToken(tenantId, 'user@example.com', 'secret-token');

    const data = notification.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      tenantId,
      channel: 'EMAIL',
      destination: 'user@example.com',
      templateKey: 'auth.verify-email.v1',
      status: NotificationStatus.PENDING,
    });
    expect(data.body).toContain('secret-token');
    expect(data.idempotencyKey).not.toContain('secret-token');
  });

  it('recovers stale leases and atomically claims due rows', async () => {
    notification.findMany.mockResolvedValueOnce([
      {
        id: 'n1',
        tenantId,
        channel: 'WEBHOOK',
        subject: null,
        body: 'hello',
        destination: 'https://hooks.example.com/x',
      },
    ]);
    notification.updateMany
      .mockResolvedValueOnce({ count: 2 })
      .mockResolvedValueOnce({ count: 1 });

    const result = await service.claimDueBatch(25, 60_000);

    expect(result.recoveredStale).toBe(2);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: 'n1',
      channel: 'WEBHOOK',
      deliveryLeaseId: expect.any(String),
    });
    expect(notification.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'n1',
          status: NotificationStatus.PENDING,
        }),
        data: expect.objectContaining({ status: NotificationStatus.DELIVERING }),
      }),
    );
  });

  it('records SENT only for the matching active lease', async () => {
    const result = await service.recordAttempt({
      notificationId: 'n1',
      deliveryLeaseId: 'lease-1',
      ok: true,
    });

    expect(result).toEqual({ finalStatus: NotificationStatus.SENT, nextRetryAt: null });
    expect(notification.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'n1',
          status: NotificationStatus.DELIVERING,
          deliveryLeaseId: 'lease-1',
        },
        data: expect.objectContaining({
          status: NotificationStatus.SENT,
          deliveryLeaseId: null,
          deliveryLeaseAt: null,
        }),
      }),
    );
  });

  it('schedules deterministic retry from the database clock', async () => {
    const result = await service.recordAttempt({
      notificationId: 'n1',
      deliveryLeaseId: 'lease-1',
      ok: false,
      errorCode: 'WEBHOOK_TIMEOUT',
    });

    expect(result.finalStatus).toBe(NotificationStatus.PENDING);
    expect(result.nextRetryAt).toEqual(new Date(databaseNow.getTime() + 60_000));
  });

  it('does not retry terminal HTTP 4xx delivery failures', async () => {
    await expect(
      service.recordAttempt({
        notificationId: 'n1',
        deliveryLeaseId: 'lease-1',
        ok: false,
        errorCode: 'WEBHOOK_HTTP_400',
      }),
    ).resolves.toEqual({
      finalStatus: NotificationStatus.EXHAUSTED,
      nextRetryAt: null,
    });
  });

  it('does not retry TLS trust failures because retries cannot repair certificate configuration', async () => {
    await expect(
      service.recordAttempt({
        notificationId: 'n1',
        deliveryLeaseId: 'lease-1',
        ok: false,
        errorCode: 'WEBHOOK_TLS_INVALID',
      }),
    ).resolves.toEqual({
      finalStatus: NotificationStatus.EXHAUSTED,
      nextRetryAt: null,
    });
  });

  it('retries explicit transient HTTP responses such as 429 and 5xx', async () => {
    await expect(
      service.recordAttempt({
        notificationId: 'n1',
        deliveryLeaseId: 'lease-1',
        ok: false,
        errorCode: 'EMAIL_RELAY_HTTP_503',
      }),
    ).resolves.toEqual({
      finalStatus: NotificationStatus.PENDING,
      nextRetryAt: new Date(databaseNow.getTime() + 60_000),
    });
  });

  it('finalizes EXHAUSTED after the third failed attempt', async () => {
    notificationRow.attemptCount = 2;

    await expect(
      service.recordAttempt({
        notificationId: 'n1',
        deliveryLeaseId: 'lease-1',
        ok: false,
        errorCode: 'WEBHOOK_TIMEOUT',
      }),
    ).resolves.toEqual({
      finalStatus: NotificationStatus.EXHAUSTED,
      nextRetryAt: null,
    });
  });

  it('fails closed when a stale worker tries to complete a foreign lease', async () => {
    notificationRow.deliveryLeaseId = 'newer-lease';

    await expect(
      service.recordAttempt({
        notificationId: 'n1',
        deliveryLeaseId: 'old-lease',
        ok: true,
      }),
    ).rejects.toMatchObject({ code: 'NOTIFICATION_DELIVERY_LEASE_LOST' });
    expect(notification.updateMany).not.toHaveBeenCalled();
  });
});
