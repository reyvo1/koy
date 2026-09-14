import { CronJob } from 'cron';
import { Injectable, Logger } from '@nestjs/common';

export const SCHEDULER_LIMITS = {
  maxNameLength: 120,
  maxExpressionLength: 128,
  maxCountdownSeconds: 30 * 24 * 3600, // 30 days
  maxMissedCatchUp: 10,
} as const;

const TIMEZONE_FALLBACK = 'UTC';
// IANA timezone shape, e.g. Asia/Jakarta, UTC, Europe/Berlin
const TIMEZONE_PATTERN =
  /^[A-Za-z_]+\/[A-Za-z_+-]+(\/[A-Za-z_+-]+)*$|^UTC$/;

export type ScheduleDomainErrorCode =
  | 'SCHEDULE_NAME_INVALID'
  | 'SCHEDULE_EXPRESSION_INVALID'
  | 'SCHEDULE_TIMEZONE_INVALID'
  | 'SCHEDULE_COUNTDOWN_INVALID'
  | 'SCHEDULE_TARGET_REQUIRED'
  | 'SCHEDULE_REPEAT_INVALID'
  | 'SCHEDULE_MAXRUNS_INVALID';

/**
 * Module 13 Slice 13.1 — schedule definition validation. Timezone-aware cron
 * expressions are parsed with the installed `cron` library against the given
 * IANA timezone; countdowns are bounded second intervals.
 */
@Injectable()
export class ScheduleDomainValidator {
  private readonly logger = new Logger(ScheduleDomainValidator.name);

  validate(input: {
    name?: unknown;
    kind?: unknown;
    expression?: unknown;
    timezone?: unknown;
    targetSceneId?: unknown;
    countdownSeconds?: unknown;
    repeat?: unknown;
    maxRuns?: unknown;
  }): void {
    const errors: ScheduleDomainErrorCode[] = [];

    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (!name || name.length > SCHEDULER_LIMITS.maxNameLength) {
      errors.push('SCHEDULE_NAME_INVALID');
    }

    if (input.kind !== 'CRON' && input.kind !== 'COUNTDOWN') {
      throw Object.assign(new Error('kind must be CRON or COUNTDOWN'), {
        code: 'SCHEDULE_EXPRESSION_INVALID' as const,
      });
    }

    if (input.kind === 'CRON') {
      const expression =
        typeof input.expression === 'string' ? input.expression.trim() : '';
      if (
        !expression ||
        expression.length > SCHEDULER_LIMITS.maxExpressionLength ||
        !this.isValidCron(expression, this.resolveTimezone(input.timezone))
      ) {
        throw Object.assign(new Error('invalid cron expression'), {
          code: 'SCHEDULE_EXPRESSION_INVALID',
        });
      }
    }

    if (input.kind === 'COUNTDOWN') {
      const seconds =
        typeof input.countdownSeconds === 'number'
          ? Math.floor(input.countdownSeconds)
          : NaN;
      if (
        !Number.isFinite(seconds) ||
        seconds < 1 ||
        seconds > SCHEDULER_LIMITS.maxCountdownSeconds
      ) {
        throw Object.assign(new Error('countdown out of bounds'), {
          code: 'SCHEDULE_COUNTDOWN_INVALID',
        });
      }
    }

    const timezone = this.resolveTimezone(input.timezone);
    if (timezone === null) {
      throw Object.assign(new Error('invalid timezone'), {
        code: 'SCHEDULE_TIMEZONE_INVALID',
      });
    }

    if (typeof input.targetSceneId !== 'string' || !input.targetSceneId) {
      errors.push('SCHEDULE_TARGET_REQUIRED');
    }

    const repeat = input.repeat ?? 'INDEFINITE';
    if (repeat !== 'INDEFINITE' && repeat !== 'LIMITED' && repeat !== 'ONCE') {
      errors.push('SCHEDULE_REPEAT_INVALID');
    }

    if (
      (input.maxRuns !== undefined &&
        input.maxRuns !== null &&
        (typeof input.maxRuns !== 'number' ||
          !Number.isInteger(input.maxRuns) ||
          input.maxRuns < 1)) ||
      (repeat === 'LIMITED' &&
        (typeof input.maxRuns !== 'number' ||
          !Number.isInteger(input.maxRuns) ||
          input.maxRuns < 1))
    ) {
      errors.push('SCHEDULE_MAXRUNS_INVALID');
    }

    if (errors.length > 0) {
      throw Object.assign(new Error(`schedule invalid: ${errors.join(',')}`), {
        code: errors[0],
      });
    }
  }

  /** Returns the normalized timezone or null when clearly invalid. */
  resolveTimezone(timezone: unknown): string | null {
    if (timezone === undefined || timezone === null || timezone === '') {
      return TIMEZONE_FALLBACK;
    }
    if (typeof timezone !== 'string') return null;
    const candidate = timezone.trim();
    if (!TIMEZONE_PATTERN.test(candidate)) return null;
    try {
      // Round-trip check via Intl — rejects unknown zones like Nowhere/Nowhere.
      new Intl.DateTimeFormat('en-US', { timeZone: candidate }).format(new Date());
      return candidate;
    } catch {
      return null;
    }
  }

  private isValidCron(expression: string, timezone: string): boolean {
    try {
      // Parse-only probe; fires never. Supports 5- and 6-field expressions.
      const job = CronJob.from({
        cronTime: expression,
        onTick: () => undefined,
        timeZone: timezone,
        start: false,
        runOnInit: false,
      });
      return Boolean(job.nextDate());
    } catch {
      return false;
    }
  }
}
