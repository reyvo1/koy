/**
 * Mobile notification delivery history.
 *
 * Wave 7. The backend answered "did the notification actually go out?" properly — `GET
 * /notifications`, `/notifications/summary`, `/notifications/:id`, all tenant-scoped, all fed by two
 * real product writers (`AuthService.register` enqueues a verification, `AuthService.forgotPassword`
 * enqueues a reset). The mobile app could not ask it: `MobileAlertsPayload` carried
 * `notificationDeliveryHistory: false` and `MobileTechnicalHistory` carried
 * `alertDeliveryHistory: { available: false }`, and both were true.
 *
 * So this is a client for a surface that already works, and the design question is not capability
 * but honesty. A phone on a hotel network loses connectivity constantly, and a delivery log that
 * renders an outage as "nothing was sent" is the worst version of this screen: it answers the
 * operator's question with a confident falsehood. Four rules follow from that, and each is an
 * assertion rather than a comment:
 *
 *  - **Unknown, not empty.** A failed read throws. The caller distinguishes "no notifications" from
 *    "the log could not be read" by the shape of what it received, not by a message.
 *  - **Absent is visibly absent.** The list route deliberately omits `destination` because it is
 *    PII; `destinationListed: false` states that, so no row renders an empty address field that
 *    reads as a data fault.
 *  - **The filter is either applied or refused.** A status outside the published set is rejected
 *    before any request goes out, because a silently dropped filter is a control that appears to
 *    work while the list behind it is unfiltered — the exact lie the backend's own fallback used to
 *    tell before this wave removed it.
 *  - **A row that cannot be read is dropped and counted.** `total` is the server's count of matching
 *    rows and `droppedRows` is what this client could not render. Reporting one number for both would
 *    hide the row that vanished.
 */
import { MobileApiError } from '../session/mobile-session-client';

/**
 * The delivery statuses the backend publishes, in the order an operator reads them: not yet
 * attempted, in flight, delivered, failed, and given up on.
 */
export const NOTIFICATION_DELIVERY_STATUSES = [
  'PENDING',
  'DELIVERING',
  'SENT',
  'FAILED',
  'EXHAUSTED',
] as const;

export type MobileNotificationDeliveryStatus =
  (typeof NOTIFICATION_DELIVERY_STATUSES)[number];

export interface MobileNotificationDelivery {
  id: string;
  channel: string;
  subject: string | null;
  status: MobileNotificationDeliveryStatus;
  attemptCount: number;
  lastErrorCode: string | null;
  sentAt: string | null;
  createdAt: string;
  templateKey: string | null;
  /**
   * Derived from `sentAt`, never from `status`.
   *
   * A row can carry a stale `sentAt` while its status says `DELIVERING`, and reading the label
   * would let that row claim a delivery the transport never confirmed.
   */
  wasSent: boolean;
}

export interface MobileNotificationHistory {
  source: 'NOTIFICATION_DELIVERY_LOG';
  /** The list route omits the destination; one record includes it. */
  destinationListed: false;
  /** The server's count of rows matching the filter, before this client dropped unreadable ones. */
  total: number;
  /** How many of those rows this client could not render, so the two numbers can be reconciled. */
  droppedRows: number;
  /** The filter actually sent, or `null` for "everything". */
  appliedStatus: MobileNotificationDeliveryStatus | null;
  items: MobileNotificationDelivery[];
}

export interface MobileNotificationSummary {
  total: number;
  byStatus: Record<MobileNotificationDeliveryStatus, number>;
}

export interface MobileNotificationGateway {
  requestJson<T>(pathname: string, init?: RequestInit): Promise<T>;
}

/** Bounded so a phone cannot ask for the whole log; the backend caps at 200 regardless. */
const HISTORY_LIMIT = 50;

