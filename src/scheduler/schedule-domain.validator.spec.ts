import { describe, it, expect } from '@jest/globals';
import { ScheduleDomainValidator } from './schedule-domain.validator';

const sceneId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

describe('ScheduleDomainValidator', () => {
  const validator = new ScheduleDomainValidator();

  const valid = (overrides: Record<string, unknown> = {}) => ({
    name: 'Nightly lights off',
    kind: 'CRON',
    expression: '0 30 22 * * *',
    timezone: 'Asia/Jakarta',
    targetSceneId: sceneId,
    ...overrides,
  });

  it('accepts a timezone-aware cron schedule', () => {
    expect(() => validator.validate(valid())).not.toThrow();
  });

  it('accepts a bounded countdown schedule', () => {
    expect(() =>
      validator.validate({
        name: 'One-shot',
        kind: 'COUNTDOWN',
        countdownSeconds: 300,
        targetSceneId: sceneId,
      }),
    ).not.toThrow();
  });

  it('rejects invalid cron expressions', () => {
    expect(() =>
      validator.validate(valid({ expression: 'not a cron' })),
    ).toThrow(/invalid cron|SCHEDULE_EXPRESSION_INVALID/);
  });

  it('rejects unknown IANA timezones and falls back to UTC when omitted', () => {
    expect(() =>
      validator.validate(valid({ timezone: 'Nowhere/Nowhere' })),
    ).toThrow(/timezone/i);
    expect(validator.resolveTimezone(undefined)).toBe('UTC');
    expect(validator.resolveTimezone('Asia/Jakarta')).toBe('Asia/Jakarta');
    expect(validator.resolveTimezone('../etc/passwd')).toBeNull();
  });

  it('rejects out-of-bounds countdowns', () => {
    expect(() =>
      validator.validate({
        name: 'x',
        kind: 'COUNTDOWN',
        countdownSeconds: 0,
        targetSceneId: sceneId,
      }),
    ).toThrow(/countdown/i);
    expect(() =>
      validator.validate({
        name: 'x',
        kind: 'COUNTDOWN',
        countdownSeconds: 31 * 24 * 3600,
        targetSceneId: sceneId,
      }),
    ).toThrow(/countdown/i);
  });

  it('requires a scene target', () => {
    expect(() =>
      validator.validate(valid({ targetSceneId: undefined })),
    ).toThrow(/SCHEDULE_TARGET_REQUIRED|target/i);
  });

  it('rejects invalid maxRuns', () => {
    expect(() => validator.validate(valid({ maxRuns: 0 }))).toThrow(
      /MAXRUNS/i,
    );
  });

  it('rejects LIMITED repeat without maxRuns', () => {
    expect(() =>
      validator.validate(
        valid({ repeat: 'LIMITED', maxRuns: undefined }),
      ),
    ).toThrow('SCHEDULE_MAXRUNS_INVALID');
  });

  it('rejects unknown repeat mode', () => {
    expect(() => validator.validate(valid({ repeat: 'FOREVER' }))).toThrow(
      'SCHEDULE_REPEAT_INVALID',
    );
  });

});
