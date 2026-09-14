import { Injectable, Logger } from '@nestjs/common';
import {
  AutomationExecutionActionStatus,
  AutomationExecutionStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AUTOMATION_EXECUTION_PERSISTENCE_ERROR_CODES } from './automation-execution.persistence.error';
import {
  AUTOMATION_RETRY_LIMITS,
  AutomationActionRetryDecision,
  RETRYABLE_ACTION_ERROR_CODES,
} from './automation-execution.persistence.types';

/**
 * Module 11 Slice 11.10 — Automation Retry Safety Foundation.
 *
 * PostgreSQL-authoritative bounded retry reservation for failed automation
 * action dispatch. Persisted attempt count and next-eligible time are the only
 * authoritative retry state: process-local timers, Redis-only state, and MQTT
 * delivery counts are never consulted. The command idempotency key
 * `automation:<executionId>:<actionId>` is unchanged across attempts.
 *
 * This service is internal-only: no worker, queue, scheduler, polling loop,
 * telemetry hook, public endpoint, or application runtime wiring exists here.
 */
@Injectable()
export class AutomationRetryReservationService {
  private readonly logger = new Logger(AutomationRetryReservationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Decide the retry fate of a failed action from persisted state only.
   * Fails closed when evidence is missing or outside the tenant boundary.
   */
  async evaluateFailedAction(input: {
    readonly tenantId: string;
    readonly executionId: string;
    readonly actionId: string;
    readonly errorCode: string;
  }): Promise<AutomationActionRetryDecision> {
    const action = await this.prisma.automationExecutionAction.findFirst({
      where: {
        tenantId: input.tenantId,
        executionId: input.executionId,
        actionId: input.actionId,
      },
    });

    if (!action) {
      throw Object.assign(
        new Error('failed action not found for retry evaluation'),
        {
          code: AUTOMATION_EXECUTION_PERSISTENCE_ERROR_CODES.ActionNotFound,
        },
      );
    }

    if (action.status !== AutomationExecutionActionStatus.FAILED) {
      throw Object.assign(
        new Error('retry evaluation requires a FAILED action'),
        {
          code: AUTOMATION_EXECUTION_PERSISTENCE_ERROR_CODES.RetryNotEligible,
        },
      );
    }

    if (!RETRYABLE_ACTION_ERROR_CODES.has(action.errorCode ?? '')) {
      return { kind: 'TERMINAL_FAILURE' };
    }

    const attemptCount = action.dispatchAttemptCount;
    if (
      !Number.isInteger(attemptCount) ||
      attemptCount < 1 ||
      attemptCount > AUTOMATION_RETRY_LIMITS.maxDispatchAttempts
    ) {
      // Fail closed on missing/conflicting/exhausted persisted evidence.
      throw Object.assign(
        new Error(`invalid persisted attempt count: ${attemptCount}`),
        { code: AUTOMATION_EXECUTION_PERSISTENCE_ERROR_CODES.RetryExhausted },
      );
    }

    if (attemptCount >= AUTOMATION_RETRY_LIMITS.maxDispatchAttempts) {
      return { kind: 'TERMINAL_FAILURE' };
    }

    const backoffSeconds =
      AUTOMATION_RETRY_LIMITS.backoffSecondsByAttempt[attemptCount - 1];
    if (typeof backoffSeconds !== 'number') {
      throw Object.assign(
        new Error(`no bounded backoff for attempt ${attemptCount}`),
        { code: AUTOMATION_EXECUTION_PERSISTENCE_ERROR_CODES.RetryExhausted },
      );
    }
    const nextEligibleAt = new Date(
      action.completedAt.getTime() + backoffSeconds * 1000,
    );

    this.logger.log({
      event: 'automation.retry.reserved',
      outcome: 'retry_scheduled',
      executionId: input.executionId,
      actionId: input.actionId,
      attemptCount,
    });

    return {
      kind: 'RETRY_SCHEDULED',
      attemptCount: attemptCount + 1,
      nextEligibleAt,
    };
  }

  /**
   * Claim a failed action for exactly one retry attempt when its persisted
   * next-eligible time has passed and its attempt budget allows it. Returns
   * null when the retry window has not opened yet or the action cannot retry.
   */
  async claimEligibleRetry(input: {
    readonly tenantId: string;
    readonly executionId: string;
    readonly actionId: string;
  }): Promise<boolean> {
    const result = await this.prisma.$transaction(async (transaction) => {
      const execution = await transaction.automationExecution.findFirst({
        where: { tenantId: input.tenantId, id: input.executionId },
      });
      if (!execution || execution.status !== AutomationExecutionStatus.FAILED) {
        return false;
      }

      const action = await transaction.automationExecutionAction.findFirst({
        where: {
          tenantId: input.tenantId,
          executionId: input.executionId,
          actionId: input.actionId,
        },
      });
      if (!action || action.status !== AutomationExecutionActionStatus.FAILED) {
        return false;
      }

      if (
        action.dispatchAttemptCount >= AUTOMATION_RETRY_LIMITS.maxDispatchAttempts ||
        !action.retryNextEligibleAt ||
        !action.completedAt
      ) {
        return false;
      }

      const rows = (await transaction.$queryRaw`
        SELECT clock_timestamp() AS "databaseNow"
      `) as Array<{ databaseNow: Date }>;
      const databaseNow = rows[0]?.databaseNow;
      if (!(databaseNow instanceof Date) || !Number.isFinite(databaseNow.getTime())) {
        throw Object.assign(
          new Error('PostgreSQL database clock did not return a valid timestamp'),
          {
            code:
              AUTOMATION_EXECUTION_PERSISTENCE_ERROR_CODES.DatabaseClockUnavailable,
          },
        );
      }

      if (databaseNow.getTime() < action.retryNextEligibleAt.getTime()) {
        return false;
      }

      // Reset to DISPATCHING for one more attempt; downstream transitions own
      // the terminal state again. Idempotency key is derived, never stored.
      const update = await transaction.automationExecution.updateMany({
        where: {
          id: execution.id,
          tenantId: execution.tenantId,
          status: AutomationExecutionStatus.FAILED,
        },
        data: {
          status: AutomationExecutionStatus.DISPATCHING,
          completedAt: null,
        },
      });
      if (update.count !== 1) return false;

      const actionUpdate = await transaction.automationExecutionAction.updateMany(
        {
          where: {
            id: action.id,
            tenantId: action.tenantId,
            status: AutomationExecutionActionStatus.FAILED,
          },
          data: {
            status: AutomationExecutionActionStatus.DISPATCHING,
            dispatchAttemptCount: action.dispatchAttemptCount + 1,
            completedAt: null,
          },
        },
      );
      return actionUpdate.count === 1;
    });

    if (result) {
      this.logger.log({
        event: 'automation.retry.claimed',
        outcome: 'claimed',
        executionId: input.executionId,
        actionId: input.actionId,
      });
    }
    return result;
  }
}
