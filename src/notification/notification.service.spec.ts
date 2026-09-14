import { NotificationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from './notification.service';

const tenantId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('NotificationService', () => {
  let notificationRow: Record<string, any>;
  let update: jest.Mock;
  let findUnique: jest.Mock;
  let create: jest.Mock;
  let service: NotificationService;

  beforeEach(() => {
    notificationRow = {
      id: 'n1',
      tenantId,
      status: NotificationStatus.PENDING,
      attemptCount: 0,
      lastErrorCode: null,
      nextRetryAt: null,
      sentAt: null,
    };
    update = jest.fn().mockResolvedValue({});
    findUnique = jest.fn().mockImplementation(({ where }) => {
      if (where.tenantId_idempotencyKey) return Promise.resolve(null);
      return Promise.resolve(notificationRow);
    });
    create = jest.fn().mockImplementation(({ data }) =>
      Promise.resolve({ id: 'n1', ...data }),
    );
    service = new NotificationService({
      notification: { findUnique, create, update },
    } as unknown as PrismaService);
  });

  it('enqueues a new notification idempotently', async () => {
    const result = await service.enqueue({
      tenantId,
      channel: 'WEBHOOK',
      body: 'hello',
      destination: 'https://hooks.example.com/x',
      idempotencyKey: 'key-12345678',
    });

    expect(result.created).toBe(true);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('replays the existing row for a repeated idempotency key', async () => {
    findUnique.mockResolvedValueOnce({ id: 'existing' });
    const result = await service.enqueue({
      tenantId,
      channel: 'WEBHOOK',
      body: 'hello',
      destination: 'https://hooks.example.com/x',
      idempotencyKey: 'key-12345678',
    });

    expect(result).toEqual({ created: false, notificationId: 'existing' });
    expect(create).not.toHaveBeenCalled();
  });

  it('records SENT on successful delivery', async () => {
    const result = await service.recordAttempt({
      notificationId: 'n1',
      ok: true,
    });

    expect(result.finalStatus).toBe(NotificationStatus.SENT);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'SENT', nextRetryAt: null }),
      }),
    );
  });

  it('schedules deterministic bounded retry after first failure', async () => {
    const result = await service.recordAttempt({
      notificationId: 'n1',
      ok: false,
      errorCode: 'WEBHOOK_TIMEOUT',
    });

    expect(result.finalStatus).toBe(NotificationStatus.PENDING);
    expect(result.nextRetryAt).toBeInstanceOf(Date);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ attemptCount: 1, status: 'PENDING' }),
      }),
    );
  });

  it('finalizes EXHAUSTED at the third failed attempt', async () => {
    notificationRow.attemptCount = 2;
    const result = await service.recordAttempt({
      notificationId: 'n1',
      ok: false,
      errorCode: 'WEBHOOK_TIMEOUT',
    });

    expect(result.finalStatus).toBe(NotificationStatus.EXHAUSTED);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'EXHAUSTED' }),
      }),
    );
  });

  it('never retries unknown errors (no error code)', async () => {
    notificationRow.attemptCount = 1;
    const result = await service.recordAttempt({
      notificationId: 'n1',
      ok: false,
    });

    expect(result.finalStatus).toBe(NotificationStatus.EXHAUSTED);
  });
});
