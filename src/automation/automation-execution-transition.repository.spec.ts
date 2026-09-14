import {
  AutomationActionKind,
  AutomationExecutionActionStatus,
  AutomationExecutionStatus,
  CommandStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  AUTOMATION_EXECUTION_PERSISTENCE_ERROR_CODES,
  AutomationExecutionPersistenceError,
} from './automation-execution.persistence.error';
import {
  automationActionCommandIdempotencyKey,
  AutomationExecutionTransitionRepository,
} from './automation-execution-transition.repository';

interface MutableAction {
  id: string;
  tenantId: string;
  executionId: string;
  actionId: string;
  position: number;
  kind: AutomationActionKind;
  deviceId: string;
  capabilityId: string;
  capabilityKey: string;
  value: boolean;
  status: AutomationExecutionActionStatus;
  commandId: string | null;
  errorCode: string | null;
  dispatchStartedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
}

interface MutableExecution {
  id: string;
  tenantId: string;
  automationId: string;
  automationRevision: number;
  triggerTelemetryId: string;
  triggerEventId: string;
  triggerDeviceId: string;
  triggerCapabilityId: string;
  triggerCapabilityKey: string;
  triggerValue: number;
  triggerOccurredAt: Date;
  ancestry: unknown[];
  cooldownSeconds: number;
  cooldownEvaluatedAt: Date;
  cooldownReferenceExecutionId: string | null;
  status: AutomationExecutionStatus;
  decisionReason: string;
  dispatchStartedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  actions: MutableAction[];
}

