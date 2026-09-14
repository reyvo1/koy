import { Injectable, Logger } from '@nestjs/common';
import {
  AutomationExecutionActionStatus,
  AutomationExecutionStatus,
  CommandStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AUTOMATION_DOMAIN_LIMITS } from './automation-domain.types';
import {
  AUTOMATION_RETRY_LIMITS,
  RETRYABLE_ACTION_ERROR_CODES,
} from './automation-execution.persistence.types';
import {
  AUTOMATION_EXECUTION_PERSISTENCE_ERROR_CODES,
  AutomationExecutionPersistenceError,
} from './automation-execution.persistence.error';
import {
  AUTOMATION_EXECUTION_PERSISTENCE_LIMITS,
  AutomationExecutionIdentityInput,
  AutomationExecutionTransitionDisposition,
  RecordAutomationActionFailedInput,
  RecordAutomationActionSucceededInput,
} from './automation-execution.persistence.types';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9_]{0,127}$/;
const PRIOR_ACTION_FAILED = 'PRIOR_ACTION_FAILED';
const SUCCESS_COMMAND_STATUSES = new Set<CommandStatus>([
  CommandStatus.SENT,
  CommandStatus.ACKNOWLEDGED,
]);
const FAILURE_COMMAND_STATUSES = new Set<CommandStatus>([
  CommandStatus.FAILED,
  CommandStatus.TIMED_OUT,
]);

const executionInclude = {
  actions: {
    orderBy: [{ position: 'asc' as const }, { id: 'asc' as const }],
  },
} satisfies Prisma.AutomationExecutionInclude;

export type AutomationExecutionTransitionRecord =
  Prisma.AutomationExecutionGetPayload<{ include: typeof executionInclude }>;
export type AutomationExecutionTransitionAction =
  AutomationExecutionTransitionRecord['actions'][number];

export interface AutomationExecutionActionClaimResult {
  readonly disposition: AutomationExecutionTransitionDisposition;
  readonly execution: AutomationExecutionTransitionRecord;
  readonly action: AutomationExecutionTransitionAction;
}

export interface AutomationExecutionActionCompletionResult {
  readonly disposition: AutomationExecutionTransitionDisposition;
  readonly execution: AutomationExecutionTransitionRecord;
  readonly action: AutomationExecutionTransitionAction;
}

type AutomationExecutionTransitionLogEvent =
  | 'automation.execution.action.claimed'
  | 'automation.execution.action.succeeded'
  | 'automation.execution.action.failed';

export function automationActionCommandIdempotencyKey(
  executionId: string,
  actionId: string,
): string {
  return `automation:${executionId}:${actionId}`;
}

@Injectable()
export class AutomationExecutionTransitionRepository {
  private readonly logger = new Logger(
    AutomationExecutionTransitionRepository.name,
  );

  constructor(private readonly prisma: PrismaService) {}

