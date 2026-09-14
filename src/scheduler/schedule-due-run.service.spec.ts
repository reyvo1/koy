import { ScheduleRunStatus } from '@prisma/client';
import { CronJob } from 'cron';
import { PrismaService } from '../prisma/prisma.service';
import {
  SCHEDULER_RUN_LIMITS,
  ScheduleDueRunService,
} from './schedule-due-run.service';

const tenantId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const scheduleId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const sceneId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const databaseNow = new Date('2026-08-22T23:00:00.000Z');

function runRow(id: string) {
  return {
    id,
    tenantId,
    scheduleId,
    scheduledFor: new Date('2026-08-22T22:00:00.000Z'),
    status: ScheduleRunStatus.PENDING,
  };
}

describe('ScheduleDueRunService', () => {
  let runRows: { id: string; tenantId: string; scheduleId: string; scheduledFor: Date; status: ScheduleRunStatus }[];
  let scheduleRow: Record<string, unknown>;
  let runCreateMany: jest.Mock;
  let scheduleFindMany: jest.Mock;
  let runUpdateMany: jest.Mock;
  let runUpdate: jest.Mock;
  let scheduleUpdate: jest.Mock;
  let runScene: jest.Mock;
  let service: ScheduleDueRunService;

  beforeEach(() => {
    runRows = [runRow('run1')];
    scheduleRow = {
      id: scheduleId,
      enabled: true,
      targetSceneId: sceneId,
      missedRunPolicy: 'SKIP_TO_NEXT',
    };
    runCreateMany = jest.fn().mockResolvedValue({ count: 0 });
    scheduleFindMany = jest.fn().mockResolvedValue([]);
    runUpdateMany = jest.fn().mockImplementation(({ where }) =>
      Promise.resolve({
        count: Array.isArray(where?.id?.in) ? where.id.in.length : 1,
      }),
    );
    runUpdate = jest.fn().mockImplementation(({ where }) => {
      const row = runRows.find((r) => r.id === where.id);
      if (row) row.status = ScheduleRunStatus.CLAIMED;
      return Promise.resolve(row);
    });
    scheduleUpdate = jest.fn().mockResolvedValue({});
    runScene = jest.fn().mockResolvedValue({ executionId: 'scene-exec-1', status: 'SUCCEEDED' });
    service = new ScheduleDueRunService(
      {
        $queryRaw: jest.fn().mockResolvedValue([{ databaseNow }]),
        scheduleRun: {
          findMany: jest.fn().mockImplementation(({ include }) =>
            Promise.resolve(
              runRows.map((r) => ({
                ...r,
                schedule: include ? scheduleRow : undefined,
              })),
            ),
          ),
          createMany: runCreateMany,
          updateMany: runUpdateMany,
          update: runUpdate,
        },
        schedule: { findMany: scheduleFindMany, update: scheduleUpdate },
      } as unknown as PrismaService,
      {
        get: () => ({ runScene }),
      } as any,
    );
  });

  it('materializes distinct upcoming CRON activations instead of repeating nextDate()', async () => {
    scheduleFindMany.mockResolvedValue([
      {
        id: scheduleId,
        tenantId,
        expression: '*/5 * * * *',
        timezone: 'UTC',
        enabled: true,
        kind: 'CRON',
        repeat: 'INDEFINITE',
        maxRuns: null,
        nextRunAt: null,
        _count: { runs: 0 },
      },
    ]);
    const first = new Date(Date.now() + 5 * 60_000);
    const second = new Date(Date.now() + 10 * 60_000);
    const third = new Date(Date.now() + 15 * 60_000);
    const nextDates = jest.fn().mockReturnValue(
      [first, second, third].map((value) => ({ toJSDate: () => value })),
    );
    const fromSpy = jest
      .spyOn(CronJob, 'from')
      .mockReturnValue({ nextDates } as unknown as CronJob);
    runCreateMany.mockResolvedValue({ count: 3 });

    await expect(service.materializeUpcomingRuns(1)).resolves.toBe(3);

    expect(nextDates).toHaveBeenCalledWith(SCHEDULER_RUN_LIMITS.maxBatchSize);
    expect(runCreateMany).toHaveBeenCalledWith({
      data: [first, second, third].map((scheduledFor) => ({
        tenantId,
        scheduleId,
        scheduledFor,
        status: ScheduleRunStatus.PENDING,
      })),
      skipDuplicates: true,
    });
    fromSpy.mockRestore();
  });



  it('materializes COUNTDOWN runs from nextRunAt and advances the interval anchor', async () => {
    const first = new Date(Date.now() + 60_000);
    scheduleFindMany.mockResolvedValue([
      {
        id: scheduleId,
        tenantId,
        expression: '',
        timezone: 'UTC',
        enabled: true,
        kind: 'COUNTDOWN',
        countdownSeconds: 60,
        repeat: 'INDEFINITE',
        maxRuns: null,
        nextRunAt: first,
        _count: { runs: 0 },
      },
    ]);
    runCreateMany.mockImplementation(async ({ data }) => ({ count: data.length }));

    const created = await service.materializeUpcomingRuns(1);

    expect(created).toBeGreaterThan(0);
    const call = runCreateMany.mock.calls[0][0];
    expect(call.data[0]).toEqual({
      tenantId,
      scheduleId,
      scheduledFor: first,
      status: ScheduleRunStatus.PENDING,
    });
    expect(scheduleUpdate).toHaveBeenCalledWith({
      where: { id: scheduleId },
      data: { nextRunAt: expect.any(Date) },
    });
    expect(scheduleUpdate.mock.calls[0][0].data.nextRunAt.getTime()).toBeGreaterThan(
      first.getTime(),
    );
  });

  it('bounds LIMITED schedule materialization by remaining durable run slots', async () => {
    const first = new Date(Date.now() + 60_000);
    scheduleFindMany.mockResolvedValue([
      {
        id: scheduleId,
        tenantId,
        expression: '',
        timezone: 'UTC',
        enabled: true,
        kind: 'COUNTDOWN',
        countdownSeconds: 60,
        repeat: 'LIMITED',
        maxRuns: 3,
        nextRunAt: first,
        _count: { runs: 2 },
      },
    ]);
    runCreateMany.mockResolvedValue({ count: 1 });

    await expect(service.materializeUpcomingRuns(1)).resolves.toBe(1);

    expect(runCreateMany.mock.calls[0][0].data).toHaveLength(1);
    expect(scheduleUpdate).toHaveBeenCalledWith({
      where: { id: scheduleId },
      data: { nextRunAt: null },
    });
  });

  it('limits CRON ONCE schedules to a single durable run', async () => {
    scheduleFindMany.mockResolvedValue([
      {
        id: scheduleId,
        tenantId,
        expression: '*/5 * * * *',
        timezone: 'UTC',
        enabled: true,
        kind: 'CRON',
        repeat: 'ONCE',
        maxRuns: null,
        nextRunAt: null,
        _count: { runs: 0 },
      },
    ]);
    const first = new Date(Date.now() + 5 * 60_000);
    const nextDates = jest
      .fn()
      .mockReturnValue([{ toJSDate: () => first }]);
    const fromSpy = jest
      .spyOn(CronJob, 'from')
      .mockReturnValue({ nextDates } as unknown as CronJob);
    runCreateMany.mockResolvedValue({ count: 1 });

    await expect(service.materializeUpcomingRuns(1)).resolves.toBe(1);

    expect(nextDates).toHaveBeenCalledWith(1);
    expect(runCreateMany.mock.calls[0][0].data).toHaveLength(1);
    fromSpy.mockRestore();
  });

  it('recovers stale CLAIMED runs back to PENDING after the lease timeout', async () => {
    runUpdateMany.mockResolvedValueOnce({ count: 2 });

    await expect(service.recoverStaleClaims(300_000)).resolves.toBe(2);

    expect(runUpdateMany).toHaveBeenCalledWith({
      where: {
        status: ScheduleRunStatus.CLAIMED,
        claimedAt: { lte: new Date(databaseNow.getTime() - 300_000) },
      },
      data: {
        status: ScheduleRunStatus.PENDING,
        claimedAt: null,
      },
    });
  });

  it('does not settle a run after its claimedAt ownership token is lost', async () => {
    runUpdateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    const result = await service.executeDueRuns();

    expect(result).toMatchObject({ claimed: 1, succeeded: 0, failed: 0 });
    expect(runScene).toHaveBeenCalledTimes(1);
    expect(scheduleUpdate).not.toHaveBeenCalled();
  });

  it('claims and executes a single due run successfully', async () => {
    const result = await service.executeDueRuns();

    expect(result).toEqual({
      claimed: 1,
      succeeded: 1,
      failed: 0,
      skippedMissed: 0,
    });
    expect(runScene).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId,
        sceneId,
        requestId: 'sched:run1',
        mode: 'ORDERED',
      }),
    );
    expect(scheduleUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ runCount: { increment: 1 } }),
      }),
    );
  });

  it('applies SKIP_TO_NEXT when several runs are missed', async () => {
    runRows = [runRow('old1'), runRow('old2'), runRow('newest')];
    // newest last per orderBy asc
    runRows[2].scheduledFor = new Date('2026-08-22T22:30:00.000Z');

    const result = await service.executeDueRuns();

    expect(result.skippedMissed).toBe(2);
    // Only the newest run executes.
    expect(runScene).toHaveBeenCalledTimes(1);
    expect(runScene).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'sched:newest' }),
    );
  });

  it('SKIP_TO_NEXT executes the newest run even when backlog exceeds catch-up cap', async () => {
    runRows = Array.from({ length: 13 }, (_, i) => {
      const row = runRow(`r${i}`);
      row.scheduledFor = new Date(databaseNow.getTime() - (13 - i) * 60_000);
      return row;
    });

    const result = await service.executeDueRuns();

    expect(result.skippedMissed).toBe(12);
    expect(runScene).toHaveBeenCalledTimes(1);
    expect(runScene).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'sched:r12' }),
    );
  });

  it('RUN_IMMEDIATELY keeps the newest bounded catch-up window', async () => {
    scheduleRow.missedRunPolicy = 'RUN_IMMEDIATELY';
    runRows = Array.from({ length: 13 }, (_, i) => {
      const row = runRow(`r${i}`);
      row.scheduledFor = new Date(databaseNow.getTime() - (13 - i) * 60_000);
      return row;
    });

    const result = await service.executeDueRuns();

    expect(result.skippedMissed).toBe(3);
    expect(runScene).toHaveBeenCalledTimes(10);
    expect(runScene.mock.calls[0][0]).toEqual(
      expect.objectContaining({ requestId: 'sched:r3' }),
    );
    expect(runScene.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({ requestId: 'sched:r12' }),
    );
  });



  it('marks the schedule run FAILED when the scene returns a non-success terminal status', async () => {
    runScene.mockResolvedValue({
      executionId: 'scene-exec-partial',
      status: 'PARTIALLY_FAILED',
    });

    const result = await service.executeDueRuns();

    expect(result).toMatchObject({ claimed: 1, failed: 1, succeeded: 0 });
    expect(runUpdate).not.toHaveBeenCalled();
    expect(runUpdateMany).toHaveBeenCalledWith({
      where: {
        id: 'run1',
        status: 'CLAIMED',
        claimedAt: databaseNow,
      },
      data: {
        status: 'FAILED',
        sceneExecutionId: 'scene-exec-partial',
        completedAt: expect.any(Date),
      },
    });
    expect(scheduleUpdate).not.toHaveBeenCalled();
  });

  it('marks FAILED without throwing when scene execution fails', async () => {
    runScene.mockRejectedValue(new Error('scene boom'));

    const result = await service.executeDueRuns();

    expect(result).toMatchObject({ claimed: 1, failed: 1, succeeded: 0 });
  });

  it('skips runs for disabled schedules or missing targets', async () => {
    scheduleRow.enabled = false;

    const result = await service.executeDueRuns();

    expect(runScene).not.toHaveBeenCalled();
    expect(result.skippedMissed).toBe(1);
  });
});
