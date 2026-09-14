import { ConfigService } from '@nestjs/config';
import { ScheduleDueRunService } from './schedule-due-run.service';
import { ScheduleRuntimeWorker } from './schedule-runtime.worker';

describe('ScheduleRuntimeWorker', () => {
  it('stays inert until scheduler runtime is explicitly enabled', async () => {
    const dueRuns = {
      recoverStaleClaims: jest.fn(),
      materializeUpcomingRuns: jest.fn(),
      executeDueRuns: jest.fn(),
    } as unknown as ScheduleDueRunService;
    const config = {
      get: jest.fn().mockReturnValue(false),
    } as unknown as ConfigService;
    const worker = new ScheduleRuntimeWorker(dueRuns, config);

    await worker.tick();

    expect(dueRuns.materializeUpcomingRuns).not.toHaveBeenCalled();
    expect(dueRuns.executeDueRuns).not.toHaveBeenCalled();
  });

  it('materializes and executes due runs when runtime is enabled', async () => {
    const dueRuns = {
      recoverStaleClaims: jest.fn().mockResolvedValue(1),
      materializeUpcomingRuns: jest.fn().mockResolvedValue(2),
      executeDueRuns: jest.fn().mockResolvedValue({
        claimed: 1,
        succeeded: 1,
        failed: 0,
        skippedMissed: 0,
      }),
    } as unknown as ScheduleDueRunService;
    const config = {
      get: jest.fn().mockImplementation((key: string, fallback?: unknown) => {
        if (key === 'SCHEDULER_RUNTIME_ENABLED') return true;
        if (key === 'SCHEDULER_CLAIM_TIMEOUT_MS') return 300_000;
        return fallback;
      }),
    } as unknown as ConfigService;
    const worker = new ScheduleRuntimeWorker(dueRuns, config);

    await worker.tick();

    expect(dueRuns.recoverStaleClaims).toHaveBeenCalledWith(300_000);
    expect(dueRuns.materializeUpcomingRuns).toHaveBeenCalledWith(24);
    expect(dueRuns.executeDueRuns).toHaveBeenCalledTimes(1);
  });
});
