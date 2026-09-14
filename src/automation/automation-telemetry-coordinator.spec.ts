import { AutomationExecutionStatus } from '@prisma/client';
import { AutomationCommandDispatcher } from './automation-command-dispatcher';
import { AutomationEvaluator } from './automation-evaluator';
import { AutomationExecutionRepository } from './automation-execution.repository';
import { AutomationRuntimeReadRepository } from './automation-runtime-read.repository';
import {
  AutomationTelemetryCoordinationError,
  AutomationTelemetryCoordinator,
} from './automation-telemetry-coordinator';
import { AutomationRetryReservationService } from './automation-retry-reservation.service';

const TENANT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TELEMETRY_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const DEVICE_ID = '11111111-1111-4111-8111-111111111111';
const TEMPERATURE_ID = '22222222-2222-4222-8222-222222222222';
const HUMIDITY_ID = '33333333-3333-4333-8333-333333333333';
const AUTOMATION_ID = '44444444-4444-4444-8444-444444444444';
const EXECUTION_ID = '55555555-5555-4555-8555-555555555555';

function candidate(id = AUTOMATION_ID) {
  return {
    automationId: id,
    tenantId: TENANT_ID,
    enabled: true,
    revision: 2,
    triggerCapabilityId: TEMPERATURE_ID,
    definition: {
      schemaVersion: '1.0.0' as const,
      name: 'Coordinator fixture',
      trigger: {
        kind: 'CAPABILITY_REPORTED' as const,
        deviceId: DEVICE_ID,
        capabilityKey: 'temperature',
      },
      condition: { kind: 'ALWAYS' as const },
      actions: [
        {
          actionId: 'fan-on',
          kind: 'DEVICE_COMMAND' as const,
          deviceId: DEVICE_ID,
          capabilityKey: 'fan',
          value: true,
        },
      ],
    },
  };
}

function envelope() {
  return {
    tenantId: TENANT_ID,
    telemetryId: TELEMETRY_ID,
    deviceId: DEVICE_ID,
    eventId: 'event-1',
    occurredAt: new Date('2026-08-05T00:00:00.000Z'),
    origin: 'EXTERNAL_ACCEPTED' as const,
    ancestry: [],
    reports: [
      {
        capabilityId: TEMPERATURE_ID,
        capabilityKey: 'temperature',
        value: 31,
      },
    ],
  };
}

function execution(status: AutomationExecutionStatus) {
  return {
    id: EXECUTION_ID,
    tenantId: TENANT_ID,
    status,
    actions: [],
  };
}