export async function loadMobileNotificationHistory(
  gateway: MobileNotificationGateway,
  status?: string,
): Promise<MobileNotificationHistory> {
  const appliedStatus = normalizeStatus(status);

  const query = new URLSearchParams({ limit: String(HISTORY_LIMIT) });
  if (appliedStatus) query.set('status', appliedStatus);

  let payload: unknown;
  try {
    payload = await gateway.requestJson<unknown>(`/notifications?${query.toString()}`);
  } catch (cause) {
    // Untouched, so a 403 stays a 403 and a 401 still triggers the session client's refresh. This
    // client has no business inventing a status code.
    if (cause instanceof MobileApiError) throw cause;
    throw new MobileApiError(
      502,
      'NOTIFICATION_HISTORY_FAILED',
      'riwayat pengiriman notifikasi gagal dimuat',
      null,
    );
  }

  const body = (payload ?? {}) as { items?: unknown; total?: unknown };
  const rawItems = Array.isArray(body.items) ? body.items : [];
  const items: MobileNotificationDelivery[] = [];
  let droppedRows = 0;

  for (const raw of rawItems) {
    const row = parseDelivery(raw);
    if (row) items.push(row);
    else droppedRows += 1;
  }

  // `total` is the server's count, kept as sent rather than recomputed from `items.length`. The two
  // disagree exactly when this client dropped something, which is the fact an operator needs.
  const total =
    typeof body.total === 'number' && Number.isFinite(body.total)
      ? body.total
      : items.length + droppedRows;

  return {
    source: 'NOTIFICATION_DELIVERY_LOG',
    destinationListed: false,
    total,
    droppedRows,
    appliedStatus,
    items,
  };
}

export async function loadMobileNotificationSummary(
  gateway: MobileNotificationGateway,
): Promise<MobileNotificationSummary> {
  let payload: unknown;
  try {
    payload = await gateway.requestJson<unknown>('/notifications/summary');
  } catch (cause) {
    if (cause instanceof MobileApiError) throw cause;
    throw new MobileApiError(
      502,
      'NOTIFICATION_SUMMARY_FAILED',
      'ringkasan notifikasi gagal dimuat',
      null,
    );
  }

  const body = (payload ?? {}) as Record<string, unknown>;
  // Every published status is seeded at zero before counting, so a status that has never occurred is
  // visibly zero rather than absent. An absent key reads as "this status does not exist".
  const byStatus = Object.fromEntries(
    NOTIFICATION_DELIVERY_STATUSES.map((status) => [status, 0]),
  ) as Record<MobileNotificationDeliveryStatus, number>;

  for (const status of NOTIFICATION_DELIVERY_STATUSES) {
    const count = body[status];
    if (typeof count === 'number' && Number.isFinite(count) && count >= 0) {
      byStatus[status] = count;
    }
  }

  return {
    total: NOTIFICATION_DELIVERY_STATUSES.reduce((sum, status) => sum + byStatus[status], 0),
    byStatus,
  };
}

/**
 * Validate a caller-supplied status before it becomes a query string.
 *
 * Rejected locally rather than left to the backend, so a typo never turns into an unfiltered
 * request whose response looks like a working filter. An empty or absent value means "everything",
 * which is a request rather than a mistake.
 */
function normalizeStatus(
  status?: string,
): MobileNotificationDeliveryStatus | null {
  const requested = status?.trim() ?? '';
  if (!requested) return null;

  if (
    !(NOTIFICATION_DELIVERY_STATUSES as readonly string[]).includes(requested)
  ) {
    throw new MobileApiError(
      400,
      'NOTIFICATION_STATUS_INVALID',
      `status harus salah satu dari ${NOTIFICATION_DELIVERY_STATUSES.join(', ')}`,
      null,
    );
  }
  return requested as MobileNotificationDeliveryStatus;
}

function parseDelivery(raw: unknown): MobileNotificationDelivery | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;

  const id = row.id;
  const status = row.status;
  const createdAt = row.createdAt;
  if (
    typeof id !== 'string' ||
    typeof status !== 'string' ||
    typeof createdAt !== 'string'
  ) {
    return null;
  }
  // An unrecognised status means the row cannot be labelled honestly, so it is dropped rather than
  // rendered with a status the client invented.
  if (!(NOTIFICATION_DELIVERY_STATUSES as readonly string[]).includes(status)) return null;

  const sentAt = typeof row.sentAt === 'string' ? row.sentAt : null;
  return {
    id,
    channel: typeof row.channel === 'string' ? row.channel : 'UNKNOWN',
    subject: typeof row.subject === 'string' ? row.subject : null,
    status: status as MobileNotificationDeliveryStatus,
    attemptCount:
      typeof row.attemptCount === 'number' && Number.isFinite(row.attemptCount)
        ? row.attemptCount
        : 0,
    lastErrorCode:
      typeof row.lastErrorCode === 'string' ? row.lastErrorCode : null,
    sentAt,
    createdAt,
    templateKey:
      typeof row.templateKey === 'string' ? row.templateKey : null,
    wasSent: sentAt !== null,
  };
}