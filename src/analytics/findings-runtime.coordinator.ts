import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { toStructuredLogError } from '../common/logging/log-error';
import { NotificationService } from '../notification/notification.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  TelemetryAnomalyDetector,
  TelemetryAnomalyDetectorCreatedFinding,
} from './telemetry-anomaly-detector.service';
import { findingsRuntimeCooldownSeconds } from './findings-runtime.policy';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CAPABILITY_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_.-]{0,127}$/;
const ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9_]{0,127}$/;
const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

export const FINDINGS_RUNTIME_ERROR_CODES = {
  Failed: 'ANALYTICS_FINDINGS_RUNTIME_FAILED',
} as const;

export const FINDINGS_RUNTIME_LIMITS = {
  maxCapabilitiesPerEvent: 16,
  maxRecipientsPerFinding: 50,
  throttleCacheCapacity: 10_000,
} as const;

export interface FindingsRuntimeInput {
  readonly tenantId: string;
  readonly deviceId: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly now?: Date;
}

export interface FindingsRuntimeResult {
  readonly evaluatedCapabilities: number;
  readonly findings: number;
  readonly notificationsEnqueued: number;
  readonly skippedByCooldown: number;
  readonly failures: number;
}

/**
 * Wave 11 anomaly detection, runtime slice.
 *
 * The detector and the durable notification queue both existed and neither was
 * wired to the other: the detector only ran from probes, and nothing enqueued a
 * notification outside the auth flows. A device could swing wildly and every
 * operator surface would stay silent unless someone happened to run the probe.
 *
 * This coordinator is the missing edge, and it is deliberately shaped like the
 * automation coordinator next door: telemetry ingest calls it fire-and-forget,
 * it is gated by an exact-true environment flag (fail-closed), and a failure
 * anywhere inside can never affect the ingest that triggered it.
 *
 * Three bounds keep it from becoming the heaviest writer in the system:
 *   - only finite numeric capability readings are candidates (the detector
 *     cannot judge anything else anyway);
 *   - a per device+capability cooldown limits how often one reading stream
 *     triggers an evaluation (the window scan is real work);
 *   - at most {@link FINDINGS_RUNTIME_LIMITS.maxCapabilitiesPerEvent} sorted
 *     capability keys are evaluated per accepted telemetry event, so a single
 *     oversized payload cannot turn into an unbounded sweep.
 *
 * Fan-out is CRITICAL-only and honours the two existing contracts instead of
 * inventing new ones: recipients come from real `notification_preferences`
 * rows (EMAIL, enabled), falling back to the tenant's ACTIVE admins when a
 * tenant has no explicit preference at all, and every message is enqueued with
 * a deterministic idempotency key so a redelivery of the same finding is a
 * replay, not a second email.
 */
@Injectable()
export class FindingsRuntimeCoordinator {
  private readonly logger = new Logger(FindingsRuntimeCoordinator.name);

  /**
   * Per device+capability last-evaluation clock. Process-local and bounded:
   * the exact worst case is "one extra evaluation after a restart or behind a
   * second replica", which the finding dedupe already absorbs. The map is
   * never allowed to grow past `throttleCacheCapacity`.
   */
  private readonly lastEvaluationByKey = new Map<string, number>();

  constructor(
    private readonly detector: TelemetryAnomalyDetector,
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
    private readonly config: ConfigService,
  ) {}

