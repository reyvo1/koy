import { Injectable, Logger } from '@nestjs/common';
import { NotificationStatus, Prisma } from '@prisma/client';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ERROR_CODES } from '../common/errors/error-code';
import { DomainBadRequestException, DomainNotFoundException } from '../common/errors/domain-exceptions';

export const NOTIFICATION_LIMITS = {
  maxBodyLength: 16 * 1024,
  maxDestinationLength: 512,
  maxSubjectLength: 256,
  maxAttempts: 3,
  maxDeliveryBatch: 100,
  defaultDeliveryBatch: 25,
  defaultClaimTimeoutMs: 60_000,
  backoffSecondsByAttempt: [60, 300],
} as const;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type NotificationPersistenceClient = Pick<
  Prisma.TransactionClient,
  'notification'
>;

export type NotificationDomainErrorCode =
  | 'NOTIFICATION_BODY_INVALID'
  | 'NOTIFICATION_DESTINATION_INVALID'
  | 'NOTIFICATION_SUBJECT_INVALID'
  | 'NOTIFICATION_CHANNEL_INVALID'
  | 'NOTIFICATION_NOT_FOUND'
  | 'NOTIFICATION_DELIVERY_LEASE_LOST'
  | 'NOTIFICATION_IDEMPOTENCY_CONFLICT';

export interface ClaimedNotificationDelivery {
  readonly id: string;
  readonly tenantId: string;
  readonly channel: 'WEBHOOK' | 'EMAIL';
  readonly subject: string | null;
  readonly body: string;
  readonly destination: string;
  readonly deliveryLeaseId: string;
}