  async claimNextPendingAction(
    input: AutomationExecutionIdentityInput,
  ): Promise<AutomationExecutionActionClaimResult> {
    const normalized = this.validateIdentity(input);
    const result = await this.prisma.$transaction(async (transaction) => {
      await this.acquireExecutionTransitionLock(
        transaction,
        normalized.tenantId,
        normalized.executionId,
      );
      let execution = await this.loadExecution(
        transaction,
        normalized.tenantId,
        normalized.executionId,
      );

      const active = execution.actions.filter(
        (action) =>
          action.status === AutomationExecutionActionStatus.DISPATCHING,
      );
      if (active.length > 1) this.transitionConflict('multiple active actions');
      if (active[0]) {
        this.requireDispatching(execution, active[0]);
        return {
          disposition: 'REPLAYED' as const,
          execution,
          action: active[0],
        };
      }

      if (
        execution.status !== AutomationExecutionStatus.RESERVED &&
        execution.status !== AutomationExecutionStatus.DISPATCHING
      ) {
        this.transitionConflict('execution cannot claim an action');
      }

      const next = execution.actions.find(
        (action) => action.status === AutomationExecutionActionStatus.PENDING,
      );
      if (!next) this.transitionConflict('execution has no pending action');
      const earlier = execution.actions.filter(
        (action) => action.position < next.position,
      );
      const later = execution.actions.filter(
        (action) => action.position > next.position,
      );
      if (
        earlier.some(
          (action) =>
            action.status !== AutomationExecutionActionStatus.SUCCEEDED,
        ) ||
        later.some(
          (action) => action.status !== AutomationExecutionActionStatus.PENDING,
        ) ||
        (execution.status === AutomationExecutionStatus.RESERVED &&
          earlier.length > 0)
      ) {
        this.transitionConflict('persisted action order is invalid');
      }

      const databaseNow = await this.readDatabaseClock(transaction);
      if (execution.status === AutomationExecutionStatus.RESERVED) {
        const executionUpdate =
          await transaction.automationExecution.updateMany({
            where: {
              id: execution.id,
              tenantId: execution.tenantId,
              status: AutomationExecutionStatus.RESERVED,
            },
            data: {
              status: AutomationExecutionStatus.DISPATCHING,
              dispatchStartedAt: databaseNow,
            },
          });
        if (executionUpdate.count !== 1) {
          this.transitionConflict('execution claim lost a concurrent race');
        }
      } else if (!execution.dispatchStartedAt) {
        this.transitionConflict('dispatching execution has no start timestamp');
      }

      const actionUpdate =
        await transaction.automationExecutionAction.updateMany({
          where: {
            id: next.id,
            tenantId: execution.tenantId,
            executionId: execution.id,
            status: AutomationExecutionActionStatus.PENDING,
          },
          data: {
            status: AutomationExecutionActionStatus.DISPATCHING,
            dispatchStartedAt: databaseNow,
          },
        });
      if (actionUpdate.count !== 1) {
        this.transitionConflict('action claim lost a concurrent race');
      }

      execution = await this.loadExecution(
        transaction,
        normalized.tenantId,
        normalized.executionId,
      );
      const claimed = this.requireAction(execution, next.actionId);
      return {
        disposition: 'APPLIED' as const,
        execution,
        action: claimed,
      };
    });

    this.logTransition('automation.execution.action.claimed', result);
    return result;
  }

  async recordActionSucceeded(
    input: RecordAutomationActionSucceededInput,
  ): Promise<AutomationExecutionActionCompletionResult> {
    const normalized = this.validateSuccessInput(input);
    const result = await this.prisma.$transaction(async (transaction) => {
      await this.acquireExecutionTransitionLock(
        transaction,
        normalized.tenantId,
        normalized.executionId,
      );
      let execution = await this.loadExecution(
        transaction,
        normalized.tenantId,
        normalized.executionId,
      );
      const action = this.requireAction(execution, normalized.actionId);

      if (action.status === AutomationExecutionActionStatus.SUCCEEDED) {
        if (action.commandId !== normalized.commandId) {
          this.commandMismatch('successful action command identity conflict');
        }
        if (
          execution.status !== AutomationExecutionStatus.DISPATCHING &&
          execution.status !== AutomationExecutionStatus.SUCCEEDED &&
          execution.status !== AutomationExecutionStatus.PARTIALLY_FAILED
        ) {
          this.transitionConflict(
            'successful action replay has invalid execution state',
          );
        }
        return {
          disposition: 'REPLAYED' as const,
          execution,
          action,
        };
      }
      this.requireDispatching(execution, action);
      await this.assertCommand(
        transaction,
        execution,
        action,
        normalized.commandId,
        SUCCESS_COMMAND_STATUSES,
      );

      const databaseNow = await this.readDatabaseClock(transaction);
      const actionUpdate =
        await transaction.automationExecutionAction.updateMany({
          where: {
            id: action.id,
            tenantId: execution.tenantId,
            executionId: execution.id,
            status: AutomationExecutionActionStatus.DISPATCHING,
          },
          data: {
            status: AutomationExecutionActionStatus.SUCCEEDED,
            commandId: normalized.commandId,
            completedAt: databaseNow,
          },
        });
      if (actionUpdate.count !== 1) {
        this.transitionConflict('success transition lost a concurrent race');
      }

      const remaining = await transaction.automationExecutionAction.count({
        where: {
          tenantId: execution.tenantId,
          executionId: execution.id,
          status: {
            in: [
              AutomationExecutionActionStatus.PENDING,
              AutomationExecutionActionStatus.DISPATCHING,
            ],
          },
        },
      });
      if (remaining === 0) {
        const executionUpdate =
          await transaction.automationExecution.updateMany({
            where: {
              id: execution.id,
              tenantId: execution.tenantId,
              status: AutomationExecutionStatus.DISPATCHING,
            },
            data: {
              status: AutomationExecutionStatus.SUCCEEDED,
              completedAt: databaseNow,
            },
          });
        if (executionUpdate.count !== 1) {
          this.transitionConflict('execution success finalization failed');
        }
      }

      execution = await this.loadExecution(
        transaction,
        normalized.tenantId,
        normalized.executionId,
      );
      return {
        disposition: 'APPLIED' as const,
        execution,
        action: this.requireAction(execution, normalized.actionId),
      };
    });

    this.logTransition('automation.execution.action.succeeded', result);
    return result;
  }

