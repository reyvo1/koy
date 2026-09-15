import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { toStructuredLogError } from '../common/logging/log-error';
import { AutomationCommandDispatcher } from './automation-command-dispatcher';
import { AutomationRetryReservationService } from './automation-retry-reservation.service';
import { isAutomationRuntimeEnabled } from './automation-runtime-policy';

const AUTOMATION_RETRY_TICK_MS = 5_000;
const AUTOMATION_RETRY_BATCH_SIZE = 25;

/**
 * Wave 2 — opt-in durable automation retry worker.
 *
 * The worker never re-evaluates telemetry. It scans only persisted FAILED
 * actions, atomically claims an eligible retry through PostgreSQL-authoritative
 * state/database time, then re-enters the existing ordered dispatcher.
 */
@Injectable()
export class AutomationRetryWorker {
  private readonly logger = new Logger(AutomationRetryWorker.name);
  private running = false;

  constructor(
    private readonly retries: AutomationRetryReservationService,
    private readonly dispatcher: AutomationCommandDispatcher,
  ) {}

  @Interval(AUTOMATION_RETRY_TICK_MS)
  async tick(): Promise<void> {
    if (!isAutomationRuntimeEnabled()) return;
    if (this.running) {
      this.logger.warn({
        event: 'automation.retry_worker.tick_skipped',
        outcome: 'overlap',
      });
      return;
    }

    this.running = true;
    let claimed = 0;
    let dispatched = 0;
    let failed = 0;

    try {
      const candidates = await this.retries.listRetryCandidates(
        AUTOMATION_RETRY_BATCH_SIZE,
      );

      for (const candidate of candidates) {
        try {
          const didClaim = await this.retries.claimEligibleRetry(candidate);
          if (!didClaim) continue;
          claimed += 1;
          await this.dispatcher.dispatchExecution({
            tenantId: candidate.tenantId,
            executionId: candidate.executionId,
          });
          dispatched += 1;
        } catch (error) {
          failed += 1;
          this.logger.error({
            event: 'automation.retry_worker.candidate_failed',
            outcome: 'failed',
            executionId: candidate.executionId,
            actionId: candidate.actionId,
            error: toStructuredLogError(error),
          });
        }
      }

      if (candidates.length > 0) {
        this.logger.log({
          event: 'automation.retry_worker.tick_completed',
          outcome: failed === 0 ? 'succeeded' : 'partially_failed',
          candidateCount: candidates.length,
          claimed,
          dispatched,
          failed,
        });
      }
    } catch (error) {
      this.logger.error({
        event: 'automation.retry_worker.tick_failed',
        outcome: 'failed',
        error: toStructuredLogError(error),
      });
    } finally {
      this.running = false;
    }
  }
}
