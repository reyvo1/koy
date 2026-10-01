import { MobileApiError } from '../session/mobile-session-client';
import {
  loadMobileNotificationHistory,
  loadMobileNotificationSummary,
  NOTIFICATION_DELIVERY_STATUSES,
  type MobileNotificationDelivery,
} from './mobile-notification-client';

/**
 * Wave 7: a tenant's phone could not answer "did the notification actually go out?".
 *
 * The backend answered it properly — `GET /notifications`, `/notifications/summary`,
 * `/notifications/:id`, all tenant-scoped, all fed by two real product writers — and the mobile
 * app had no way to read any of it. Two separate surfaces said so in their own types:
 *
 *   `MobileAlertsPayload.notificationDeliveryHistory: false`
 *   `MobileTechnicalHistory.alertDeliveryHistory: { available: false }`
 *
 * Both were true. Both meant the same gap, and the two of them had drifted apart: the alerts payload
 * at least named what was missing, while the technical history only reported unavailability with no
 * pointer to the surface that *was* available. So this client is the mobile half of a backend that
 * already works, and the questions below are about honesty rather than capability:
 *
 *  - Does an unreadable history say so, rather than reading as "nothing was sent"?
 *  - Is an absent destination visibly absent, rather than rendered as an empty field?
 *  - Does a rejected filter come back as a rejection?
 */