  async recordActionFailed(
    input: RecordAutomationActionFailedInput,
  ): Promise<AutomationExecutionActionCompletionResult> {
    const normalized = this.validateFailureInput(input);
    const result = await this.prisma.$transaction(async (transaction) => {
      await this.acquireExecutionTransitionLock(
        transaction,
        normalized.tenantId,
        normalized.executionId,
      );
      let execution = await this.loadExecution(
        transaction,
        normalized.tenantId,
        normalized.executionId,
      );
      const action = this.requireAction(execution, normalized.actionId);

      if (action.status === AutomationExecutionActionStatus.FAILED) {
        if (
          action.errorCode !== normalized.errorCode ||
          action.commandId !== (normalized.commandId ?? null)
        ) {
          this.transitionConflict('failed action replay conflict');
        }
        if (
          execution.status !== AutomationExecutionStatus.FAILED &&
          execution.status !== AutomationExecutionStatus.PARTIALLY_FAILED
        ) {
          this.transitionConflict(
            'failed action replay has invalid execution state',
          );
        }
        return {
          disposition: 'REPLAYED' as const,
          execution,
          action,
        };
      }
      this.requireDispatching(execution, action);
      if (normalized.commandId) {
        await this.assertCommand(
          transaction,
          execution,
          action,
          normalized.commandId,
          FAILURE_COMMAND_STATUSES,
        );
      }

      const databaseNow = await this.readDatabaseClock(transaction);
      const succeededBefore = execution.actions.filter(
        (candidate) =>
          candidate.position < action.position &&
          candidate.status === AutomationExecutionActionStatus.SUCCEEDED,
      ).length;
      const finalStatus =
        succeededBefore > 0
          ? AutomationExecutionStatus.PARTIALLY_FAILED
          : AutomationExecutionStatus.FAILED;

      // Slice 11.11 — persisted retry bookkeeping. The attempt budget and the
      // deterministic bounded backoff live in PostgreSQL; retryable error codes
      // reserve exactly one more attempt until the budget is exhausted.
      const priorAttempts = Math.max(action.dispatchAttemptCount ?? 1, 1);
      const nextAttempt = priorAttempts + 1;
      const withinBudget =
        nextAttempt <= AUTOMATION_RETRY_LIMITS.maxDispatchAttempts &&
        RETRYABLE_ACTION_ERROR_CODES.has(normalized.errorCode);
      const backoffSeconds = withinBudget
        ? AUTOMATION_RETRY_LIMITS.backoffSecondsByAttempt[priorAttempts - 1]
        : undefined;
      const retryNextEligibleAt =
        typeof backoffSeconds === 'number'
          ? new Date(databaseNow.getTime() + backoffSeconds * 1000)
          : null;

      const actionUpdate =
        await transaction.automationExecutionAction.updateMany({
          where: {
            id: action.id,
            tenantId: execution.tenantId,
            executionId: execution.id,
            status: AutomationExecutionActionStatus.DISPATCHING,
          },
          data: {
            status: AutomationExecutionActionStatus.FAILED,
            commandId: normalized.commandId ?? null,
            errorCode: normalized.errorCode,
            completedAt: databaseNow,
            dispatchAttemptCount: priorAttempts,
            retryNextEligibleAt,
          },
        });
      if (actionUpdate.count !== 1) {
        this.transitionConflict('failure transition lost a concurrent race');
      }

      const skipped = await transaction.automationExecutionAction.updateMany({
        where: {
          tenantId: execution.tenantId,
          executionId: execution.id,
          position: { gt: action.position },
          status: AutomationExecutionActionStatus.PENDING,
        },
        data: {
          status: AutomationExecutionActionStatus.SKIPPED,
          errorCode: PRIOR_ACTION_FAILED,
          completedAt: databaseNow,
        },
      });
      const expectedSkipped = execution.actions.filter(
        (candidate) => candidate.position > action.position,
      ).length;
      if (skipped.count !== expectedSkipped) {
        this.transitionConflict('remaining action skip finalization failed');
      }

      const executionUpdate = await transaction.automationExecution.updateMany({
        where: {
          id: execution.id,
          tenantId: execution.tenantId,
          status: AutomationExecutionStatus.DISPATCHING,
        },
        data: { status: finalStatus, completedAt: databaseNow },
      });
      if (executionUpdate.count !== 1) {
        this.transitionConflict('execution failure finalization failed');
      }

      execution = await this.loadExecution(
        transaction,
        normalized.tenantId,
        normalized.executionId,
      );
      return {
        disposition: 'APPLIED' as const,
        execution,
        action: this.requireAction(execution, normalized.actionId),
      };
    });

    this.logTransition('automation.execution.action.failed', result);
    return result;
  }