describe('AutomationExecutionTransitionRepository', () => {
  const tenantId = '00000000-0000-4000-8000-000000000001';
  const executionId = '00000000-0000-4000-8000-000000000002';
  const automationId = '00000000-0000-4000-8000-000000000003';
  const firstCommandId = '00000000-0000-4000-8000-000000000004';
  const secondCommandId = '00000000-0000-4000-8000-000000000005';
  const databaseNow = new Date('2026-08-04T04:00:00.000Z');

  let execution: MutableExecution;
  let transaction: Record<string, any>;
  let repository: AutomationExecutionTransitionRepository;
  let command: { idempotencyKey: string; status: CommandStatus } | null;

  beforeEach(() => {
    execution = executionRecord();
    command = null;
    transaction = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      $queryRaw: jest.fn().mockResolvedValue([{ databaseNow }]),
      automationExecution: {
        findFirst: jest
          .fn()
          .mockImplementation(() => Promise.resolve(execution)),
        updateMany: jest.fn().mockImplementation(({ where, data }) => {
          if (execution.status !== where.status)
            return Promise.resolve({ count: 0 });
          Object.assign(execution, data);
          return Promise.resolve({ count: 1 });
        }),
      },
      automationExecutionAction: {
        updateMany: jest.fn().mockImplementation(({ where, data }) => {
          const matches = execution.actions.filter((action) => {
            if (where.id && action.id !== where.id) return false;
            if (where.status && action.status !== where.status) return false;
            if (
              where.position?.gt !== undefined &&
              action.position <= where.position.gt
            )
              return false;
            return true;
          });
          for (const action of matches) Object.assign(action, data);
          return Promise.resolve({ count: matches.length });
        }),
        count: jest
          .fn()
          .mockImplementation(({ where }) =>
            Promise.resolve(
              execution.actions.filter((action) =>
                where.status.in.includes(action.status),
              ).length,
            ),
          ),
      },
      deviceCommand: {
        findFirst: jest.fn().mockImplementation(() => Promise.resolve(command)),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback) => callback(transaction)),
    };
    repository = new AutomationExecutionTransitionRepository(
      prisma as unknown as PrismaService,
    );
  });

  it('claims the first pending action and starts the execution using PostgreSQL time', async () => {
    const result = await repository.claimNextPendingAction({
      tenantId,
      executionId,
    });

    expect(result).toMatchObject({
      disposition: 'APPLIED',
      execution: {
        status: AutomationExecutionStatus.DISPATCHING,
        dispatchStartedAt: databaseNow,
      },
      action: {
        actionId: 'first-action',
        status: AutomationExecutionActionStatus.DISPATCHING,
        dispatchStartedAt: databaseNow,
      },
    });
    expect(transaction.$executeRaw).toHaveBeenCalledTimes(1);
    expect(transaction.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('replays the currently dispatching action instead of advancing concurrently', async () => {
    execution.status = AutomationExecutionStatus.DISPATCHING;
    execution.dispatchStartedAt = databaseNow;
    execution.actions[0].status = AutomationExecutionActionStatus.DISPATCHING;
    execution.actions[0].dispatchStartedAt = databaseNow;

    await expect(
      repository.claimNextPendingAction({ tenantId, executionId }),
    ).resolves.toMatchObject({
      disposition: 'REPLAYED',
      action: { actionId: 'first-action' },
    });
    expect(transaction.$queryRaw).not.toHaveBeenCalled();
  });

  it('advances sequentially and finalizes a fully successful execution', async () => {
    await repository.claimNextPendingAction({ tenantId, executionId });
    command = {
      idempotencyKey: automationActionCommandIdempotencyKey(
        executionId,
        'first-action',
      ),
      status: CommandStatus.SENT,
    };
    await repository.recordActionSucceeded({
      tenantId,
      executionId,
      actionId: 'first-action',
      commandId: firstCommandId,
    });

    expect(execution.status).toBe(AutomationExecutionStatus.DISPATCHING);
    expect(execution.actions[0].status).toBe(
      AutomationExecutionActionStatus.SUCCEEDED,
    );

    await repository.claimNextPendingAction({ tenantId, executionId });
    command = {
      idempotencyKey: automationActionCommandIdempotencyKey(
        executionId,
        'second-action',
      ),
      status: CommandStatus.ACKNOWLEDGED,
    };
    const completed = await repository.recordActionSucceeded({
      tenantId,
      executionId,
      actionId: 'second-action',
      commandId: secondCommandId,
    });

    expect(completed.execution).toMatchObject({
      status: AutomationExecutionStatus.SUCCEEDED,
      completedAt: databaseNow,
    });
    expect(completed.execution.actions.map((action) => action.status)).toEqual([
      AutomationExecutionActionStatus.SUCCEEDED,
      AutomationExecutionActionStatus.SUCCEEDED,
    ]);
  });

  it('fails the execution and skips remaining actions after the first dispatch failure', async () => {
    await repository.claimNextPendingAction({ tenantId, executionId });
    command = {
      idempotencyKey: automationActionCommandIdempotencyKey(
        executionId,
        'first-action',
      ),
      status: CommandStatus.FAILED,
    };

    const result = await repository.recordActionFailed({
      tenantId,
      executionId,
      actionId: 'first-action',
      commandId: firstCommandId,
      errorCode: 'COMMAND_PUBLISH_FAILED',
    });

    expect(result.execution.status).toBe(AutomationExecutionStatus.FAILED);
    expect(result.execution.actions).toEqual([
      expect.objectContaining({
        status: AutomationExecutionActionStatus.FAILED,
        errorCode: 'COMMAND_PUBLISH_FAILED',
      }),
      expect.objectContaining({
        status: AutomationExecutionActionStatus.SKIPPED,
        errorCode: 'PRIOR_ACTION_FAILED',
      }),
    ]);
  });

  it('accepts a timed-out command as terminal failure evidence', async () => {
    await repository.claimNextPendingAction({ tenantId, executionId });
    command = {
      idempotencyKey: automationActionCommandIdempotencyKey(
        executionId,
        'first-action',
      ),
      status: CommandStatus.TIMED_OUT,
    };

    await expect(
      repository.recordActionFailed({
        tenantId,
        executionId,
        actionId: 'first-action',
        commandId: firstCommandId,
        errorCode: 'AUTOMATION_COMMAND_DISPATCH_COMMAND_TIMED_OUT',
      }),
    ).resolves.toMatchObject({
      execution: {
        status: AutomationExecutionStatus.FAILED,
        actions: [
          {
            actionId: 'first-action',
            status: AutomationExecutionActionStatus.FAILED,
            commandId: firstCommandId,
          },
          {
            actionId: 'second-action',
            status: AutomationExecutionActionStatus.SKIPPED,
          },
        ],
      },
    });
  });

  it('records PARTIALLY_FAILED when a later action fails after success', async () => {
    execution.status = AutomationExecutionStatus.DISPATCHING;
    execution.dispatchStartedAt = databaseNow;
    Object.assign(execution.actions[0], {
      status: AutomationExecutionActionStatus.SUCCEEDED,
      commandId: firstCommandId,
      dispatchStartedAt: databaseNow,
      completedAt: databaseNow,
    });
    Object.assign(execution.actions[1], {
      status: AutomationExecutionActionStatus.DISPATCHING,
      dispatchStartedAt: databaseNow,
    });

    const result = await repository.recordActionFailed({
      tenantId,
      executionId,
      actionId: 'second-action',
      errorCode: 'CAPABILITY_REJECTED',
    });

    expect(result.execution.status).toBe(
      AutomationExecutionStatus.PARTIALLY_FAILED,
    );

    command = {
      idempotencyKey: automationActionCommandIdempotencyKey(
        executionId,
        'first-action',
      ),
      status: CommandStatus.TIMED_OUT,
    };
    await expect(
      repository.recordActionSucceeded({
        tenantId,
        executionId,
        actionId: 'first-action',
        commandId: firstCommandId,
      }),
    ).resolves.toMatchObject({
      disposition: 'REPLAYED',
      execution: { status: AutomationExecutionStatus.PARTIALLY_FAILED },
      action: { status: AutomationExecutionActionStatus.SUCCEEDED },
    });
  });

  it('rejects suppressed and terminal executions without modifying their audit history', async () => {
    execution.status = AutomationExecutionStatus.SUPPRESSED_COOLDOWN;
    execution.completedAt = databaseNow;
    for (const action of execution.actions) {
      action.status = AutomationExecutionActionStatus.SKIPPED;
      action.errorCode = 'EXECUTION_SUPPRESSED_COOLDOWN';
      action.completedAt = databaseNow;
    }

    await expect(
      repository.claimNextPendingAction({ tenantId, executionId }),
    ).rejects.toMatchObject<Partial<AutomationExecutionPersistenceError>>({
      code: AUTOMATION_EXECUTION_PERSISTENCE_ERROR_CODES.TransitionConflict,
    });
  });

  it('records retryable failure with attempt count and bounded next-eligible time', async () => {
    await repository.claimNextPendingAction({ tenantId, executionId });
    command = {
      idempotencyKey: automationActionCommandIdempotencyKey(
        executionId,
        'first-action',
      ),
      status: CommandStatus.FAILED,
    };

    const result = await repository.recordActionFailed({
      tenantId,
      executionId,
      actionId: 'first-action',
      commandId: firstCommandId,
      errorCode: 'COMMAND_PUBLISH_FAILED',
    });

    expect(result.execution.status).toBe(AutomationExecutionStatus.FAILED);
    expect(result.execution.actions[0]).toMatchObject({
      status: AutomationExecutionActionStatus.FAILED,
      dispatchAttemptCount: 1,
      retryNextEligibleAt: new Date(databaseNow.getTime() + 5_000),
    });
  });

  it('does not schedule a retry for non-retryable error codes', async () => {
    await repository.claimNextPendingAction({ tenantId, executionId });
    command = {
      idempotencyKey: automationActionCommandIdempotencyKey(
        executionId,
        'first-action',
      ),
      status: CommandStatus.SENT,
    };
    await repository.recordActionSucceeded({
      tenantId,
      executionId,
      actionId: 'first-action',
      commandId: firstCommandId,
    });

    await repository.claimNextPendingAction({ tenantId, executionId });
    const result = await repository.recordActionFailed({
      tenantId,
      executionId,
      actionId: 'second-action',
      errorCode: 'AUTOMATION_COMMAND_DISPATCH_ACTION_KIND_INVALID',
    });

    expect(result.execution.actions[1]).toMatchObject({
      status: AutomationExecutionActionStatus.FAILED,
      dispatchAttemptCount: 1,
      retryNextEligibleAt: null,
    });
  });

  it('exhausts the retry budget at the third failed attempt', async () => {
    execution.status = AutomationExecutionStatus.DISPATCHING;
    execution.dispatchStartedAt = databaseNow;
    Object.assign(execution.actions[0], {
      status: AutomationExecutionActionStatus.DISPATCHING,
      dispatchStartedAt: databaseNow,
      dispatchAttemptCount: 2,
      retryNextEligibleAt: databaseNow,
    });
    command = null;

    const result = await repository.recordActionFailed({
      tenantId,
      executionId,
      actionId: 'first-action',
      errorCode: 'COMMAND_PUBLISH_FAILED',
    });

    expect(result.execution.actions[0]).toMatchObject({
      status: AutomationExecutionActionStatus.FAILED,
      dispatchAttemptCount: 2,
      retryNextEligibleAt: new Date(databaseNow.getTime() + 15_000),
    });
  });

  it('rejects a command that does not use the deterministic action identity', async () => {
    execution.status = AutomationExecutionStatus.DISPATCHING;
    execution.dispatchStartedAt = databaseNow;
    execution.actions[0].status = AutomationExecutionActionStatus.DISPATCHING;
    execution.actions[0].dispatchStartedAt = databaseNow;
    command = { idempotencyKey: 'wrong-key', status: CommandStatus.SENT };

    await expect(
      repository.recordActionSucceeded({
        tenantId,
        executionId,
        actionId: 'first-action',
        commandId: firstCommandId,
      }),
    ).rejects.toMatchObject<Partial<AutomationExecutionPersistenceError>>({
      code: AUTOMATION_EXECUTION_PERSISTENCE_ERROR_CODES.CommandMismatch,
    });
  });

  function executionRecord(): MutableExecution {
    const createdAt = new Date('2026-08-04T03:59:00.000Z');
    return {
      id: executionId,
      tenantId,
      automationId,
      automationRevision: 1,
      triggerTelemetryId: '00000000-0000-4000-8000-000000000010',
      triggerEventId: 'evt-transition',
      triggerDeviceId: '00000000-0000-4000-8000-000000000011',
      triggerCapabilityId: '00000000-0000-4000-8000-000000000012',
      triggerCapabilityKey: 'temperature',
      triggerValue: 30,
      triggerOccurredAt: createdAt,
      ancestry: [],
      cooldownSeconds: 0,
      cooldownEvaluatedAt: createdAt,
      cooldownReferenceExecutionId: null,
      status: AutomationExecutionStatus.RESERVED,
      decisionReason: 'CONDITION_MATCHED',
      dispatchStartedAt: null,
      completedAt: null,
      createdAt,
      actions: [
        actionRecord('first-action', 0, '00000000-0000-4000-8000-000000000020'),
        actionRecord(
          'second-action',
          1,
          '00000000-0000-4000-8000-000000000021',
        ),
      ],
    };
  }

  function actionRecord(
    actionId: string,
    position: number,
    id: string,
  ): MutableAction {
    return {
      id,
      tenantId,
      executionId,
      actionId,
      position,
      kind: AutomationActionKind.DEVICE_COMMAND,
      deviceId: `00000000-0000-4000-8000-00000000003${position}`,
      capabilityId: `00000000-0000-4000-8000-00000000004${position}`,
      capabilityKey: 'enabled',
      value: true,
      status: AutomationExecutionActionStatus.PENDING,
      commandId: null,
      errorCode: null,
      dispatchStartedAt: null,
      completedAt: null,
      createdAt: new Date('2026-08-04T03:59:00.000Z'),
    };
  }
});
