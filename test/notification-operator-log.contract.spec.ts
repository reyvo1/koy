import { NotificationStatus } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { NotificationService } from '../src/notification/notification.service';

/**
 * Wave 7: the operator delivery log answers a question the mobile app cannot currently ask.
 *
 * The census found the backend surface whole and readable — `GET /notifications`,
 * `/notifications/summary`, `/notifications/:id`, all tenant-scoped, all fed by two real product
 * writers (`AuthService.register` and `AuthService.forgotPassword`) — while the mobile client had
 * no way to read any of it. Its alerts payload asserted `notificationDeliveryHistory: false` and
 * its technical history asserted `alertDeliveryHistory: { available: false }`. Both were true, and
 * both meant "a tenant's phone cannot answer 'did the notification actually go out?'".
 *
 * The live probe then found one more thing in that surface, and it is the reason this file exists:
 *
 *   **An unknown `status` filter was silently ignored.**
 *
 * `listForOperator` matched the value against the enum and, when it did not match, dropped the
 * filter and returned the whole log. The docblock defended this — "a filter typo in the UI must not
 * render as 'no notifications exist'" — and the reasoning is half right: silently returning
 * *nothing* would be the worse lie. But dropping the filter is the other half of the same lie. An
 * operator who asks for `status=FAILED` and gets the full list back sees rows whose status column
 * plainly says `PENDING`, and the filter control they are holding appears to be working. The typo
 * is invisible, which is the one thing a rejected filter would have made obvious.
 *
 * So an unknown status is refused. Three answers, three meanings, and none of them is another's
 * disguise: a valid filter returns matching rows, an invalid filter returns 400 naming the accepted
 * values, and an absent filter returns everything.
 */

const tenantId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const ACCEPTED_STATUSES = [
  NotificationStatus.PENDING,
  NotificationStatus.DELIVERING,
  NotificationStatus.SENT,
  NotificationStatus.FAILED,
  NotificationStatus.EXHAUSTED,
];

function createService(rows: Array<Record<string, unknown>> = []) {
  const notification = {
    findMany: jest.fn().mockResolvedValue(rows),
    count: jest.fn().mockResolvedValue(rows.length),
    groupBy: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn().mockResolvedValue(rows[0] ?? null),
  };
  return {
    notification,
    service: new NotificationService({
      notification,
    } as unknown as PrismaService),
  };
}

describe('the operator delivery log refuses a filter it cannot honour', () => {
  it('rejects a status outside the enum instead of dropping the filter', async () => {
    const { service, notification } = createService([
      { id: 'n1', status: NotificationStatus.PENDING, channel: 'EMAIL' },
    ]);

    await expect(service.listForOperator(tenantId, 'FAILE D')).rejects.toMatchObject({
      status: 400,
    });

    // The load-bearing half. A rejection is only honest if the unfiltered query never ran: had the
    // filter been dropped, the caller would have received every row while holding a filter it
    // believes in. Asserting the call count catches the exact fallback this is replacing.
    expect(notification.findMany).not.toHaveBeenCalled();
  });

  it('names the accepted values, so the caller can correct itself', async () => {
    const { service } = createService();
    const error = await service.listForOperator(tenantId, 'SENTT').catch((cause) => cause);

    const message = String(error?.message ?? '');
    for (const status of ACCEPTED_STATUSES) {
      expect(message).toContain(status);
    }
  });

  it('still honours a valid status', async () => {
    const { service, notification } = createService([
      { id: 'n1', status: NotificationStatus.FAILED, channel: 'EMAIL' },
    ]);

    await service.listForOperator(tenantId, NotificationStatus.FAILED);

    expect(notification.findMany).toHaveBeenCalledTimes(1);
    const query = notification.findMany.mock.calls[0][0];
    expect(query.where).toEqual({ tenantId, status: NotificationStatus.FAILED });
  });

  it('treats an absent filter as "everything", which is a different answer from a bad one', async () => {
    const { service, notification } = createService([]);

    await expect(service.listForOperator(tenantId)).resolves.toMatchObject({ items: [], total: 0 });

    const query = notification.findMany.mock.calls[0][0];
    expect(query.where).toEqual({ tenantId });
    expect(query.where).not.toHaveProperty('status');
  });

  it('treats an empty filter as absent rather than as a search for nothing', async () => {
    // A trailing `?status=` from a UI that has not chosen a filter yet is an absence. Reading it as
    // a literal empty status would return an empty list, which is precisely the "no notifications
    // exist" rendering the old fallback was trying to avoid — and it would be *correct* code
    // producing that lie.
    const { service, notification } = createService([]);

    await expect(service.listForOperator(tenantId, '')).resolves.toMatchObject({ items: [] });

    expect(notification.findMany.mock.calls[0][0].where).toEqual({ tenantId });
  });

  it('never puts an unvalidated status into a query', async () => {
    // The shape check is what makes the previous assertion load-bearing rather than decorative:
    // regardless of which path is taken, the value reaching Prisma is either a real enum member
    // or absent.
    const { service, notification } = createService([]);

    await service.listForOperator(tenantId, NotificationStatus.SENT).catch(() => undefined);
    await service.listForOperator(tenantId, 'nonsense').catch(() => undefined);

    for (const call of notification.findMany.mock.calls) {
      const where = call[0].where as Record<string, unknown>;
      if ('status' in where) {
        expect(ACCEPTED_STATUSES).toContain(where.status as NotificationStatus);
      }
    }
  });

  it('refuses an inherited Object.prototype key, which `in` would have accepted', async () => {
    // Written after a mutation proved it was needed: swapping the check back to
    // `value in NotificationStatus` kept all twelve assertions green. That is the whole point —
    // `in` answers true for `toString` and `constructor` on a plain enum object, so a caller naming
    // one of them would have been believed, and Prisma would have received a status value that
    // exists nowhere in the schema. Verified against the generated client rather than assumed:
    // `'toString' in NotificationStatus` is `true`.
    const inherited = ['toString', 'constructor', 'hasOwnProperty', 'valueOf'];
    for (const key of inherited) {
      expect(key in NotificationStatus).toBe(true);
    }

    const { service, notification } = createService([]);

    for (const key of inherited) {
      await expect(service.listForOperator(tenantId, key)).rejects.toMatchObject({ status: 400 });
    }
    expect(notification.findMany).not.toHaveBeenCalled();
  });
});