  private async assertCommand(
    transaction: Prisma.TransactionClient,
    execution: AutomationExecutionTransitionRecord,
    action: AutomationExecutionTransitionAction,
    commandId: string,
    allowedStatuses: ReadonlySet<CommandStatus>,
  ): Promise<void> {
    const command = await transaction.deviceCommand.findFirst({
      where: {
        id: commandId,
        tenantId: execution.tenantId,
        deviceId: action.deviceId,
      },
      select: { idempotencyKey: true, status: true },
    });
    if (
      !command ||
      command.idempotencyKey !==
        automationActionCommandIdempotencyKey(execution.id, action.actionId) ||
      !allowedStatuses.has(command.status)
    ) {
      this.commandMismatch('device command does not match the action identity');
    }
  }

  private requireDispatching(
    execution: AutomationExecutionTransitionRecord,
    action: AutomationExecutionTransitionAction,
  ): void {
    const earlier = execution.actions.filter(
      (candidate) => candidate.position < action.position,
    );
    const later = execution.actions.filter(
      (candidate) => candidate.position > action.position,
    );
    if (
      execution.status !== AutomationExecutionStatus.DISPATCHING ||
      !execution.dispatchStartedAt ||
      execution.completedAt ||
      action.status !== AutomationExecutionActionStatus.DISPATCHING ||
      !action.dispatchStartedAt ||
      action.completedAt ||
      earlier.some(
        (candidate) =>
          candidate.status !== AutomationExecutionActionStatus.SUCCEEDED,
      ) ||
      later.some(
        (candidate) =>
          candidate.status !== AutomationExecutionActionStatus.PENDING,
      )
    ) {
      this.transitionConflict('action is not in a dispatchable transition');
    }
  }

  private requireAction(
    execution: AutomationExecutionTransitionRecord,
    actionId: string,
  ): AutomationExecutionTransitionAction {
    const action = execution.actions.find(
      (candidate) => candidate.actionId === actionId,
    );
    if (!action) {
      throw new AutomationExecutionPersistenceError(
        AUTOMATION_EXECUTION_PERSISTENCE_ERROR_CODES.ActionNotFound,
        'Automation execution action not found',
      );
    }
    return action;
  }

  private async acquireExecutionTransitionLock(
    transaction: Prisma.TransactionClient,
    tenantId: string,
    executionId: string,
  ): Promise<void> {
    const lockKey = `automation-execution-transition:${tenantId}:${executionId}`;
    await transaction.$executeRaw`
      SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))
    `;
  }

  private async readDatabaseClock(
    transaction: Prisma.TransactionClient,
  ): Promise<Date> {
    const rows = await transaction.$queryRaw<Array<{ databaseNow: Date }>>`
      SELECT clock_timestamp() AS "databaseNow"
    `;
    const databaseNow = rows[0]?.databaseNow;
    if (
      !(databaseNow instanceof Date) ||
      !Number.isFinite(databaseNow.getTime())
    ) {
      throw new AutomationExecutionPersistenceError(
        AUTOMATION_EXECUTION_PERSISTENCE_ERROR_CODES.DatabaseClockUnavailable,
        'PostgreSQL database clock did not return a valid timestamp',
      );
    }
    return databaseNow;
  }