  async coordinate(input: FindingsRuntimeInput): Promise<FindingsRuntimeResult> {
    if (
      !UUID_PATTERN.test(input.tenantId) ||
      !UUID_PATTERN.test(input.deviceId)
    ) {
      this.logger.warn({
        event: 'analytics.findings_runtime.rejected',
        outcome: 'invalid_identity',
      });
      return this.emptyResult();
    }

    const capabilityKeys = this.numericCapabilityKeys(input.payload);
    if (capabilityKeys.length === 0) {
      return this.emptyResult();
    }

    const now = input.now ?? new Date();
    const nowMs = Number.isFinite(now.getTime()) ? now.getTime() : null;
    const cooldownMs = findingsRuntimeCooldownSeconds() * 1000;

    let evaluatedCapabilities = 0;
    let findings = 0;
    let notificationsEnqueued = 0;
    let skippedByCooldown = 0;
    let failures = 0;

    for (const capabilityKey of capabilityKeys) {
      const throttleKey = `${input.tenantId}:${input.deviceId}:${capabilityKey}`;
      if (nowMs !== null) {
        const lastMs = this.lastEvaluationByKey.get(throttleKey);
        if (lastMs !== undefined && nowMs - lastMs < cooldownMs) {
          skippedByCooldown += 1;
          continue;
        }
        this.rememberEvaluation(throttleKey, nowMs);
      }

      try {
        const result = await this.detector.detect({
          tenantId: input.tenantId,
          deviceId: input.deviceId,
          capabilityKey,
          now,
        });
        evaluatedCapabilities += 1;
        findings += result.findings;

        for (const finding of result.createdFindings) {
          if (finding.severity !== 'CRITICAL') continue;
          notificationsEnqueued += await this.fanOutCriticalFinding(
            input.tenantId,
            input.deviceId,
            finding,
          );
        }
      } catch (error) {
        failures += 1;
        this.logger.warn({
          event: 'analytics.findings_runtime.evaluation_failed',
          outcome: 'failed',
          capabilityKey,
          ...this.errorCode(error),
        });
      }
    }

    const result: FindingsRuntimeResult = Object.freeze({
      evaluatedCapabilities,
      findings,
      notificationsEnqueued,
      skippedByCooldown,
      failures,
    });

    this.logger.log({
      event: 'analytics.findings_runtime.completed',
      outcome: failures === 0 ? 'succeeded' : 'partially_failed',
      deviceId: input.deviceId,
      ...result,
    });

    return result;
  }

  /**
   * One idempotent enqueue per recipient for one CRITICAL finding.
   *
   * The message body is a pure function of the finding row: the same finding
   * always produces the same body, which is what makes the idempotency key
   * (finding + recipient) safe to retry against the queue's own replay check.
   */
  private async fanOutCriticalFinding(
    tenantId: string,
    deviceId: string,
    finding: TelemetryAnomalyDetectorCreatedFinding,
  ): Promise<number> {
    if (!this.config.get<boolean>('NOTIFICATION_RUNTIME_ENABLED', false)) {
      return 0;
    }

    let recipients: readonly string[];
    try {
      recipients = await this.criticalRecipients(tenantId);
    } catch (error) {
      this.logger.warn({
        event: 'analytics.findings_runtime.recipients_failed',
        outcome: 'failed',
        ...this.errorCode(error),
      });
      return 0;
    }

    if (recipients.length === 0) {
      this.logger.log({
        event: 'analytics.findings_runtime.skipped',
        outcome: 'no_recipients',
        findingId: finding.id,
      });
      return 0;
    }

    const subject = `[CRITICAL] Anomaly detected: ${finding.capabilityKey}`;
    const body = [
      'A CRITICAL anomaly finding was recorded for your tenant.',
      '',
      `Capability: ${finding.capabilityKey}`,
      `Device: ${deviceId}`,
      `Finding: ${finding.id}`,
      `Detector: ${TelemetryAnomalyDetector.DETECTOR_VERSION}`,
      `Summary: ${finding.summary}`,
      '',
      'Review the finding and its evidence in the alerts view before acting.',
    ].join('\n');

    let enqueued = 0;
    for (const email of recipients) {
      try {
        const outcome = await this.notifications.enqueue({
          tenantId,
          channel: 'EMAIL',
          destination: email,
          subject,
          body,
          templateKey: 'analytics.finding.critical',
          idempotencyKey: `analytics-finding:${finding.id}:${email}`,
        });
        if (outcome.created) enqueued += 1;
      } catch (error) {
        this.logger.warn({
          event: 'analytics.findings_runtime.fanout_failed',
          outcome: 'failed',
          findingId: finding.id,
          ...this.errorCode(error),
        });
      }
    }
    return enqueued;
  }