describe('the delivery log stays scoped and bounded', () => {
  it('always carries the tenant in the query, whatever the filter', async () => {
    const { service, notification } = createService([]);

    await service.listForOperator(tenantId, NotificationStatus.SENT);
    await service.listForOperator(tenantId).catch(() => undefined);

    for (const call of notification.findMany.mock.calls) {
      expect((call[0].where as Record<string, unknown>).tenantId).toBe(tenantId);
    }
  });

  it('clamps the limit into the range the contract promises', async () => {
    const { service, notification } = createService([]);

    await service.listForOperator(tenantId, undefined, 0);
    expect(notification.findMany.mock.calls[0][0].take).toBe(1);

    await service.listForOperator(tenantId, undefined, 100_000);
    expect(notification.findMany.mock.calls[1][0].take).toBe(200);
  });

  it('reads newest first, because the question is "what happened most recently"', async () => {
    const { service, notification } = createService([]);

    await service.listForOperator(tenantId);

    expect(notification.findMany.mock.calls[0][0].orderBy).toEqual({ createdAt: 'desc' });
  });

  it('keeps the destination out of the list and inside the single record', async () => {
    // The list is a log; the address is PII and only an operator opening one record needs it.
    const { service, notification } = createService([]);

    await service.listForOperator(tenantId);

    const select = notification.findMany.mock.calls[0][0].select as Record<string, boolean>;
    expect(select).not.toHaveProperty('destination');
    expect(select).toHaveProperty('subject');
    expect(select).toHaveProperty('lastErrorCode');
  });

  it('summarises by status with every enum member present at zero', async () => {
    // A status absent from the summary is a status an operator reads as "never happens". Absent and
    // zero are different claims, so the summary seeds every member before counting.
    const notification = {
      groupBy: jest.fn().mockResolvedValue([
        { status: NotificationStatus.FAILED, _count: { _all: 2 } },
      ]),
    };
    const service = new NotificationService({ notification } as unknown as PrismaService);

    const summary = await service.summarize(tenantId);

    for (const status of ACCEPTED_STATUSES) {
      expect(summary).toHaveProperty(status);
    }
    expect(summary[NotificationStatus.FAILED]).toBe(2);
    expect(summary[NotificationStatus.SENT]).toBe(0);
  });

  it('summarises only its own tenant', async () => {
    const notification = { groupBy: jest.fn().mockResolvedValue([]) };
    const service = new NotificationService({ notification } as unknown as PrismaService);

    await service.summarize(tenantId);

    expect(notification.groupBy.mock.calls[0][0].where).toEqual({ tenantId });
  });
});
describe('notification detail is useful without exposing auth secrets', () => {
  it('keeps body, idempotency key, and lease id out of the operator detail query', async () => {
    const notification = {
      findFirst: jest.fn().mockResolvedValue({
        id: 'n1',
        channel: 'EMAIL',
        subject: 'Reset your IoT Platform password',
        destination: 'user@example.com',
        status: NotificationStatus.PENDING,
        attemptCount: 0,
        nextRetryAt: null,
        lastErrorCode: null,
        deliveryLeaseAt: null,
        sentAt: null,
        createdAt: new Date('2026-10-05T00:00:00.000Z'),
      }),
    };
    const service = new NotificationService({ notification } as unknown as PrismaService);

    await service.findForOperator(tenantId, 'n1');

    const select = notification.findFirst.mock.calls[0][0].select as Record<string, boolean>;
    expect(select.destination).toBe(true);
    expect(select.lastErrorCode).toBe(true);
    expect(select).not.toHaveProperty('body');
    expect(select).not.toHaveProperty('idempotencyKey');
    expect(select).not.toHaveProperty('deliveryLeaseId');
  });

  it('scopes detail lookup to tenant and id together', async () => {
    const notification = {
      findFirst: jest.fn().mockResolvedValue(null),
    };
    const service = new NotificationService({ notification } as unknown as PrismaService);

    await expect(service.findForOperator(tenantId, 'foreign')).rejects.toMatchObject({ status: 404 });
    expect(notification.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'foreign', tenantId } }),
    );
  });
});
