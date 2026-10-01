// `config.validation.ts` is decorated with class-validator, which needs Reflect metadata at
// import time. Without this the suite fails to run rather than failing an assertion, which
// reads like a tooling problem instead of a missing import.
import 'reflect-metadata';
import { validate } from './config.validation';

/**
 * A JWT secret is the master key for every session and every admin API call, and
 * `MQTT_WEBHOOK_SECRET` is the shared key between this platform and the broker webhook path.
 * "Is not a placeholder" is not a security property for either of them: `x`, `password`, and 32
 * identical characters were all accepted in production, because
 * `assertProductionSecret` was a denylist of ten recognisable filler strings and nothing else.
 *
 * The thresholds below are deliberately floors, not a password policy. They reject the
 * degenerate values — too short, one repeated character, one word repeated, a dictionary
 * password — while admitting the shape a real generated secret has: 32+ characters drawn from
 * at least eight distinct symbols. A 32-character hex string has 16 distinct characters, so it
 * passes; requiring full character-class diversity instead would have rejected it, and a
 * policy that rejects correctly-generated secrets teaches operators to work around the policy.
 */
/*
 * The floors these cases defend (>= 32 characters, >= 8 distinct symbols, no common word)
 * are enforced in `config.validation.ts`, next to the check itself, so the two cannot drift.
 * What is pinned here is the behaviour, not a copy of the numbers.
 */

const baseProductionConfig = {
  NODE_ENV: 'production',
  HOST: '127.0.0.1',
  PORT: '5000',
  SWAGGER_ENABLED: 'false',
  LOG_LEVEL: 'warn',
  CORS_ALLOWED_ORIGINS: 'https://app.example.com',
  METRICS_ACCESS_TOKEN: 'k3Qm9xTz2LpR7vNbW4cYhJf6DsA1uG0eV',
  SENSITIVE_RATE_LIMIT_MAX: '10',
  SENSITIVE_RATE_LIMIT_WINDOW_MS: '60000',
  MQTT_BROKER_URL: 'mqtts://broker.example.com:8883',
  MQTT_CLIENT_ID_PREFIX: 'iot-api',
  MQTT_USERNAME: 'publisher-user',
  MQTT_PASSWORD: 'b7Vn2Qmx9LtR4wKpZcYhJf6DsA1uG0eV',
  MQTT_CONNECT_TIMEOUT_MS: '10000',
  MQTT_PUBLISH_TIMEOUT_MS: '10000',
  MQTT_KEEPALIVE_SECONDS: '30',
  MQTT_RECONNECT_PERIOD_MS: '5000',
  MQTT_WEBHOOK_SECRET: 'r8Yq4Nwc2HmT6vBxJ0kLpZf3DsA9uG1eV',
  JWT_SECRET: 'w4Hj9Kmn2Qxt7Rbv6Yc1LpZf8DsA3uG0eV',
  COMMAND_ACK_TIMEOUT_MS: '5000',
  HEALTH_CHECK_TIMEOUT_MS: '1000',
};

describe('production secret strength', () => {
  it('accepts generated secrets of the shape a real deployment uses', () => {
    const validated = validate({ ...baseProductionConfig });
    expect(validated.JWT_SECRET).toBe(baseProductionConfig.JWT_SECRET);
    expect(validated.MQTT_WEBHOOK_SECRET).toBe(baseProductionConfig.MQTT_WEBHOOK_SECRET);
  });

  // Every value below is at least 32 characters on purpose. A shorter one is caught by the
  // length floor, which would make the case pass while testing something other than what its
  // name claims — the same "green for the wrong reason" failure this whole check is about.
  it.each([
    ['a single character', 'x'],
    ['a short password', 'password'],
    ['one character repeated to length', 'a'.repeat(32)],
    ['one word repeated past the length floor', 'secretsecretsecretsecretsecretss'],
    ['a dictionary word padded past the length floor', 'passwordpasswordpasswordpassword'],
    ['a common secret padded past the length floor', 'topsecrettopsecrettopsecrettopsecrets'],
  ])('rejects a JWT secret that is %s', (_label, secret) => {
    expect(() => validate({ ...baseProductionConfig, JWT_SECRET: secret })).toThrow(
      /JWT_SECRET/,
    );
  });

  it('rejects a webhook secret that is one repeated character', () => {
    expect(() =>
      validate({ ...baseProductionConfig, MQTT_WEBHOOK_SECRET: 'z'.repeat(40) }),
    ).toThrow(/MQTT_WEBHOOK_SECRET/);
  });

  it('rejects an MQTT password that is a common secret padded to length', () => {
    expect(() =>
      validate({ ...baseProductionConfig, MQTT_PASSWORD: 'letmeinletmeinletmeinletmeinl' }),
    ).toThrow(/MQTT_PASSWORD/);
  });

  it('still rejects the placeholder values it always rejected', () => {
    expect(() => validate({ ...baseProductionConfig, JWT_SECRET: 'change_me_in_production' })).toThrow(
      /placeholder/,
    );
  });

  it('does not apply the production floor outside production', () => {
    // Development and test stacks legitimately use short values, and breaking them would only
    // teach people to bypass the check by setting NODE_ENV.
    const development = validate({
      ...baseProductionConfig,
      NODE_ENV: 'development',
      JWT_SECRET: 'dev',
    });
    expect(development.JWT_SECRET).toBe('dev');
  });
});