describe('mobile notification delivery history', () => {
  const deliveryRow = {
    id: 'n1',
    channel: 'EMAIL',
    subject: 'Verify your IoT Platform account',
    status: 'PENDING',
    attemptCount: 0,
    lastErrorCode: null,
    sentAt: null,
    createdAt: '2026-10-01T09:00:00.000Z',
    templateKey: 'auth.verify-email.v1',
  };

  it('reads the operator list the backend already serves', async () => {
    let capturedPath = '';
    const payload = await loadMobileNotificationHistory({
      requestJson: async <T>(path: string) => {
        capturedPath = path;
        return ({ items: [deliveryRow], total: 1 }) as T;
      },
    });

    expect(capturedPath).toContain('/notifications');
    expect(payload.items).toHaveLength(1);
    expect(payload.total).toBe(1);
    expect(payload.source).toBe('NOTIFICATION_DELIVERY_LOG');
  });

  it('marks the destination as unlisted rather than inventing one', async () => {
    // The list deliberately omits `destination` — it is PII, and the backend only returns it on the
    // single-record route. A client that typed it as `string` and rendered it would print `undefined`
    // for every row, which reads as a data fault rather than as a field that is deliberately absent.
    const payload = await loadMobileNotificationHistory({
      requestJson: async <T>() => ({ items: [deliveryRow], total: 1 }) as T,
    });

    const row = payload.items[0] as MobileNotificationDelivery & { destination?: unknown };
    expect(row.destination).toBeUndefined();
    expect(payload.destinationListed).toBe(false);
  });

  it('passes a status filter through and reports which one it applied', async () => {
    // A client that silently drops its own filter would leave the operator holding a control that
    // appears to work while the list behind it is unfiltered — the same lie the backend's own
    // fallback used to tell, and the reason that fallback is gone.
    let capturedPath = '';
    const payload = await loadMobileNotificationHistory(
      {
        requestJson: async <T>(path: string) => {
          capturedPath = path;
          return ({ items: [], total: 0 }) as T;
        },
      },
      'FAILED',
    );

    expect(capturedPath).toContain('status=FAILED');
    expect(payload.appliedStatus).toBe('FAILED');
  });

  it('refuses a status outside the published set before it reaches the network', async () => {
    let called = false;
    await expect(
      loadMobileNotificationHistory(
        {
          requestJson: async <T>() => {
            called = true;
            return ({ items: [], total: 0 }) as T;
          },
        },
        'FAILY',
      ),
    ).rejects.toBeInstanceOf(MobileApiError);

    // Fail before the request, so a typo cannot become a full unfiltered list on the way there.
    expect(called).toBe(false);
  });

  it('treats an absent filter as "everything", which the payload states plainly', async () => {
    let capturedPath = '';
    const payload = await loadMobileNotificationHistory({
      requestJson: async <T>(path: string) => {
        capturedPath = path;
        return ({ items: [], total: 0 }) as T;
      },
    });

    expect(capturedPath).not.toContain('status=');
    expect(payload.appliedStatus).toBeNull();
  });

  it('distinguishes an empty log from a log it could not read', async () => {
    // `null` and `[]` are different claims: "there is nothing here" versus "I do not know". An
    // outage that renders as an empty list is a green screen over a dead connection.
    const empty = await loadMobileNotificationHistory({
      requestJson: async <T>() => ({ items: [], total: 0 }) as T,
    });
    expect(empty.items).toEqual([]);
    expect(empty.total).toBe(0);

    await expect(
      loadMobileNotificationHistory({
        requestJson: async () => {
          throw new MobileApiError(503, 'UNAVAILABLE', 'service unavailable', null);
        },
      }),
    ).rejects.toMatchObject({ status: 503 });
  });

  it('surfaces the gateway error untouched, so a 403 stays a 403', async () => {
    const err = new MobileApiError(403, 'FORBIDDEN', 'not your tenant', null);
    await expect(
      loadMobileNotificationHistory({
        requestJson: async () => {
          throw err;
        },
      }),
    ).rejects.toBe(err);
  });

  it('reads the summary with every status present, zero included', async () => {
    const payload = await loadMobileNotificationSummary({
      requestJson: async <T>() =>
        ({ PENDING: 2, DELIVERING: 0, SENT: 1, FAILED: 0, EXHAUSTED: 0 }) as T,
    });

    expect(payload.total).toBe(3);
    // A status missing from the summary reads as a status that has never occurred.
    for (const status of NOTIFICATION_DELIVERY_STATUSES) {
      expect(payload.byStatus).toHaveProperty(status);
    }
    expect(payload.byStatus.PENDING).toBe(2);
    expect(payload.byStatus.SENT).toBe(1);
    expect(payload.byStatus.FAILED).toBe(0);
  });

  it('keeps a failed row visibly failed, with its error code', async () => {
    // The row an operator opens the log for is the failed one, so a parse that dropped the status
    // or the error code would leave the log unable to answer the only question it exists for.
    const payload = await loadMobileNotificationHistory({
      requestJson: async <T>() =>
        ({
          items: [
            {
              ...deliveryRow,
              status: 'FAILED',
              attemptCount: 3,
              lastErrorCode: 'WEBHOOK_HTTP_500',
            },
          ],
          total: 1,
        }) as T,
    });

    expect(payload.items[0].status).toBe('FAILED');
    expect(payload.items[0].attemptCount).toBe(3);
    expect(payload.items[0].lastErrorCode).toBe('WEBHOOK_HTTP_500');
  });

  it('never presents an unsent row as sent', async () => {
    const payload = await loadMobileNotificationHistory({
      requestJson: async <T>() => ({ items: [deliveryRow], total: 1 }) as T,
    });

    const row = payload.items[0];
    expect(row.sentAt).toBeNull();
    // Derived, not read: a status that is not terminal-terminal must not render a timestamp.
    expect(row.wasSent).toBe(false);
  });

  it('marks a SENT row sent on the strength of the timestamp, not the label', async () => {
    // Inverted on purpose from the previous assertion. Reading `wasSent` off the `status` string is
    // the shape that lets a `DELIVERING` row with a stale `sentAt` claim delivery, so the timestamp
    // is the authority and the status is only a label.
    const payload = await loadMobileNotificationHistory({
      requestJson: async <T>() =>
        ({
          items: [
            { ...deliveryRow, status: 'DELIVERING', sentAt: '2026-10-01T09:05:00.000Z' },
          ],
          total: 1,
        }) as T,
    });

    expect(payload.items[0].wasSent).toBe(true);
  });

  it('drops a row it cannot read rather than rendering it half', async () => {
    const payload = await loadMobileNotificationHistory({
      requestJson: async <T>() =>
        ({
          items: [
            deliveryRow,
            { id: 'broken' },
            { ...deliveryRow, id: 'n2', status: 'NOT_A_STATUS' },
          ],
          total: 3,
        }) as T,
    });

    expect(payload.items.map((row) => row.id)).toEqual(['n1']);
    // `total` is the server's count of matching rows, not the count this client could render. They
    // differ here on purpose: claiming both are one number would hide the row the client dropped.
    expect(payload.total).toBe(3);
    expect(payload.droppedRows).toBe(2);
  });

  it('bounds the request itself, so a phone cannot ask for the whole log', async () => {
    let capturedPath = '';
    await loadMobileNotificationHistory({
      requestJson: async <T>(path: string) => {
        capturedPath = path;
        return ({ items: [], total: 0 }) as T;
      },
    });
    expect(capturedPath).toContain('limit=50');
  });
});