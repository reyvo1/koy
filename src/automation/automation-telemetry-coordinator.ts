import { Injectable, Logger } from '@nestjs/common';
import {
  AutomationExecutionActionStatus,
  AutomationExecutionStatus,
} from '@prisma/client';
import { AutomationCommandDispatcher } from './automation-command-dispatcher';
import { AutomationPrimitive } from './automation-domain.types';
import { AutomationEvaluator } from './automation-evaluator';
import { AutomationExecutionRepository } from './automation-execution.repository';
import {
  AUTOMATION_EXECUTION_PERSISTENCE_LIMITS,
  AutomationExecutionAncestryItem,
} from './automation-execution.persistence.types';
import {
  AutomationRuntimeCandidate,
  AutomationRuntimeReadRepository,
} from './automation-runtime-read.repository';
import {
  AUTOMATION_TELEMETRY_COORDINATION_LIMITS,
  AutomationTelemetryCapabilityReport,
  AutomationTelemetryCoordinationEnvelope,
  AutomationTelemetryCoordinationFailure,
  AutomationTelemetryCoordinationResult,
} from './automation-telemetry-coordination.types';
import { AutomationRetryReservationService } from './automation-retry-reservation.service';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CAPABILITY_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_.-]{0,127}$/;
const ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9_]{0,127}$/;

export const AUTOMATION_TELEMETRY_COORDINATION_ERROR_CODES = {
  InvalidEnvelope: 'AUTOMATION_TELEMETRY_COORDINATION_INVALID_ENVELOPE',
  CandidateFailed: 'AUTOMATION_TELEMETRY_COORDINATION_CANDIDATE_FAILED',
} as const;

export class AutomationTelemetryCoordinationError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AutomationTelemetryCoordinationError';
  }
}

@Injectable()
export class AutomationTelemetryCoordinator {
  private readonly logger = new Logger(AutomationTelemetryCoordinator.name);

  constructor(
    private readonly runtimeReads: AutomationRuntimeReadRepository,
    private readonly evaluator: AutomationEvaluator,
    private readonly executions: AutomationExecutionRepository,
    private readonly dispatcher: AutomationCommandDispatcher,
    private readonly retries: AutomationRetryReservationService,
  ) {}

  async coordinate(
    input: unknown,
  ): Promise<AutomationTelemetryCoordinationResult> {
    const envelope = this.validateEnvelope(input);
    await this.runtimeReads.assertAcceptedTelemetry(envelope);

    let candidateCount = 0;
    let matchedCount = 0;
    let reservationCreatedCount = 0;
    let reservationReplayedCount = 0;
    let dispatchedCount = 0;
    let suppressedCount = 0;
    let failedCount = 0;
    const failures: AutomationTelemetryCoordinationFailure[] = [];

    for (const report of this.sortReports(envelope.reports)) {
      const candidates = await this.runtimeReads.findEnabledCandidatesForReport(
        {
          tenantId: envelope.tenantId,
          deviceId: envelope.deviceId,
          capabilityId: report.capabilityId,
        },
      );
      candidateCount += candidates.length;

      for (const candidate of candidates) {
        try {
          const result = await this.coordinateCandidate(
            envelope,
            report,
            candidate,
          );
          if (result.matched) matchedCount += 1;
          if (result.reservationDisposition === 'CREATED') {
            reservationCreatedCount += 1;
          }
          if (result.reservationDisposition === 'REPLAYED') {
            reservationReplayedCount += 1;
          }
          if (result.dispatched) dispatchedCount += 1;
          if (result.suppressed) suppressedCount += 1;
        } catch (error) {
          failedCount += 1;
          const errorCode = this.errorCode(error);
          if (
            failures.length <
            AUTOMATION_TELEMETRY_COORDINATION_LIMITS.maxFailures
          ) {
            failures.push({
              automationId: candidate.automationId,
              capabilityKey: report.capabilityKey,
              errorCode,
            });
          }
          this.logger.warn({
            event: 'automation.telemetry_coordination.candidate_failed',
            outcome: 'failed',
            telemetryId: envelope.telemetryId,
            automationId: candidate.automationId,
            capabilityKey: report.capabilityKey,
            errorCode,
          });
        }
      }
    }

    const result = Object.freeze({
      reportCount: envelope.reports.length,
      candidateCount,
      matchedCount,
      reservationCreatedCount,
      reservationReplayedCount,
      dispatchedCount,
      suppressedCount,
      failedCount,
      failures: Object.freeze([...failures]),
    });

    this.logger.log({
      event: 'automation.telemetry_coordination.completed',
      outcome: failedCount === 0 ? 'succeeded' : 'partially_failed',
      telemetryId: envelope.telemetryId,
      reportCount: result.reportCount,
      candidateCount: result.candidateCount,
      matchedCount: result.matchedCount,
      reservationCreatedCount: result.reservationCreatedCount,
      reservationReplayedCount: result.reservationReplayedCount,
      dispatchedCount: result.dispatchedCount,
      suppressedCount: result.suppressedCount,
      failedCount: result.failedCount,
    });

    return result;
  }

