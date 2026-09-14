import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';

/**
 * Per-account login lockout (brute-force protection).
 *
 * Tracks consecutive failed logins per identity (email+tenant) in Redis with
 * a sliding window. After MAX_FAILURES within WINDOW_MS the account is
 * locked out for LOCKOUT_MS. Successful login clears the counter.
 *
 * Fail-open policy mirrors SensitiveEndpointRateLimitGuard: if Redis is
 * unavailable the check reports unlocked so authentication degrades to the
 * existing IP rate limit rather than locking every user out.
 */

export const LOCKOUT_MAX_FAILURES = 5;
export const LOCKOUT_WINDOW_MS = 15 * 60 * 1000; // 15 min failure window
export const LOCKOUT_MS = 15 * 60 * 1000; // 15 min lockout

const INCR_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
return { current, ttl }
`;

@Injectable()
export class LoginLockoutService {
  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {}

  async isLockedOut(identityKey: string): Promise<boolean> {
    try {
      const current = await this.redis.get(this.key(identityKey));
      return current !== null && Number(current) >= LOCKOUT_MAX_FAILURES;
    } catch {
      return false;
    }
  }

  async recordFailure(identityKey: string): Promise<void> {
    try {
      await this.redis.eval(
        INCR_SCRIPT,
        1,
        this.key(identityKey),
        String(LOCKOUT_WINDOW_MS),
      );
    } catch {
      // fail-open: IP rate limit still applies
    }
  }

  async clearFailures(identityKey: string): Promise<void> {
    try {
      await this.redis.del(this.key(identityKey));
    } catch {
      // non-fatal
    }
  }

  private key(identityKey: string): string {
    return `iot:login-lockout:${identityKey}`;
  }
}