  private async loadExecution(
    transaction: Prisma.TransactionClient,
    tenantId: string,
    executionId: string,
  ): Promise<AutomationExecutionTransitionRecord> {
    const execution = await transaction.automationExecution.findFirst({
      where: { id: executionId, tenantId },
      include: executionInclude,
    });
    if (!execution) {
      throw new AutomationExecutionPersistenceError(
        AUTOMATION_EXECUTION_PERSISTENCE_ERROR_CODES.ExecutionNotFound,
        'Automation execution not found',
      );
    }
    return execution;
  }

  private validateIdentity(
    input: AutomationExecutionIdentityInput,
  ): AutomationExecutionIdentityInput {
    if (!this.isRecord(input)) this.invalid('input must be an object');
    this.assertUuid(input.tenantId, 'tenantId');
    this.assertUuid(input.executionId, 'executionId');
    return { tenantId: input.tenantId, executionId: input.executionId };
  }

  private validateSuccessInput(
    input: RecordAutomationActionSucceededInput,
  ): RecordAutomationActionSucceededInput {
    const identity = this.validateIdentity(input);
    this.assertActionId(input.actionId);
    this.assertUuid(input.commandId, 'commandId');
    return {
      ...identity,
      actionId: input.actionId,
      commandId: input.commandId,
    };
  }

  private validateFailureInput(
    input: RecordAutomationActionFailedInput,
  ): RecordAutomationActionFailedInput {
    const identity = this.validateIdentity(input);
    this.assertActionId(input.actionId);
    if (
      typeof input.errorCode !== 'string' ||
      input.errorCode.length >
        AUTOMATION_EXECUTION_PERSISTENCE_LIMITS.maxTransitionErrorCodeLength ||
      !ERROR_CODE_PATTERN.test(input.errorCode)
    ) {
      this.invalid('errorCode must be a normalized bounded code');
    }
    if (input.commandId !== undefined) {
      this.assertUuid(input.commandId, 'commandId');
    }
    return {
      ...identity,
      actionId: input.actionId,
      errorCode: input.errorCode,
      ...(input.commandId ? { commandId: input.commandId } : {}),
    };
  }

  private assertActionId(value: unknown): asserts value is string {
    if (
      typeof value !== 'string' ||
      value.length > AUTOMATION_DOMAIN_LIMITS.maxActionIdLength ||
      !ACTION_ID_PATTERN.test(value)
    ) {
      this.invalid('actionId is invalid');
    }
  }

  private assertUuid(value: unknown, field: string): asserts value is string {
    if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
      this.invalid(`${field} must be a UUID`);
    }
  }

  private logTransition(
    event: AutomationExecutionTransitionLogEvent,
    result:
      | AutomationExecutionActionClaimResult
      | AutomationExecutionActionCompletionResult,
  ): void {
    const details = {
      outcome: result.disposition === 'APPLIED' ? 'applied' : 'replayed',
      executionStatus: result.execution.status,
      actionId: result.action.actionId,
      actionStatus: result.action.status,
    };

    if (event === 'automation.execution.action.claimed') {
      this.logger.log({
        event: 'automation.execution.action.claimed',
        ...details,
      });
      return;
    }

    if (event === 'automation.execution.action.succeeded') {
      this.logger.log({
        event: 'automation.execution.action.succeeded',
        ...details,
      });
      return;
    }

    this.logger.log({
      event: 'automation.execution.action.failed',
      ...details,
    });
  }

  private transitionConflict(message: string): never {
    throw new AutomationExecutionPersistenceError(
      AUTOMATION_EXECUTION_PERSISTENCE_ERROR_CODES.TransitionConflict,
      message,
    );
  }

  private commandMismatch(message: string): never {
    throw new AutomationExecutionPersistenceError(
      AUTOMATION_EXECUTION_PERSISTENCE_ERROR_CODES.CommandMismatch,
      message,
    );
  }

  private invalid(message: string): never {
    throw new AutomationExecutionPersistenceError(
      AUTOMATION_EXECUTION_PERSISTENCE_ERROR_CODES.InvalidInput,
      message,
    );
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
