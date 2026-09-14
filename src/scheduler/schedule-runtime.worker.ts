import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { toStructuredLogError } from '../common/logging/log-error';
import {
  SCHEDULER_RUN_LIMITS,
  ScheduleDueRunService,
} from './schedule-due-run.service';

const SCHEDULER_RUNTIME_TICK_MS = 15_000;

/**
 * RESCUE-02B runtime activation for the durable scheduler.
 *
 * The worker is opt-in through SCHEDULER_RUNTIME_ENABLED=true. Durable
 * schedule-run uniqueness plus conditional PENDING->CLAIMED transitions make
 * duplicate ticks safe across process overlap, while the local `running`
 * guard prevents one API instance from stacking ticks on itself.
 */
@Injectable()
export class ScheduleRuntimeWorker {
  private readonly logger = new Logger(ScheduleRuntimeWorker.name);
  private running = false;

  constructor(
    private readonly dueRuns: ScheduleDueRunService,
    private readonly config: ConfigService,
  ) {}

  @Interval(SCHEDULER_RUNTIME_TICK_MS)
  async tick(): Promise<void> {
    if (!this.config.get<boolean>('SCHEDULER_RUNTIME_ENABLED', false)) {
      return;
    }
    if (this.running) {
      this.logger.warn({
        event: 'scheduler.runtime.tick_skipped',
        outcome: 'overlap',
      });
      return;
    }

    this.running = true;
    try {
      const claimTimeoutMs = this.config.get<number>(
        'SCHEDULER_CLAIM_TIMEOUT_MS',
        SCHEDULER_RUN_LIMITS.defaultClaimTimeoutMs,
      );
      const recoveredClaims = await this.dueRuns.recoverStaleClaims(
        claimTimeoutMs,
      );
      const materialized = await this.dueRuns.materializeUpcomingRuns(24);
      const executed = await this.dueRuns.executeDueRuns();

      if (
        recoveredClaims > 0 ||
        materialized > 0 ||
        executed.claimed > 0 ||
        executed.skippedMissed > 0
      ) {
        this.logger.log({
          event: 'scheduler.runtime.tick_completed',
          outcome: 'succeeded',
          recoveredClaims,
          materialized,
          ...executed,
        });
      }
    } catch (error) {
      this.logger.error({
        event: 'scheduler.runtime.tick_failed',
        outcome: 'failed',
        error: toStructuredLogError(error),
      });
    } finally {
      this.running = false;
    }
  }
}
