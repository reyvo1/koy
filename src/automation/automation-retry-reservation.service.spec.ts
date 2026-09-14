import { AutomationExecutionActionStatus, AutomationExecutionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AUTOMATION_EXECUTION_PERSISTENCE_ERROR_CODES } from './automation-execution.persistence.error';
import {
  AUTOMATION_RETRY_LIMITS,
  RETRYABLE_ACTION_ERROR_CODES,
} from './automation-execution.persistence.types';
import { AutomationRetryReservationService } from './automation-retry-reservation.service';

describe('AutomationRetryReservationService', () => {
  const tenantId = '00000000-0000-4000-8000-000000000001';
  const executionId = '00000000-0000-4000-8000-000000000002';
  const actionId = 'first-action';
  const completedAt = new Date('2026-08-22T04:00:00.000Z');
  const databaseNow = new Date('2026-08-22T04:01:00.000Z');

  let action: Record<string, any>;
  let execution: Record<string, any>;
  let transaction: Record<string, any>;
  let service: AutomationRetryReservationService;

  beforeEach(() => {
    action = {
      tenantId,
      executionId,
      actionId,
      status: AutomationExecutionActionStatus.FAILED,
      errorCode: 'COMMAND_PUBLISH_FAILED',
      dispatchAttemptCount: 1,
      retryNextEligibleAt: null,
      completedAt,
    };
    execution = { id: executionId, tenantId, status: AutomationExecutionStatus.FAILED };
    transaction = {
      $queryRaw: jest.fn().mockResolvedValue([{ databaseNow }]),
      automationExecution: {
        findFirst: jest.fn().mockResolvedValue(execution),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      automationExecutionAction: {
        findFirst: jest.fn().mockResolvedValue(action),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback: (tx: unknown) => unknown) => callback(transaction)),
      automationExecutionAction: {
        findFirst: jest.fn().mockResolvedValue(action),
      },
    };
    service = new AutomationRetryReservationService(prisma as unknown as PrismaService);
  });

  it('keeps the bounded policy contract', () => {
    expect(AUTOMATION_RETRY_LIMITS.maxDispatchAttempts).toBe(3);
    expect(AUTOMATION_RETRY_LIMITS.backoffSecondsByAttempt).toEqual([5, 15]);
    expect(RETRYABLE_ACTION_ERROR_CODES.has('COMMAND_PUBLISH_FAILED')).toBe(true);
    expect(RETRYABLE_ACTION_ERROR_CODES.has('AUTOMATION_COMMAND_DISPATCH_ACTION_KIND_INVALID')).toBe(
      false,
    );
  });

  it('schedules exactly one bounded retry after the first transient failure', async () => {
    await expect(
      service.evaluateFailedAction({ tenantId, executionId, actionId, errorCode: action.errorCode }),
    ).resolves.toEqual({
      kind: 'RETRY_SCHEDULED',
      attemptCount: 2,
      nextEligibleAt: new Date(completedAt.getTime() + 5_000),
    });
  });

  it('uses the deterministic second-stage backoff after the second attempt', async () => {
    action.dispatchAttemptCount = 2;
    action.retryNextEligibleAt = new Date(completedAt.getTime() + 5_000);

    await expect(
      service.evaluateFailedAction({ tenantId, executionId, actionId, errorCode: action.errorCode }),
    ).resolves.toEqual({
      kind: 'RETRY_SCHEDULED',
      attemptCount: 3,
      nextEligibleAt: new Date(completedAt.getTime() + 15_000),
    });
  });

  it('marks the failure terminal when the attempt budget is exhausted', async () => {
    action.dispatchAttemptCount = 3;

    await expect(
      service.evaluateFailedAction({ tenantId, executionId, actionId, errorCode: action.errorCode }),
    ).resolves.toEqual({ kind: 'TERMINAL_FAILURE' });
  });

  it('never retries non-allowlisted error codes', async () => {
    action.errorCode = 'AUTOMATION_COMMAND_DISPATCH_ACTION_KIND_INVALID';

    await expect(
      service.evaluateFailedAction({ tenantId, executionId, actionId, errorCode: action.errorCode }),
    ).resolves.toEqual({ kind: 'TERMINAL_FAILURE' });
  });

  it('fails closed on conflicting persisted attempt evidence', async () => {
    action.dispatchAttemptCount = 7;

    await expect(
      service.evaluateFailedAction({ tenantId, executionId, actionId, errorCode: action.errorCode }),
    ).rejects.toMatchObject({
      code: AUTOMATION_EXECUTION_PERSISTENCE_ERROR_CODES.RetryExhausted,
    });
  });

  it('fails closed when the action is not in FAILED state', async () => {
    action.status = AutomationExecutionActionStatus.DISPATCHING;

    await expect(
      service.evaluateFailedAction({ tenantId, executionId, actionId, errorCode: action.errorCode }),
    ).rejects.toMatchObject({
      code: AUTOMATION_EXECUTION_PERSISTENCE_ERROR_CODES.RetryNotEligible,
    });
  });

  it('claims the retry only after the persisted next-eligible time passes', async () => {
    action.retryNextEligibleAt = new Date(databaseNow.getTime() - 1_000);

    await expect(
      service.claimEligibleRetry({ tenantId, executionId, actionId }),
    ).resolves.toBe(true);

    expect(transaction.automationExecution.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: AutomationExecutionStatus.FAILED }),
        data: expect.objectContaining({ status: AutomationExecutionStatus.DISPATCHING }),
      }),
    );
    expect(transaction.automationExecutionAction.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ dispatchAttemptCount: 2 }),
      }),
    );
  });

  it('refuses to claim before the retry window opens', async () => {
    action.retryNextEligibleAt = new Date(databaseNow.getTime() + 60_000);

    await expect(
      service.claimEligibleRetry({ tenantId, executionId, actionId }),
    ).resolves.toBe(false);
    expect(transaction.automationExecution.updateMany).not.toHaveBeenCalled();
  });

  it('refuses to claim when the attempt budget is exhausted', async () => {
    action.dispatchAttemptCount = 3;
    action.retryNextEligibleAt = new Date(databaseNow.getTime() - 1_000);

    await expect(
      service.claimEligibleRetry({ tenantId, executionId, actionId }),
    ).resolves.toBe(false);
    expect(transaction.automationExecution.updateMany).not.toHaveBeenCalled();
  });

  it('refuses to claim an execution that is not FAILED', async () => {
    execution.status = AutomationExecutionStatus.SUCCEEDED;

    await expect(
      service.claimEligibleRetry({ tenantId, executionId, actionId }),
    ).resolves.toBe(false);
    expect(transaction.automationExecution.updateMany).not.toHaveBeenCalled();
  });
});