  private async coordinateCandidate(
    envelope: AutomationTelemetryCoordinationEnvelope,
    report: AutomationTelemetryCapabilityReport,
    candidate: AutomationRuntimeCandidate,
  ): Promise<{
    readonly matched: boolean;
    readonly reservationDisposition: 'CREATED' | 'REPLAYED' | null;
    readonly dispatched: boolean;
    readonly suppressed: boolean;
  }> {
    const targets = this.runtimeReads.collectLatestValueTargets(
      candidate.definition.condition,
    );
    const latestValues = await this.runtimeReads.loadLatestValues(
      envelope.tenantId,
      targets,
    );
    const evaluation = this.evaluator.evaluate(
      {
        candidate: {
          automationId: candidate.automationId,
          tenantId: candidate.tenantId,
          enabled: candidate.enabled,
          revision: candidate.revision,
          definition: candidate.definition,
        },
        report: {
          tenantId: envelope.tenantId,
          deviceId: envelope.deviceId,
          capabilityKey: report.capabilityKey,
          value: report.value,
        },
        latestValues,
      },
      'APPROVED_RUNTIME',
    );

    if (!evaluation.matched) {
      return {
        matched: false,
        reservationDisposition: null,
        dispatched: false,
        suppressed: false,
      };
    }

    const reservation = await this.executions.reserveMatchedExecution({
      tenantId: envelope.tenantId,
      automationId: candidate.automationId,
      automationRevision: candidate.revision,
      triggerTelemetryId: envelope.telemetryId,
      triggerEventId: envelope.eventId,
      triggerDeviceId: envelope.deviceId,
      triggerCapabilityId: report.capabilityId,
      triggerCapabilityKey: report.capabilityKey,
      triggerValue: report.value,
      triggerOccurredAt: envelope.occurredAt,
      ancestry: envelope.ancestry,
      actionIntents: evaluation.actionIntents,
    });

    const status = reservation.execution.status;
    if (
      status === AutomationExecutionStatus.SUPPRESSED_COOLDOWN ||
      status === AutomationExecutionStatus.SUPPRESSED_LOOP
    ) {
      return {
        matched: true,
        reservationDisposition: reservation.disposition,
        dispatched: false,
        suppressed: true,
      };
    }

    if (
      status !== AutomationExecutionStatus.RESERVED &&
      status !== AutomationExecutionStatus.DISPATCHING
    ) {
      return {
        matched: true,
        reservationDisposition: reservation.disposition,
        dispatched: false,
        suppressed: false,
      };
    }

    await this.dispatcher.dispatchExecution({
      tenantId: envelope.tenantId,
      executionId: reservation.execution.id,
    });

    // Slice 11.12 — bounded synchronous retry pass. Runs at most once per
    // coordination call, only for a retry-eligible FAILED action, and never
    // re-evaluates the trigger or creates a second execution row.
    const retried = await this.maybeDispatchSingleRetry(
      envelope.tenantId,
      reservation.execution.id,
    );

    return {
      matched: true,
      reservationDisposition: reservation.disposition,
      dispatched: true,
      suppressed: false,
      ...(retried ? { retriedActionId: retried } : {}),
    };
  }