  /**
   * Explicit EMAIL preferences win; a tenant that has configured none at all
   * falls back to its ACTIVE admins, because otherwise the very tenants that
   * have never opened a preferences screen are exactly the ones that never get
   * the alert. Both branches are bounded, deterministic and deduplicated on
   * the lowercased address.
   */
  private async criticalRecipients(tenantId: string): Promise<readonly string[]> {
    const preferred = await this.prisma.membership.findMany({
      where: {
        tenantId,
        status: 'ACTIVE',
        notificationPreferences: {
          some: { channel: 'EMAIL', enabled: true },
        },
      },
      select: { user: { select: { email: true } } },
      orderBy: { id: 'asc' },
      take: FINDINGS_RUNTIME_LIMITS.maxRecipientsPerFinding,
    });

    let emails = preferred.map((membership) => membership.user.email);
    if (emails.length === 0) {
      const admins = await this.prisma.membership.findMany({
        where: {
          tenantId,
          status: 'ACTIVE',
          role: { in: ['ADMIN', 'PLATFORM_ADMIN'] },
        },
        select: { user: { select: { email: true } } },
        orderBy: { id: 'asc' },
        take: FINDINGS_RUNTIME_LIMITS.maxRecipientsPerFinding,
      });
      emails = admins.map((membership) => membership.user.email);
    }

    const seen = new Set<string>();
    const deduplicated: string[] = [];
    for (const email of emails) {
      const dedupeKey = email.toLowerCase();
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      deduplicated.push(email);
    }
    return Object.freeze(deduplicated);
  }

  /**
   * Only top-level finite numbers count, addressed by a safe capability-key
   * shape. Nested objects are not traversed: a reading the detector cannot
   * judge is not a reading, and traversing arbitrary payload shapes is how an
   * ingest path gets quadratic.
   */
  private numericCapabilityKeys(
    payload: Readonly<Record<string, unknown>>,
  ): readonly string[] {
    const keys: string[] = [];
    for (const [key, value] of Object.entries(payload)) {
      if (keys.length >= FINDINGS_RUNTIME_LIMITS.maxCapabilitiesPerEvent) {
        break;
      }
      if (UNSAFE_KEYS.has(key) || !CAPABILITY_KEY_PATTERN.test(key)) continue;
      if (typeof value !== 'number' || !Number.isFinite(value)) continue;
      keys.push(key);
    }
    return Object.freeze(keys.sort((left, right) => left.localeCompare(right)));
  }

  private rememberEvaluation(throttleKey: string, atMs: number): void {
    if (
      !this.lastEvaluationByKey.has(throttleKey) &&
      this.lastEvaluationByKey.size >= FINDINGS_RUNTIME_LIMITS.throttleCacheCapacity
    ) {
      const oldest = this.lastEvaluationByKey.keys().next().value;
      if (oldest !== undefined) {
        this.lastEvaluationByKey.delete(oldest);
      }
    }
    this.lastEvaluationByKey.set(throttleKey, atMs);
  }

  private errorCode(error: unknown): { errorCode: string } {
    const structured = toStructuredLogError(error);
    return {
      errorCode:
        structured.code && ERROR_CODE_PATTERN.test(structured.code)
          ? structured.code
          : FINDINGS_RUNTIME_ERROR_CODES.Failed,
    };
  }

  private emptyResult(): FindingsRuntimeResult {
    return Object.freeze({
      evaluatedCapabilities: 0,
      findings: 0,
      notificationsEnqueued: 0,
      skippedByCooldown: 0,
      failures: 0,
    });
  }
}