/**
 * Module 14 + Wave 2 runtime closure.
 *
 * The service owns durable idempotent enqueue, bounded retry bookkeeping and
 * the database lease used by delivery workers. External network I/O remains in
 * transports; no timeout, close or transport ambiguity is interpreted as
 * delivery success.
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async enqueue(input: {
    tenantId: string;
    channel: 'WEBHOOK' | 'EMAIL';
    body: string;
    destination: string;
    subject?: string;
    templateKey?: string;
    idempotencyKey: string;
  }): Promise<{ created: boolean; notificationId: string }> {
    return this.enqueueWithClient(this.prisma, input);
  }

  async enqueueWithClient(
    client: NotificationPersistenceClient,
    input: {
      tenantId: string;
      channel: 'WEBHOOK' | 'EMAIL';
      body: string;
      destination: string;
      subject?: string;
      templateKey?: string;
      idempotencyKey: string;
    },
  ): Promise<{ created: boolean; notificationId: string }> {
    const normalized = this.assertInput(input);
    const lookup = () =>
      client.notification.findUnique({
        where: {
          tenantId_idempotencyKey: {
            tenantId: input.tenantId,
            idempotencyKey: input.idempotencyKey,
          },
        },
      });

    const existing = await lookup();
    if (existing) {
      this.assertIdempotentNotification(existing, input, normalized);
      return { created: false, notificationId: existing.id };
    }

    try {
      const created = await client.notification.create({
        data: {
          tenantId: input.tenantId,
          channel: input.channel,
          templateKey: input.templateKey ?? null,
          subject: normalized.subject,
          body: input.body,
          destination: normalized.destination,
          status: NotificationStatus.PENDING,
          idempotencyKey: input.idempotencyKey,
        },
      });
      return { created: true, notificationId: created.id };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const raced = await lookup();
        if (raced) {
          this.assertIdempotentNotification(raced, input, normalized);
          return { created: false, notificationId: raced.id };
        }
      }
      throw error;
    }
  }

  /**
   * Lease due notifications for one bounded delivery pass. Conditional updates
   * make overlapping workers safe; only the process that wins a PENDING ->
   * DELIVERING transition receives the corresponding lease id.
   */
  async claimDueBatch(
    limit: number = NOTIFICATION_LIMITS.defaultDeliveryBatch,
    claimTimeoutMs: number = NOTIFICATION_LIMITS.defaultClaimTimeoutMs,
  ): Promise<{
    recoveredStale: number;
    items: ClaimedNotificationDelivery[];
  }> {
    const safeLimit = Number.isInteger(limit)
      ? Math.min(Math.max(limit, 1), NOTIFICATION_LIMITS.maxDeliveryBatch)
      : NOTIFICATION_LIMITS.defaultDeliveryBatch;
    const safeClaimTimeoutMs = Number.isFinite(claimTimeoutMs)
      ? Math.min(Math.max(Math.trunc(claimTimeoutMs), 30_000), 600_000)
      : NOTIFICATION_LIMITS.defaultClaimTimeoutMs;

    return this.prisma.$transaction(async (transaction) => {
      const databaseNow = await this.readDatabaseClock(transaction);
      const staleBefore = new Date(databaseNow.getTime() - safeClaimTimeoutMs);
      const recovered = await transaction.notification.updateMany({
        where: {
          status: NotificationStatus.DELIVERING,
          deliveryLeaseAt: { lt: staleBefore },
        },
        data: {
          status: NotificationStatus.PENDING,
          deliveryLeaseId: null,
          deliveryLeaseAt: null,
        },
      });

      const candidates = await transaction.notification.findMany({
        where: {
          status: NotificationStatus.PENDING,
          OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: databaseNow } }],
        },
        select: {
          id: true,
          tenantId: true,
          channel: true,
          subject: true,
          body: true,
          destination: true,
        },
        orderBy: [{ nextRetryAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        take: safeLimit,
      });

      const items: ClaimedNotificationDelivery[] = [];
      for (const candidate of candidates) {
        const deliveryLeaseId = crypto.randomUUID();
        const claimed = await transaction.notification.updateMany({
          where: {
            id: candidate.id,
            status: NotificationStatus.PENDING,
            OR: [
              { nextRetryAt: null },
              { nextRetryAt: { lte: databaseNow } },
            ],
          },
          data: {
            status: NotificationStatus.DELIVERING,
            deliveryLeaseId,
            deliveryLeaseAt: databaseNow,
          },
        });
        if (claimed.count !== 1) continue;

        items.push({
          id: candidate.id,
          tenantId: candidate.tenantId,
          channel: candidate.channel,
          subject: candidate.subject,
          body: candidate.body,
          destination: candidate.destination,
          deliveryLeaseId,
        });
      }

      return { recoveredStale: recovered.count, items };
    });
  }

  /**
   * Complete exactly one leased delivery attempt. A stale or foreign lease is
   * rejected so a late worker can never overwrite a newer delivery outcome.
   */
  async recordAttempt(input: {
    notificationId: string;
    deliveryLeaseId: string;
    ok: boolean;
    errorCode?: string;
  }): Promise<{ finalStatus: NotificationStatus; nextRetryAt: Date | null }> {
    return this.prisma.$transaction(async (transaction) => {
      const notification = await transaction.notification.findUnique({
        where: { id: input.notificationId },
      });
      if (!notification) {
        throw Object.assign(new Error('notification not found'), {
          code: 'NOTIFICATION_NOT_FOUND',
        });
      }
      if (
        notification.status !== NotificationStatus.DELIVERING ||
        notification.deliveryLeaseId !== input.deliveryLeaseId
      ) {
        throw Object.assign(new Error('notification delivery lease lost'), {
          code: 'NOTIFICATION_DELIVERY_LEASE_LOST',
        });
      }

      const attemptCount = Math.max(notification.attemptCount, 0) + 1;
      const databaseNow = await this.readDatabaseClock(transaction);

      if (input.ok) {
        await this.completeLease(transaction, input, {
          status: NotificationStatus.SENT,
          attemptCount,
          lastErrorCode: null,
          nextRetryAt: null,
          sentAt: databaseNow,
        });
        return { finalStatus: NotificationStatus.SENT, nextRetryAt: null };
      }

      if (
        attemptCount >= NOTIFICATION_LIMITS.maxAttempts ||
        !input.errorCode ||
        !this.isRetryableDeliveryError(input.errorCode)
      ) {
        await this.completeLease(transaction, input, {
          status: NotificationStatus.EXHAUSTED,
          attemptCount,
          lastErrorCode: input.errorCode ?? null,
          nextRetryAt: null,
        });
        return { finalStatus: NotificationStatus.EXHAUSTED, nextRetryAt: null };
      }

      const backoffSeconds =
        NOTIFICATION_LIMITS.backoffSecondsByAttempt[attemptCount - 1];
      if (typeof backoffSeconds !== 'number') {
        await this.completeLease(transaction, input, {
          status: NotificationStatus.EXHAUSTED,
          attemptCount,
          lastErrorCode: input.errorCode,
          nextRetryAt: null,
        });
        return { finalStatus: NotificationStatus.EXHAUSTED, nextRetryAt: null };
      }

      const nextRetryAt = new Date(
        databaseNow.getTime() + backoffSeconds * 1000,
      );
      await this.completeLease(transaction, input, {
        status: NotificationStatus.PENDING,
        attemptCount,
        lastErrorCode: input.errorCode,
        nextRetryAt,
      });

      this.logger.log({
        event: 'notification.attempt.recorded',
        outcome: 'retry_scheduled',
        notificationId: input.notificationId,
        attemptCount,
      });
      return { finalStatus: NotificationStatus.PENDING, nextRetryAt };
    });
  }

  async sendVerificationToken(
    tenantId: string,
    email: string,
    token: string,
    client: NotificationPersistenceClient = this.prisma,
  ): Promise<void> {
    await this.enqueueWithClient(client, {
      tenantId,
      channel: 'EMAIL',
      destination: email,
      subject: 'Verify your IoT Platform account',
      body: `Verification token: ${token}`,
      templateKey: 'auth.verify-email.v1',
      idempotencyKey: this.authNotificationKey('verify', token),
    });
  }

  async sendResetToken(
    tenantId: string,
    email: string,
    token: string,
    client: NotificationPersistenceClient = this.prisma,
  ): Promise<void> {
    await this.enqueueWithClient(client, {
      tenantId,
      channel: 'EMAIL',
      destination: email,
      subject: 'Reset your IoT Platform password',
      body: `Password reset token: ${token}`,
      templateKey: 'auth.reset-password.v1',
      idempotencyKey: this.authNotificationKey('reset', token),
    });
  }

  private async completeLease(
    transaction: Prisma.TransactionClient,
    input: { notificationId: string; deliveryLeaseId: string },
    data: {
      status: NotificationStatus;
      attemptCount: number;
      lastErrorCode: string | null;
      nextRetryAt: Date | null;
      sentAt?: Date;
    },
  ): Promise<void> {
    const updated = await transaction.notification.updateMany({
      where: {
        id: input.notificationId,
        status: NotificationStatus.DELIVERING,
        deliveryLeaseId: input.deliveryLeaseId,
      },
      data: {
        ...data,
        deliveryLeaseId: null,
        deliveryLeaseAt: null,
      },
    });
    if (updated.count !== 1) {
      throw Object.assign(new Error('notification delivery lease lost'), {
        code: 'NOTIFICATION_DELIVERY_LEASE_LOST',
      });
    }
  }

  private async readDatabaseClock(
    transaction: Prisma.TransactionClient,
  ): Promise<Date> {
    const rows = (await transaction.$queryRaw`
      SELECT clock_timestamp() AS "databaseNow"
    `) as Array<{ databaseNow: Date }>;
    const databaseNow = rows[0]?.databaseNow;
    if (!(databaseNow instanceof Date) || !Number.isFinite(databaseNow.getTime())) {
      throw new Error('NOTIFICATION_DATABASE_CLOCK_UNAVAILABLE');
    }
    return databaseNow;
  }

  private assertInput(input: {
    channel: string;
    body: string;
    destination: string;
    subject?: string;
    idempotencyKey: string;
  }): { destination: string; subject: string | null } {
    if (input.channel !== 'WEBHOOK' && input.channel !== 'EMAIL') {
      throw Object.assign(new Error('invalid channel'), {
        code: 'NOTIFICATION_CHANNEL_INVALID',
      });
    }
    if (!input.body || input.body.length > NOTIFICATION_LIMITS.maxBodyLength) {
      throw Object.assign(new Error('invalid body'), {
        code: 'NOTIFICATION_BODY_INVALID',
      });
    }

    const destination = input.destination?.trim();
    if (
      !destination ||
      destination !== input.destination ||
      destination.length > NOTIFICATION_LIMITS.maxDestinationLength
    ) {
      throw Object.assign(new Error('invalid destination'), {
        code: 'NOTIFICATION_DESTINATION_INVALID',
      });
    }
    if (input.channel === 'EMAIL') {
      if (!EMAIL_PATTERN.test(destination)) {
        throw Object.assign(new Error('invalid email destination'), {
          code: 'NOTIFICATION_DESTINATION_INVALID',
        });
      }
    } else {
      let url: URL;
      try {
        url = new URL(destination);
      } catch {
        throw Object.assign(new Error('invalid webhook destination'), {
          code: 'NOTIFICATION_DESTINATION_INVALID',
        });
      }
      if (
        url.protocol !== 'https:' ||
        Boolean(url.username) ||
        Boolean(url.password)
      ) {
        throw Object.assign(new Error('invalid webhook destination'), {
          code: 'NOTIFICATION_DESTINATION_INVALID',
        });
      }
    }

    const subject = input.subject?.trim() ?? null;
    if (
      input.subject !== undefined &&
      (!subject || subject.length > NOTIFICATION_LIMITS.maxSubjectLength)
    ) {
      throw Object.assign(new Error('invalid subject'), {
        code: 'NOTIFICATION_SUBJECT_INVALID',
      });
    }
    if (!input.idempotencyKey || input.idempotencyKey.trim().length < 8) {
      throw Object.assign(new Error('idempotency key required'), {
        code: 'NOTIFICATION_BODY_INVALID',
      });
    }

    return { destination, subject };
  }

  private assertIdempotentNotification(
    existing: {
      channel: unknown;
      destination: string;
      subject: string | null;
      body: string;
      templateKey: string | null;
    },
    input: {
      channel: 'WEBHOOK' | 'EMAIL';
      destination: string;
      subject?: string;
      body: string;
      templateKey?: string;
    },
    normalized: { destination: string; subject: string | null },
  ): void {
    if (
      existing.channel !== input.channel ||
      existing.destination !== normalized.destination ||
      existing.subject !== normalized.subject ||
      existing.body !== input.body ||
      existing.templateKey !== (input.templateKey ?? null)
    ) {
      throw Object.assign(new Error('notification idempotency key conflict'), {
        code: 'NOTIFICATION_IDEMPOTENCY_CONFLICT',
      });
    }
  }

  private isRetryableDeliveryError(errorCode: string): boolean {
    if (
      errorCode === 'WEBHOOK_TIMEOUT' ||
      errorCode === 'WEBHOOK_UNREACHABLE' ||
      errorCode === 'EMAIL_RELAY_TIMEOUT' ||
      errorCode === 'EMAIL_RELAY_UNREACHABLE'
    ) {
      return true;
    }

    const http = /^(?:WEBHOOK|EMAIL_RELAY)_HTTP_(\d{3})$/.exec(errorCode);
    if (!http) return false;
    const status = Number(http[1]);
    return status === 408 || status === 425 || status === 429 || status >= 500;
  }

  private authNotificationKey(kind: 'verify' | 'reset', token: string): string {
    const digest = crypto.createHash('sha256').update(token).digest('hex');
    return `auth:${kind}:${digest}`;
  }

  /* ------------------------------------------------------------------ *
   * Operator read surface
   *
   * The queue was durable and fully implemented but had no HTTP surface at
   * all, so "did the email actually go out?" was unanswerable from the
   * product. These three methods expose the delivery log to a tenant admin.
   * They never mutate: retry is the worker's job, and a hand-triggered
   * "send now" would race the lease the worker already holds.
   * ------------------------------------------------------------------ */

  /**
   * Bounded delivery log for one tenant.
   *
   * An unrecognised `status` is refused rather than dropped. The earlier version fell back to the
   * unfiltered list, and its docblock defended that with a real concern — a filter typo must not
   * render as "no notifications exist". But dropping the filter is the same lie wearing the
   * opposite face: the operator asked for `FAILED`, got the whole log back, and every row's own
   * status column says `PENDING`, so the filter they are holding looks like it works. Three
   * answers, three meanings: a valid filter returns matching rows, a bad filter returns 400 naming
   * the accepted values, and an absent filter returns everything.
   */
  async listForOperator(
    tenantId: string,
    status?: string,
    limit?: number,
  ): Promise<{ items: unknown[]; total: number }> {
    const bounded = Math.min(Math.max(limit ?? 50, 1), 200);
    // Trimmed, so `?status=%20FAILED%20` is the same request as `?status=FAILED`. An empty string
    // is an absence — a UI that has not chosen a filter yet sends one — and is not a search for a
    // status with no characters, which would return nothing and read as "no notifications exist".
    const requested = status?.trim() ?? '';
    if (requested && !this.isKnownStatus(requested)) {
      throw new DomainBadRequestException(
        ERROR_CODES.ValidationFailed,
        `status must be one of ${Object.values(NotificationStatus).join(', ')}`,
      );
    }
    const where = {
      tenantId,
      ...(requested ? { status: requested as NotificationStatus } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: bounded,
        // `destination` is a real address the operator supplied, not a
        // credential, but it is still PII: it is not part of the list payload
        // and the operator opens one record to see it.
        select: {
          id: true,
          channel: true,
          subject: true,
          status: true,
          attemptCount: true,
          nextRetryAt: true,
          lastErrorCode: true,
          sentAt: true,
          createdAt: true,
          templateKey: true,
        },
      }),
      this.prisma.notification.count({ where }),
    ]);
    return { items, total };
  }

  /** Per-status counts, so the screen can lead with a number worth acting on. */
  async summarize(tenantId: string): Promise<Record<string, number>> {
    const grouped = await this.prisma.notification.groupBy({
      by: ['status'],
      where: { tenantId },
      _count: { _all: true },
    });
    const summary: Record<string, number> = {};
    for (const status of Object.values(NotificationStatus)) {
      summary[status] = 0;
    }
    for (const row of grouped) {
      summary[row.status] = row._count._all;
    }
    return summary;
  }

  /**
   * Whether a caller-supplied string names a real delivery status.
   *
   * Compared against the enum's own values rather than with `in`, because `in` also answers true for
   * inherited `Object.prototype` keys: `'toString' in NotificationStatus` is true, so the filter
   * would have accepted the literal word `toString` and sent it to Prisma.
   */
  private isKnownStatus(value: string): value is NotificationStatus {
    return (Object.values(NotificationStatus) as string[]).includes(value);
  }

  /**
   * One delivery record, tenant-scoped and operator-safe.
   *
   * The durable row also contains `body`, `idempotencyKey` and lease identifiers. Those are
   * worker/auth internals, not operator data. In particular auth notification bodies carry the
   * one-time verification/reset token, so returning the Prisma row verbatim would turn the admin
   * log endpoint into a credential disclosure surface. The detail view therefore exposes the
   * destination and delivery metadata only.
   */
  async findForOperator(
    tenantId: string,
    notificationId: string,
  ): Promise<Record<string, unknown>> {
    const record = await this.prisma.notification.findFirst({
      where: { id: notificationId, tenantId },
      select: {
        id: true,
        tenantId: true,
        channel: true,
        templateKey: true,
        subject: true,
        destination: true,
        status: true,
        attemptCount: true,
        nextRetryAt: true,
        lastErrorCode: true,
        deliveryLeaseAt: true,
        sentAt: true,
        createdAt: true,
      },
    });
    if (!record) {
      throw new DomainNotFoundException(
        ERROR_CODES.NotFound,
        'Notification not found',
      );
    }
    return record;
  }
}