  private async maybeDispatchSingleRetry(
    tenantId: string,
    executionId: string,
  ): Promise<string | null> {
    let execution: Awaited<
      ReturnType<AutomationExecutionRepository['findTenantExecution']>
    >;
    try {
      execution = await this.executions.findTenantExecution(
        tenantId,
        executionId,
      );
    } catch {
      return null;
    }

    if (
      execution.status !== AutomationExecutionStatus.FAILED &&
      execution.status !== AutomationExecutionStatus.PARTIALLY_FAILED
    ) {
      return null;
    }

    const failed = execution.actions.filter(
      (action) => action.status === AutomationExecutionActionStatus.FAILED,
    );
    if (failed.length !== 1) return null;
    const action = failed[0];

    const decision = await this.retries.evaluateFailedAction({
      tenantId,
      executionId,
      actionId: action.actionId,
      errorCode: action.errorCode ?? '',
    });
    if (decision.kind !== 'RETRY_SCHEDULED') return null;

    const claimed = await this.retries.claimEligibleRetry({
      tenantId,
      executionId,
      actionId: action.actionId,
    });
    if (!claimed) return null;

    await this.dispatcher.dispatchExecution({ tenantId, executionId });

    this.logger.log({
      event: 'automation.telemetry_coordination.retry_dispatched',
      outcome: 'retried',
      executionId,
      actionId: action.actionId,
      attemptCount: decision.attemptCount,
    });
    return action.actionId;
  }

  private validateEnvelope(
    input: unknown,
  ): AutomationTelemetryCoordinationEnvelope {
    if (
      !this.isRecord(input) ||
      !this.hasExactKeys(input, [
        'ancestry',
        'deviceId',
        'eventId',
        'occurredAt',
        'origin',
        'reports',
        'telemetryId',
        'tenantId',
      ])
    ) {
      this.invalid('coordination envelope must contain exact keys');
    }

    this.assertUuid(input.tenantId, 'tenantId');
    this.assertUuid(input.telemetryId, 'telemetryId');
    this.assertUuid(input.deviceId, 'deviceId');
    if (
      typeof input.eventId !== 'string' ||
      input.eventId.length < 1 ||
      input.eventId.length >
        AUTOMATION_EXECUTION_PERSISTENCE_LIMITS.maxEventIdLength ||
      input.eventId.trim() !== input.eventId
    ) {
      this.invalid('eventId must be normalized and bounded');
    }
    if (
      !(input.occurredAt instanceof Date) ||
      !Number.isFinite(input.occurredAt.getTime())
    ) {
      this.invalid('occurredAt must be a valid Date');
    }
    if (
      input.origin !== 'EXTERNAL_ACCEPTED' &&
      input.origin !== 'AUTOMATION_DERIVED'
    ) {
      this.invalid('origin is invalid');
    }

    const ancestry = this.validateAncestry(input.ancestry);
    if (input.origin === 'AUTOMATION_DERIVED' && ancestry.length === 0) {
      this.invalid('automation-derived telemetry requires ancestry evidence');
    }

    if (
      !Array.isArray(input.reports) ||
      input.reports.length < 1 ||
      input.reports.length > AUTOMATION_TELEMETRY_COORDINATION_LIMITS.maxReports
    ) {
      this.invalid('reports must be non-empty and bounded');
    }

    const reports: AutomationTelemetryCapabilityReport[] = [];
    const capabilityIds = new Set<string>();
    const capabilityKeys = new Set<string>();
    for (const report of input.reports) {
      if (
        !this.isRecord(report) ||
        !this.hasExactKeys(report, ['capabilityId', 'capabilityKey', 'value'])
      ) {
        this.invalid('capability report must contain exact keys');
      }
      this.assertUuid(report.capabilityId, 'reports.capabilityId');
      if (
        typeof report.capabilityKey !== 'string' ||
        !CAPABILITY_KEY_PATTERN.test(report.capabilityKey)
      ) {
        this.invalid('reports.capabilityKey is invalid');
      }
      if (!this.isPrimitive(report.value)) {
        this.invalid('reports.value must be a bounded primitive');
      }
      if (
        capabilityIds.has(report.capabilityId) ||
        capabilityKeys.has(report.capabilityKey)
      ) {
        this.invalid('reports must not duplicate capability identity');
      }
      capabilityIds.add(report.capabilityId);
      capabilityKeys.add(report.capabilityKey);
      reports.push({
        capabilityId: report.capabilityId,
        capabilityKey: report.capabilityKey,
        value: report.value,
      });
    }

    return Object.freeze({
      tenantId: input.tenantId,
      telemetryId: input.telemetryId,
      deviceId: input.deviceId,
      eventId: input.eventId,
      occurredAt: new Date(input.occurredAt.getTime()),
      origin: input.origin,
      ancestry: Object.freeze(ancestry),
      reports: Object.freeze(reports),
    });
  }