describe('AutomationTelemetryCoordinator', () => {
  const assertAcceptedTelemetry = jest.fn();
  const findEnabledCandidatesForReport = jest.fn();
  const collectLatestValueTargets = jest.fn();
  const loadLatestValues = jest.fn();
  const evaluate = jest.fn();
  const reserveMatchedExecution = jest.fn();
  const dispatchExecution = jest.fn();
  const evaluateFailedAction = jest.fn();
  const claimEligibleRetry = jest.fn();
  const findTenantExecution = jest.fn();

  const coordinator = new AutomationTelemetryCoordinator(
    {
      assertAcceptedTelemetry,
      findEnabledCandidatesForReport,
      collectLatestValueTargets,
      loadLatestValues,
    } as unknown as AutomationRuntimeReadRepository,
    { evaluate } as unknown as AutomationEvaluator,
    {
      reserveMatchedExecution,
      findTenantExecution,
    } as unknown as AutomationExecutionRepository,
    { dispatchExecution } as unknown as AutomationCommandDispatcher,
    {
      evaluateFailedAction,
      claimEligibleRetry,
    } as unknown as AutomationRetryReservationService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    findTenantExecution.mockRejectedValue(
      new Error('no execution lookup in this test'),
    );
    evaluateFailedAction.mockResolvedValue({ kind: 'TERMINAL_FAILURE' });
    claimEligibleRetry.mockResolvedValue(false);
    assertAcceptedTelemetry.mockResolvedValue(undefined);
    findEnabledCandidatesForReport.mockResolvedValue([candidate()]);
    collectLatestValueTargets.mockReturnValue([]);
    loadLatestValues.mockResolvedValue([]);
    evaluate.mockReturnValue({
      automationId: AUTOMATION_ID,
      revision: 2,
      outcome: 'MATCHED',
      reasonCode: 'CONDITION_MATCHED',
      matched: true,
      actionIntents: candidate().definition.actions,
    });
    reserveMatchedExecution.mockResolvedValue({
      disposition: 'CREATED',
      execution: execution(AutomationExecutionStatus.RESERVED),
    });
    dispatchExecution.mockResolvedValue({
      execution: execution(AutomationExecutionStatus.SUCCEEDED),
      processedActionCount: 1,
    });
  });

  it('evaluates, reserves, and dispatches one matched accepted report', async () => {
    const result = await coordinator.coordinate(envelope());

    expect(assertAcceptedTelemetry).toHaveBeenCalledTimes(1);
    expect(evaluate).toHaveBeenCalledWith(
      expect.objectContaining({
        candidate: expect.objectContaining({ automationId: AUTOMATION_ID }),
        report: expect.objectContaining({ capabilityKey: 'temperature' }),
      }),
      'APPROVED_RUNTIME',
    );
    expect(evaluate.mock.calls[0]?.[0].candidate).toEqual({
      automationId: AUTOMATION_ID,
      tenantId: TENANT_ID,
      enabled: true,
      revision: 2,
      definition: candidate().definition,
    });
    expect(evaluate.mock.calls[0]?.[0].candidate).not.toHaveProperty(
      'triggerCapabilityId',
    );
    expect(reserveMatchedExecution).toHaveBeenCalledWith(
      expect.objectContaining({
        automationId: AUTOMATION_ID,
        triggerTelemetryId: TELEMETRY_ID,
        triggerCapabilityId: TEMPERATURE_ID,
      }),
    );
    expect(dispatchExecution).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      executionId: EXECUTION_ID,
    });
    expect(result).toMatchObject({
      reportCount: 1,
      candidateCount: 1,
      matchedCount: 1,
      reservationCreatedCount: 1,
      dispatchedCount: 1,
      failedCount: 0,
    });
  });

  it('processes reports in deterministic capability order', async () => {
    findEnabledCandidatesForReport.mockResolvedValue([]);
    const input = envelope();
    input.reports = [
      {
        capabilityId: TEMPERATURE_ID,
        capabilityKey: 'temperature',
        value: 31,
      },
      {
        capabilityId: HUMIDITY_ID,
        capabilityKey: 'humidity',
        value: 50,
      },
    ];

    await coordinator.coordinate(input);

    expect(findEnabledCandidatesForReport.mock.calls).toEqual([
      [
        {
          tenantId: TENANT_ID,
          deviceId: DEVICE_ID,
          capabilityId: HUMIDITY_ID,
        },
      ],
      [
        {
          tenantId: TENANT_ID,
          deviceId: DEVICE_ID,
          capabilityId: TEMPERATURE_ID,
        },
      ],
    ]);
  });

  it('does not reserve or dispatch no-candidate and not-matched outcomes', async () => {
    findEnabledCandidatesForReport.mockResolvedValueOnce([]);
    expect(await coordinator.coordinate(envelope())).toMatchObject({
      candidateCount: 0,
      matchedCount: 0,
    });
    expect(reserveMatchedExecution).not.toHaveBeenCalled();

    findEnabledCandidatesForReport.mockResolvedValueOnce([candidate()]);
    evaluate.mockReturnValueOnce({
      automationId: AUTOMATION_ID,
      revision: 2,
      outcome: 'NOT_MATCHED',
      reasonCode: 'CONDITION_FALSE',
      matched: false,
      actionIntents: [],
    });
    expect(await coordinator.coordinate(envelope())).toMatchObject({
      candidateCount: 1,
      matchedCount: 0,
    });
    expect(reserveMatchedExecution).not.toHaveBeenCalled();
    expect(dispatchExecution).not.toHaveBeenCalled();
  });

  it('runs at most one bounded retry pass for a retry-eligible failed action', async () => {
    dispatchExecution.mockResolvedValueOnce({
      execution: execution(AutomationExecutionStatus.FAILED),
      processedActionCount: 1,
    });
    findTenantExecution.mockResolvedValueOnce({
      id: EXECUTION_ID,
      tenantId: TENANT_ID,
      status: AutomationExecutionStatus.FAILED,
      actions: [
        {
          actionId: 'first-action',
          status: 'FAILED',
          errorCode: 'COMMAND_PUBLISH_FAILED',
        },
      ],
    });
    evaluateFailedAction.mockResolvedValueOnce({
      kind: 'RETRY_SCHEDULED',
      attemptCount: 2,
      nextEligibleAt: new Date('2026-08-22T04:00:05.000Z'),
    });
    claimEligibleRetry.mockResolvedValueOnce(true);
    dispatchExecution.mockResolvedValueOnce({
      execution: execution(AutomationExecutionStatus.SUCCEEDED),
      processedActionCount: 1,
    });

    const result = await coordinator.coordinate(envelope());

    expect(dispatchExecution).toHaveBeenCalledTimes(2);
    expect(evaluateFailedAction).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      executionId: EXECUTION_ID,
      actionId: 'first-action',
      errorCode: 'COMMAND_PUBLISH_FAILED',
    });
    expect(claimEligibleRetry).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      executionId: EXECUTION_ID,
      actionId: 'first-action',
    });
    expect(result).toMatchObject({
      matchedCount: 1,
      dispatchedCount: 1,
      failedCount: 0,
    });
  });

  it('skips the retry pass when the budget is exhausted or window not open', async () => {
    dispatchExecution.mockResolvedValueOnce({
      execution: execution(AutomationExecutionStatus.FAILED),
      processedActionCount: 1,
    });
    findTenantExecution.mockResolvedValueOnce({
      id: EXECUTION_ID,
      tenantId: TENANT_ID,
      status: AutomationExecutionStatus.FAILED,
      actions: [
        {
          actionId: 'first-action',
          status: 'FAILED',
          errorCode: 'COMMAND_PUBLISH_FAILED',
        },
      ],
    });
    evaluateFailedAction.mockResolvedValueOnce({
      kind: 'TERMINAL_FAILURE',
    });

    await coordinator.coordinate(envelope());

    expect(dispatchExecution).toHaveBeenCalledTimes(1);
    expect(claimEligibleRetry).not.toHaveBeenCalled();
  });

  it('does not dispatch suppressed or terminal replay reservations', async () => {
    reserveMatchedExecution.mockResolvedValueOnce({
      disposition: 'CREATED',
      execution: execution(AutomationExecutionStatus.SUPPRESSED_COOLDOWN),
    });
    expect(await coordinator.coordinate(envelope())).toMatchObject({
      suppressedCount: 1,
      dispatchedCount: 0,
    });

    reserveMatchedExecution.mockResolvedValueOnce({
      disposition: 'REPLAYED',
      execution: execution(AutomationExecutionStatus.SUCCEEDED),
    });
    expect(await coordinator.coordinate(envelope())).toMatchObject({
      reservationReplayedCount: 1,
      dispatchedCount: 0,
    });
    expect(dispatchExecution).not.toHaveBeenCalled();
  });

  it('isolates a candidate failure and continues with the next candidate', async () => {
    const secondId = '66666666-6666-4666-8666-666666666666';
    findEnabledCandidatesForReport.mockResolvedValue([
      candidate(AUTOMATION_ID),
      candidate(secondId),
    ]);
    reserveMatchedExecution
      .mockRejectedValueOnce({ code: 'AUTOMATION_TEST_FAILURE' })
      .mockResolvedValueOnce({
        disposition: 'CREATED',
        execution: execution(AutomationExecutionStatus.RESERVED),
      });

    const result = await coordinator.coordinate(envelope());

    expect(reserveMatchedExecution).toHaveBeenCalledTimes(2);
    expect(dispatchExecution).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      candidateCount: 2,
      matchedCount: 1,
      failedCount: 1,
      dispatchedCount: 1,
    });
    expect(result.failures).toEqual([
      {
        automationId: AUTOMATION_ID,
        capabilityKey: 'temperature',
        errorCode: 'AUTOMATION_TEST_FAILURE',
      },
    ]);
  });

  it('rejects automation-derived telemetry without ancestry before reads', async () => {
    await expect(
      coordinator.coordinate({
        ...envelope(),
        origin: 'AUTOMATION_DERIVED',
      }),
    ).rejects.toBeInstanceOf(AutomationTelemetryCoordinationError);
    expect(assertAcceptedTelemetry).not.toHaveBeenCalled();
  });
});
