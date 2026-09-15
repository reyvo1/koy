import { AutomationCommandDispatcher } from './automation-command-dispatcher';
import { AutomationRetryReservationService } from './automation-retry-reservation.service';
import { AutomationRetryWorker } from './automation-retry.worker';

const originalAutomationRuntime = process.env.AUTOMATION_RUNTIME_ENABLED;

describe('AutomationRetryWorker', () => {
  const candidate = {
    tenantId: '00000000-0000-4000-8000-000000000001',
    executionId: '00000000-0000-4000-8000-000000000002',
    actionId: 'first-action',
  };

  let retries: {
    listRetryCandidates: jest.Mock;
    claimEligibleRetry: jest.Mock;
  };
  let dispatcher: { dispatchExecution: jest.Mock };
  let worker: AutomationRetryWorker;

  beforeEach(() => {
    process.env.AUTOMATION_RUNTIME_ENABLED = 'true';
    retries = {
      listRetryCandidates: jest.fn().mockResolvedValue([candidate]),
      claimEligibleRetry: jest.fn().mockResolvedValue(true),
    };
    dispatcher = {
      dispatchExecution: jest.fn().mockResolvedValue({}),
    };
    worker = new AutomationRetryWorker(
      retries as unknown as AutomationRetryReservationService,
      dispatcher as unknown as AutomationCommandDispatcher,
    );
  });

  afterAll(() => {
    if (originalAutomationRuntime === undefined) {
      delete process.env.AUTOMATION_RUNTIME_ENABLED;
    } else {
      process.env.AUTOMATION_RUNTIME_ENABLED = originalAutomationRuntime;
    }
  });

  it('stays inert unless automation runtime is explicitly enabled', async () => {
    process.env.AUTOMATION_RUNTIME_ENABLED = 'false';

    await worker.tick();

    expect(retries.listRetryCandidates).not.toHaveBeenCalled();
  });

  it('claims persisted retry state before dispatching', async () => {
    await worker.tick();

    expect(retries.listRetryCandidates).toHaveBeenCalledWith(25);
    expect(retries.claimEligibleRetry).toHaveBeenCalledWith(candidate);
    expect(dispatcher.dispatchExecution).toHaveBeenCalledWith({
      tenantId: candidate.tenantId,
      executionId: candidate.executionId,
    });
  });

  it('does not dispatch a candidate that loses the database claim race', async () => {
    retries.claimEligibleRetry.mockResolvedValue(false);

    await worker.tick();

    expect(dispatcher.dispatchExecution).not.toHaveBeenCalled();
  });

  it('isolates one candidate failure and continues the bounded batch', async () => {
    const second = { ...candidate, executionId: '00000000-0000-4000-8000-000000000003' };
    retries.listRetryCandidates.mockResolvedValue([candidate, second]);
    dispatcher.dispatchExecution
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce({});

    await worker.tick();

    expect(retries.claimEligibleRetry).toHaveBeenCalledTimes(2);
    expect(dispatcher.dispatchExecution).toHaveBeenCalledTimes(2);
  });
});
