import { Injectable, Logger } from '@nestjs/common';
import { NotificationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export const NOTIFICATION_LIMITS = {
  maxBodyLength: 16 * 1024,
  maxDestinationLength: 512,
  maxSubjectLength: 256,
  maxAttempts: 3,
  backoffSecondsByAttempt: [60, 300], // after attempt 1 → 60s, attempt 2 → 5m
} as const;

const DESTINATION_PATTERN = /^[A-Za-z0-9@._:+/-]{3,512}$/;

export type NotificationDomainErrorCode =
  | 'NOTIFICATION_BODY_INVALID'
  | 'NOTIFICATION_DESTINATION_INVALID'
  | 'NOTIFICATION_SUBJECT_INVALID'
  | 'NOTIFICATION_CHANNEL_INVALID';

/**
 * Module 14 Slice 14.1 — bounded notification enqueue + retry state.
 * Delivery itself goes through an injected transport (webhook/email adapter
 * arrives in a later slice); this service owns durable idempotent enqueue and
 * PostgreSQL-authoritative bounded retry bookkeeping.
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Idempotent enqueue keyed by (tenantId, idempotencyKey). */
  async enqueue(input: {
    tenantId: string;
    channel: 'WEBHOOK' | 'EMAIL';
    body: string;
    destination: string;
    subject?: string;
    templateKey?: string;
    idempotencyKey: string;
  }): Promise<{ created: boolean; notificationId: string }> {
    this.assertInput(input);

    const existing = await this.prisma.notification.findUnique({
      where: {
        tenantId_idempotencyKey: {
          tenantId: input.tenantId,
          idempotencyKey: input.idempotencyKey,
        },
      },
    });
    if (existing) {
      return { created: false, notificationId: existing.id };
    }

    const created = await this.prisma.notification.create({
      data: {
        tenantId: input.tenantId,
        channel: input.channel,
        templateKey: input.templateKey ?? null,
        subject: input.subject ?? null,
        body: input.body,
        destination: input.destination,
        status: NotificationStatus.PENDING,
        idempotencyKey: input.idempotencyKey,
      },
    });
    return { created: true, notificationId: created.id };
  }

  /**
   * Record one delivery attempt outcome with deterministic bounded backoff.
   * Exhausted attempts finalize EXHAUSTED; unknown errors stay non-retryable.
   */
  async recordAttempt(input: {
    notificationId: string;
    ok: boolean;
    errorCode?: string;
  }): Promise<{ finalStatus: NotificationStatus; nextRetryAt: Date | null }> {
    const notification = await this.prisma.notification.findUnique({
      where: { id: input.notificationId },
    });
    if (!notification) {
      throw Object.assign(new Error('notification not found'), {
        code: 'NOTIFICATION_NOT_FOUND',
      });
    }
    if (notification.status === 'SENT') {
      return { finalStatus: 'SENT', nextRetryAt: null };
    }

    const attemptCount = Math.max(notification.attemptCount, 0) + 1;

    if (input.ok) {
      await this.prisma.notification.update({
        where: { id: input.notificationId },
        data: {
          status: 'SENT',
          attemptCount,
          lastErrorCode: null,
          nextRetryAt: null,
          sentAt: new Date(),
        },
      });
      return { finalStatus: 'SENT', nextRetryAt: null };
    }

    if (
      attemptCount >= NOTIFICATION_LIMITS.maxAttempts ||
      !input.errorCode
    ) {
      await this.prisma.notification.update({
        where: { id: input.notificationId },
        data: {
          status: 'EXHAUSTED',
          attemptCount,
          lastErrorCode: input.errorCode ?? null,
          nextRetryAt: null,
        },
      });
      return { finalStatus: 'EXHAUSTED', nextRetryAt: null };
    }

    const backoffSeconds =
      NOTIFICATION_LIMITS.backoffSecondsByAttempt[attemptCount - 1];
    if (typeof backoffSeconds !== 'number') {
      await this.prisma.notification.update({
        where: { id: input.notificationId },
        data: {
          status: 'EXHAUSTED',
          attemptCount,
          lastErrorCode: input.errorCode,
          nextRetryAt: null,
        },
      });
      return { finalStatus: 'EXHAUSTED', nextRetryAt: null };
    }

    const nextRetryAt = new Date(Date.now() + backoffSeconds * 1000);
    await this.prisma.notification.update({
      where: { id: input.notificationId },
      data: {
        status: 'PENDING',
        attemptCount,
        lastErrorCode: input.errorCode,
        nextRetryAt,
      },
    });

    this.logger.log({
      event: 'notification.attempt.recorded',
      outcome: 'retry_scheduled',
      notificationId: input.notificationId,
      attemptCount,
    });
    return { finalStatus: 'PENDING', nextRetryAt };
  }

  private assertInput(input: {
    channel: string;
    body: string;
    destination: string;
    subject?: string;
    idempotencyKey: string;
  }): void {
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
    if (
      !input.destination ||
      input.destination.length > NOTIFICATION_LIMITS.maxDestinationLength ||
      !DESTINATION_PATTERN.test(input.destination)
    ) {
      throw Object.assign(new Error('invalid destination'), {
        code: 'NOTIFICATION_DESTINATION_INVALID',
      });
    }
    if (
      input.subject !== undefined &&
      input.subject.length > NOTIFICATION_LIMITS.maxSubjectLength
    ) {
      throw Object.assign(new Error('subject too long'), {
        code: 'NOTIFICATION_SUBJECT_INVALID',
      });
    }
    if (!input.idempotencyKey || input.idempotencyKey.trim().length < 8) {
      throw Object.assign(new Error('idempotency key required'), {
        code: 'NOTIFICATION_BODY_INVALID',
      });
    }
  }

  /** Auth-facing adapters (Module 3 contract). Delivery wiring arrives with the transport slice. */
  async sendVerificationToken(_email: string, _token: string): Promise<void> {
    // Bounded: token delivery is recorded as a notification in a later slice.
  }

  async sendResetToken(_email: string, _token: string): Promise<void> {
    // Bounded: token delivery is recorded as a notification in a later slice.
  }
}
