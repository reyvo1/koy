import { Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { CronJob } from 'cron';
import { SceneExecutionStatus, ScheduleRunStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SceneExecutionService } from '../scene/scene-execution.service';

export const SCHEDULER_RUN_LIMITS = {
  maxCatchUpPerSchedule: 10,
  maxBatchSize: 50,
  defaultClaimTimeoutMs: 300_000,
} as const;

export interface DueRunClaim {
  readonly runId: string;
  readonly tenantId: string;
  readonly scheduleId: string;
  readonly scheduledFor: Date;
}

/**
 * Module 13 Slice 13.2 — durable due-run service.
 *
 * Claims PENDING schedule_runs whose scheduledFor has passed using the
 * PostgreSQL clock, executes the schedule's target scene through
 * SceneExecutionService (idempotent requestId `sched:<runId>`), and applies
 * the missed-run policy: SKIP_TO_NEXT marks overdue runs SKIPPED_MISSED,
 * RUN_IMMEDIATELY executes up to a bounded catch-up window. Timer ownership
 * lives in ScheduleRuntimeWorker; this service remains deterministic per tick.
 */
@Injectable()
export class ScheduleDueRunService {
  private readonly logger = new Logger(ScheduleDueRunService.name);

  private scenesCache?: SceneExecutionService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly moduleRef: ModuleRef,
  ) {}

  /** Lazy resolution avoids DI-graph ordering issues in test bootstraps. */
  private sceneExecutor(): SceneExecutionService {
    if (!this.scenesCache) {
      this.scenesCache = this.moduleRef.get(SceneExecutionService, {
        strict: false,
      });
    }
    return this.scenesCache;
  }

  /** Materialize upcoming PENDING runs for enabled CRON/COUNTDOWN schedules. */
  async materializeUpcomingRuns(horizonHours = 24): Promise<number> {
    const schedules = await this.prisma.schedule.findMany({
      where: { enabled: true },
      include: { _count: { select: { runs: true } } },
    });
    let created = 0;

    for (const schedule of schedules) {
      try {
        const cursor = new Date();
        const horizon = new Date(
          cursor.getTime() + horizonHours * 3600 * 1000,
        );
        const remainingGlobal = Math.max(0, 500 - created);
        const repeatRemaining = this.remainingMaterializations(
          schedule.repeat,
          schedule.maxRuns,
          schedule._count.runs,
        );
        const candidateCount = Math.min(
          SCHEDULER_RUN_LIMITS.maxBatchSize,
          remainingGlobal,
          repeatRemaining,
        );
        if (remainingGlobal === 0) break;

        if (candidateCount === 0) {
          if (
            schedule.kind === 'COUNTDOWN' &&
            schedule.nextRunAt !== null &&
            schedule.repeat !== 'INDEFINITE'
          ) {
            await this.prisma.schedule.update({
              where: { id: schedule.id },
              data: { nextRunAt: null },
            });
          }
          continue;
        }

        if (schedule.kind === 'COUNTDOWN') {
          const intervalSeconds = schedule.countdownSeconds;
          if (!intervalSeconds || intervalSeconds < 1) {
            throw new Error('SCHEDULER_COUNTDOWN_INTERVAL_INVALID');
          }

          const intervalMs = intervalSeconds * 1000;
          let nextRunAt =
            schedule.nextRunAt ?? new Date(cursor.getTime() + intervalMs);
          const batch: Array<{
            scheduledFor: Date;
            tenantId: string;
            scheduleId: string;
          }> = [];

          // COUNTDOWN is an interval anchored by nextRunAt. Past anchors are
          // intentionally materialized so the durable missed-run policy can
          // decide whether to catch up or skip. The batch remains bounded.
          while (batch.length < candidateCount && nextRunAt <= horizon) {
            batch.push({
              scheduledFor: nextRunAt,
              tenantId: schedule.tenantId,
              scheduleId: schedule.id,
            });
            nextRunAt = new Date(nextRunAt.getTime() + intervalMs);
          }

          if (batch.length > 0) {
            const res = await this.prisma.scheduleRun.createMany({
              data: batch.map((item) => ({
                ...item,
                status: ScheduleRunStatus.PENDING,
              })),
              skipDuplicates: true,
            });
            created += res.count;
          }

          const materializedTotal = schedule._count.runs + batch.length;
          const repeatExhausted =
            schedule.repeat === 'ONCE'
              ? materializedTotal >= 1
              : schedule.repeat === 'LIMITED' && schedule.maxRuns !== null
                ? materializedTotal >= schedule.maxRuns
                : false;

          const desiredNextRunAt = repeatExhausted ? null : nextRunAt;
          if (
            (schedule.nextRunAt?.getTime() ?? null) !==
            (desiredNextRunAt?.getTime() ?? null)
          ) {
            await this.prisma.schedule.update({
              where: { id: schedule.id },
              data: { nextRunAt: desiredNextRunAt },
            });
          }
          continue;
        }

        const job = CronJob.from({
          cronTime: schedule.expression,
          onTick: () => undefined,
          timeZone: schedule.timezone,
          start: false,
        });

        // cron@3 nextDate() returns only the single subsequent activation.
        // Calling it repeatedly without advancing time would materialize the
        // same instant over and over. nextDates(count) returns an ordered list
        // of distinct upcoming activations, which we then bound by horizon.
        const upcoming = job.nextDates(candidateCount);
        const batch: { scheduledFor: Date; tenantId: string; scheduleId: string }[] =
          upcoming
            .map((dateTime) => dateTime.toJSDate())
            .filter(
              (scheduledFor) =>
                scheduledFor instanceof Date &&
                !Number.isNaN(scheduledFor.getTime()) &&
                scheduledFor > cursor &&
                scheduledFor <= horizon,
            )
            .map((scheduledFor) => ({
              scheduledFor,
              tenantId: schedule.tenantId,
              scheduleId: schedule.id,
            }));

        if (batch.length > 0) {
          const res = await this.prisma.scheduleRun.createMany({
            data: batch.map((item) => ({
              ...item,
              status: ScheduleRunStatus.PENDING,
            })),
            skipDuplicates: true,
          });
          created += res.count;
        }
      } catch (error) {
        this.logger.warn({
          event: 'scheduler.materialize.failed',
          outcome: 'failed',
          scheduleId: schedule.id,
          errorCode:
            error && typeof error === 'object' && 'code' in error
              ? String((error as { code?: unknown }).code)
              : error instanceof Error && error.message
                ? error.message
                : 'SCHEDULER_MATERIALIZE_FAILED',
        });
      }
    }
    return created;
  }

  /**
   * Recover abandoned CLAIMED rows after the configured lease timeout.
   * `claimedAt` doubles as the ownership token: completion updates also match
   * the exact claim timestamp, so a worker that wakes up after losing its lease
   * cannot overwrite the result of a newer claimant.
   */
  async recoverStaleClaims(
    claimTimeoutMs: number = SCHEDULER_RUN_LIMITS.defaultClaimTimeoutMs,
  ): Promise<number> {
    const [{ databaseNow }] = (await this.prisma.$queryRaw`
      SELECT clock_timestamp() AS "databaseNow"
    `) as Array<{ databaseNow: Date }>;
    const cutoff = new Date(databaseNow.getTime() - claimTimeoutMs);
    const recovered = await this.prisma.scheduleRun.updateMany({
      where: {
        status: ScheduleRunStatus.CLAIMED,
        claimedAt: { lte: cutoff },
      },
      data: {
        status: ScheduleRunStatus.PENDING,
        claimedAt: null,
      },
    });

    if (recovered.count > 0) {
      this.logger.warn({
        event: 'scheduler.claims.recovered',
        outcome: 'recovered',
        recovered: recovered.count,
        claimTimeoutMs,
      });
    }
    return recovered.count;
  }

  private remainingMaterializations(
    repeat: 'INDEFINITE' | 'LIMITED' | 'ONCE',
    maxRuns: number | null,
    existingRunCount: number,
  ): number {
    if (repeat === 'ONCE') {
      return Math.max(0, 1 - existingRunCount);
    }
    if (repeat === 'LIMITED') {
      return Math.max(0, (maxRuns ?? 0) - existingRunCount);
    }
    return Number.MAX_SAFE_INTEGER;
  }

  /**
   * Claim and execute all due runs (scheduledFor <= DB now). Missed-run policy
   * is applied per owning schedule; catch-up per schedule is bounded.
   */
  async executeDueRuns(): Promise<{
    claimed: number;
    succeeded: number;
    failed: number;
    skippedMissed: number;
  }> {
    const [{ databaseNow }] = (await this.prisma.$queryRaw`
      SELECT clock_timestamp() AS "databaseNow"
    `) as Array<{ databaseNow: Date }>;

    const due = await this.prisma.scheduleRun.findMany({
      where: {
        status: ScheduleRunStatus.PENDING,
        scheduledFor: { lte: databaseNow },
      },
      orderBy: { scheduledFor: 'asc' },
      take: SCHEDULER_RUN_LIMITS.maxBatchSize,
      include: {
        schedule: {
          select: {
            id: true,
            enabled: true,
            targetSceneId: true,
            missedRunPolicy: true,
          },
        },
      },
    });

    let claimed = 0;
    let succeeded = 0;
    let failed = 0;
    let skippedMissed = 0;

    // Group by schedule to enforce per-schedule catch-up bounds.
    const bySchedule = new Map<string, typeof due>();
    for (const run of due) {
      const list = bySchedule.get(run.scheduleId) ?? [];
      list.push(run);
      bySchedule.set(run.scheduleId, list);
    }

    for (const [scheduleId, runs] of bySchedule) {
      const first = runs[0];
      const policy = first.schedule.missedRunPolicy;

      let toExecute: typeof runs;
      if (policy === 'SKIP_TO_NEXT') {
        // The contract is explicit: execute only the newest due activation and
        // skip every older missed activation. Apply the policy to the complete
        // per-schedule backlog before the catch-up cap; otherwise a large
        // backlog could execute the 10th-oldest run instead of the newest one.
        const skipIds = runs.slice(0, -1).map((r) => r.id);
        if (skipIds.length > 0) {
          const skipped = await this.prisma.scheduleRun.updateMany({
            where: { id: { in: skipIds }, status: ScheduleRunStatus.PENDING },
            data: { status: 'SKIPPED_MISSED', completedAt: databaseNow },
          });
          skippedMissed += skipped.count;
        }
        toExecute = runs.slice(-1);
      } else {
        // RUN_IMMEDIATELY replays a bounded catch-up window. Keep the newest
        // activations because they best represent the current desired state;
        // older overflow is marked skipped rather than executing stale actions.
        const overflowCount = Math.max(
          0,
          runs.length - SCHEDULER_RUN_LIMITS.maxCatchUpPerSchedule,
        );
        const overflow = runs.slice(0, overflowCount);
        if (overflow.length > 0) {
          const skipped = await this.prisma.scheduleRun.updateMany({
            where: {
              id: { in: overflow.map((r) => r.id) },
              status: ScheduleRunStatus.PENDING,
            },
            data: { status: 'SKIPPED_MISSED', completedAt: databaseNow },
          });
          skippedMissed += skipped.count;
        }
        toExecute = runs.slice(overflowCount);
      }

      for (const run of toExecute) {
        if (!first.schedule.enabled || !first.schedule.targetSceneId) {
          const skipped = await this.prisma.scheduleRun.updateMany({
            where: { id: run.id, status: ScheduleRunStatus.PENDING },
            data: {
              status: 'SKIPPED_MISSED',
              completedAt: databaseNow,
            },
          });
          skippedMissed += skipped.count;
          continue;
        }

        const claim = await this.prisma.scheduleRun.updateMany({
          where: { id: run.id, status: ScheduleRunStatus.PENDING },
          data: { status: 'CLAIMED', claimedAt: databaseNow },
        });
        if (claim.count !== 1) continue;
        claimed += 1;
        const claimToken = databaseNow;

        try {
          const sceneResult = await this.sceneExecutor().runScene({
            tenantId: run.tenantId,
            sceneId: first.schedule.targetSceneId,
            requestId: `sched:${run.id}`,
            mode: 'ORDERED',
          });

          if (sceneResult.status !== SceneExecutionStatus.SUCCEEDED) {
            const settled = await this.prisma.scheduleRun.updateMany({
              where: {
                id: run.id,
                status: ScheduleRunStatus.CLAIMED,
                claimedAt: claimToken,
              },
              data: {
                status: ScheduleRunStatus.FAILED,
                sceneExecutionId: sceneResult.executionId,
                completedAt: new Date(),
              },
            });
            if (settled.count === 1) failed += 1;
            else this.logLostClaim(run.id, run.scheduleId);
            continue;
          }

          const settled = await this.prisma.scheduleRun.updateMany({
            where: {
              id: run.id,
              status: ScheduleRunStatus.CLAIMED,
              claimedAt: claimToken,
            },
            data: {
              status: ScheduleRunStatus.SUCCEEDED,
              sceneExecutionId: sceneResult.executionId,
              completedAt: new Date(),
            },
          });
          if (settled.count !== 1) {
            this.logLostClaim(run.id, run.scheduleId);
            continue;
          }

          await this.prisma.schedule.update({
            where: { id: run.scheduleId },
            data: {
              lastRunAt: databaseNow,
              runCount: { increment: 1 },
            },
          });
          succeeded += 1;
        } catch {
          const settled = await this.prisma.scheduleRun.updateMany({
            where: {
              id: run.id,
              status: ScheduleRunStatus.CLAIMED,
              claimedAt: claimToken,
            },
            data: { status: ScheduleRunStatus.FAILED, completedAt: new Date() },
          });
          if (settled.count === 1) failed += 1;
          else this.logLostClaim(run.id, run.scheduleId);
        }
      }
      void scheduleId;
    }

    const result = {
      claimed,
      succeeded,
      failed,
      skippedMissed,
    };

    this.logger.log({
      event: 'scheduler.due_runs.executed',
      ...result,
    });
    return result;
  }

  private logLostClaim(runId: string, scheduleId: string): void {
    this.logger.warn({
      event: 'scheduler.run.claim_lost',
      outcome: 'deferred_to_new_owner',
      runId,
      scheduleId,
    });
  }
}
