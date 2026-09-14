import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { toStructuredLogError } from '../common/logging/log-error';
import { MetricsService } from '../metrics/metrics.service';
import { CommandService } from './command.service';

const COMMAND_TIMEOUT_INTERVAL_MS = 60_000;
const DEFAULT_COMMAND_ACK_TIMEOUT_MS = 300_000;

@Injectable()
export class CommandTimeoutScheduler {
  private readonly logger = new Logger(CommandTimeoutScheduler.name);

  constructor(
    private readonly commandService: CommandService,
    private readonly configService: ConfigService,
    @Optional() private readonly metrics?: MetricsService,
  ) {}

  @Interval(COMMAND_TIMEOUT_INTERVAL_MS)
  async markTimedOutCommands() {
    const timeoutMs = this.configService.get<number>(
      'COMMAND_ACK_TIMEOUT_MS',
      DEFAULT_COMMAND_ACK_TIMEOUT_MS,
    );
    const thresholdDate = new Date(Date.now() - timeoutMs);
    const threshold = thresholdDate.toISOString();

    try {
      const timedOutResult =
        await this.commandService.markTimedOut(thresholdDate);

      if (timedOutResult.count > 0) {
        this.logger.log({
          event: 'command.timeout.applied',
          outcome: 'succeeded',
          timedOutCount: timedOutResult.count,
          timeoutMs,
          threshold,
        });
      }

      const staleCount =
        await this.commandService.countStalePending(thresholdDate);

      if (staleCount > 0) {
        this.metrics?.recordCommandLifecycle('stale_pending', staleCount);

        this.logger.warn({
          event: 'command.pending.stale.detected',
          outcome: 'detected',
          staleCount,
          timeoutMs,
          threshold,
        });
      }
    } catch (error) {
      this.logger.error({
        event: 'command.timeout.scan.failed',
        outcome: 'failed',
        timeoutMs,
        threshold,
        error: toStructuredLogError(error),
      });
    }
  }
}