  private validateAncestry(
    value: unknown,
  ): readonly AutomationExecutionAncestryItem[] {
    if (
      !Array.isArray(value) ||
      value.length > AUTOMATION_EXECUTION_PERSISTENCE_LIMITS.maxAncestryDepth
    ) {
      this.invalid('ancestry is invalid or exceeds the approved bound');
    }
    const items: AutomationExecutionAncestryItem[] = [];
    const executionIds = new Set<string>();
    for (const item of value) {
      if (
        !this.isRecord(item) ||
        !this.hasExactKeys(item, ['automationId', 'executionId'])
      ) {
        this.invalid('ancestry item must contain exact identity');
      }
      this.assertUuid(item.executionId, 'ancestry.executionId');
      this.assertUuid(item.automationId, 'ancestry.automationId');
      if (executionIds.has(item.executionId)) {
        this.invalid('ancestry must not duplicate execution identity');
      }
      executionIds.add(item.executionId);
      items.push({
        executionId: item.executionId,
        automationId: item.automationId,
      });
    }
    return items;
  }

  private sortReports(
    reports: readonly AutomationTelemetryCapabilityReport[],
  ): readonly AutomationTelemetryCapabilityReport[] {
    return [...reports].sort((left, right) => {
      const key = left.capabilityKey.localeCompare(right.capabilityKey);
      return key !== 0
        ? key
        : left.capabilityId.localeCompare(right.capabilityId);
    });
  }

  private errorCode(error: unknown): string {
    if (error && typeof error === 'object' && 'code' in error) {
      const code = (error as { code?: unknown }).code;
      if (typeof code === 'string' && ERROR_CODE_PATTERN.test(code)) {
        return code;
      }
    }
    return AUTOMATION_TELEMETRY_COORDINATION_ERROR_CODES.CandidateFailed;
  }

  private assertUuid(value: unknown, field: string): asserts value is string {
    if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
      this.invalid(`${field} must be a UUID`);
    }
  }

  private invalid(message: string): never {
    throw new AutomationTelemetryCoordinationError(
      AUTOMATION_TELEMETRY_COORDINATION_ERROR_CODES.InvalidEnvelope,
      message,
    );
  }

  private hasExactKeys(
    value: Record<string, unknown>,
    keys: readonly string[],
  ): boolean {
    const actual = Object.keys(value).sort();
    const expected = [...keys].sort();
    return (
      actual.length === expected.length &&
      actual.every((key, index) => key === expected[index])
    );
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  private isPrimitive(value: unknown): value is AutomationPrimitive {
    return (
      (typeof value === 'string' && value.length <= 1024) ||
      (typeof value === 'number' && Number.isFinite(value)) ||
      typeof value === 'boolean'
    );
  }
}
