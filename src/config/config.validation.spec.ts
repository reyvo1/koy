import 'reflect-metadata';
import { validate } from './config.validation';

const productionConfig = {
  NODE_ENV: 'production',
  HOST: '127.0.0.1',
  PORT: '3100',
  SWAGGER_ENABLED: 'false',
  LOG_LEVEL: 'warn',
  CORS_ALLOWED_ORIGINS: 'https://app.example.com,https://admin.example.com',
  METRICS_ACCESS_TOKEN: 'metrics-access-token-for-production-tests',
  SENSITIVE_RATE_LIMIT_MAX: '10',
  SENSITIVE_RATE_LIMIT_WINDOW_MS: '60000',
  MQTT_BROKER_URL: 'mqtts://broker.example.com:8883',
  MQTT_CLIENT_ID_PREFIX: 'iot-api',
  MQTT_USERNAME: 'publisher-user',
  MQTT_PASSWORD: 'publisher-password-for-production-tests',
  MQTT_CONNECT_TIMEOUT_MS: '10000',
  MQTT_PUBLISH_TIMEOUT_MS: '10000',
  MQTT_KEEPALIVE_SECONDS: '30',
  MQTT_RECONNECT_PERIOD_MS: '5000',
  MQTT_WEBHOOK_SECRET: 'mqtt-webhook-secret-for-production-tests',
  JWT_SECRET: 'jwt-signing-secret-for-production-tests',
  COMMAND_ACK_TIMEOUT_MS: '5000',
  HEALTH_CHECK_TIMEOUT_MS: '1000',
};

describe('Config Validation', () => {
  it('validates production host, port, and disabled Swagger', () => {
    const validated = validate(productionConfig);

    expect(validated.NODE_ENV).toBe('production');
    expect(validated.HOST).toBe('127.0.0.1');
    expect(validated.PORT).toBe(3100);
    expect(validated.SWAGGER_ENABLED).toBe(false);
    expect(validated.LOG_LEVEL).toBe('warn');
    expect(validated.COMMAND_ACK_TIMEOUT_MS).toBe(5000);
    expect(validated.HEALTH_CHECK_TIMEOUT_MS).toBe(1000);
    expect(validated.CORS_ALLOWED_ORIGINS).toContain('https://app.example.com');
    expect(validated.METRICS_ACCESS_TOKEN).toBe(
      'metrics-access-token-for-production-tests',
    );
    expect(validated.SENSITIVE_RATE_LIMIT_MAX).toBe(10);
    expect(validated.SENSITIVE_RATE_LIMIT_WINDOW_MS).toBe(60000);
  });

  it('defaults Swagger to disabled in production', () => {
    const { SWAGGER_ENABLED: _swaggerEnabled, ...config } = productionConfig;

    expect(validate(config).SWAGGER_ENABLED).toBe(false);
  });

  it('defaults Swagger to enabled outside production', () => {
    const validated = validate({
      NODE_ENV: 'development',
      MQTT_WEBHOOK_SECRET: 'development-secret',
      JWT_SECRET: 'development-jwt-secret',
    });

    expect(validated.SWAGGER_ENABLED).toBe(true);
  });

  it('rejects Swagger exposure in production', () => {
    expect(() =>
      validate({
        ...productionConfig,
        SWAGGER_ENABLED: 'true',
      }),
    ).toThrow('SWAGGER_ENABLED must be false in production');
  });

  it('rejects invalid boolean configuration', () => {
    expect(() =>
      validate({
        ...productionConfig,
        SWAGGER_ENABLED: 'sometimes',
      }),
    ).toThrow();
  });

  it('rejects the documented MQTT placeholder in production', () => {
    expect(() =>
      validate({
        ...productionConfig,
        MQTT_WEBHOOK_SECRET: 'change_me_in_production',
      }),
    ).toThrow('MQTT_WEBHOOK_SECRET must not use a placeholder value');
  });

  it('rejects the documented JWT placeholder in production', () => {
    expect(() =>
      validate({
        ...productionConfig,
        JWT_SECRET: 'change_me_in_production',
      }),
    ).toThrow('JWT_SECRET must not use a placeholder value');
  });

  it('fails if MQTT_WEBHOOK_SECRET is missing', () => {
    const { MQTT_WEBHOOK_SECRET: _secret, ...config } = productionConfig;

    expect(() => validate(config)).toThrow();
  });

  it('fails if JWT_SECRET is missing', () => {
    const { JWT_SECRET: _secret, ...config } = productionConfig;

    expect(() => validate(config)).toThrow();
  });

  it('rejects a blank host', () => {
    expect(() =>
      validate({
        ...productionConfig,
        HOST: '   ',
      }),
    ).toThrow('HOST must not be blank');
  });

  it.each(['0', '65536'])('rejects an out-of-range port value %s', (port) => {
    expect(() =>
      validate({
        ...productionConfig,
        PORT: port,
      }),
    ).toThrow();
  });

  it('fails if COMMAND_ACK_TIMEOUT_MS is non-positive', () => {
    expect(() =>
      validate({
        ...productionConfig,
        COMMAND_ACK_TIMEOUT_MS: '0',
      }),
    ).toThrow();
  });

  it('fails if LOG_LEVEL is invalid', () => {
    expect(() =>
      validate({
        ...productionConfig,
        LOG_LEVEL: 'verbose',
      }),
    ).toThrow();
  });

  it('rejects a missing production CORS allowlist', () => {
    const { CORS_ALLOWED_ORIGINS: _origins, ...config } = productionConfig;

    expect(() => validate(config)).toThrow(
      'CORS_ALLOWED_ORIGINS must not be empty in production',
    );
  });

  it.each(['*', 'http://app.example.com', 'https://app.example.com/path'])(
    'rejects unsafe production CORS allowlist value %s',
    (origin) => {
      expect(() =>
        validate({
          ...productionConfig,
          CORS_ALLOWED_ORIGINS: origin,
        }),
      ).toThrow();
    },
  );

  it('rejects a missing production metrics access token', () => {
    const { METRICS_ACCESS_TOKEN: _token, ...config } = productionConfig;

    expect(() => validate(config)).toThrow(
      'METRICS_ACCESS_TOKEN is required in production',
    );
  });

  it('rejects a placeholder production metrics access token', () => {
    expect(() =>
      validate({
        ...productionConfig,
        METRICS_ACCESS_TOKEN: 'your_metrics_access_token',
      }),
    ).toThrow('METRICS_ACCESS_TOKEN must not use a placeholder value');
  });

  it.each([
    ['SENSITIVE_RATE_LIMIT_MAX', '0'],
    ['SENSITIVE_RATE_LIMIT_WINDOW_MS', '0'],
    ['SENSITIVE_RATE_LIMIT_MAX', '1.5'],
  ])('rejects invalid %s value %s', (key, value) => {
    expect(() =>
      validate({
        ...productionConfig,
        [key]: value,
      }),
    ).toThrow();
  });

  it.each([
    ['MQTT_BROKER_URL'],
    ['MQTT_CLIENT_ID_PREFIX'],
    ['MQTT_USERNAME'],
    ['MQTT_PASSWORD'],
  ])('requires %s in production', (key) => {
    const config = { ...productionConfig } as Record<string, unknown>;
    delete config[key];

    expect(() => validate(config)).toThrow(`${key} is required in production`);
  });

  it.each([
    'mqtt://broker.example.com:1883',
    'mqtts://user:secret@broker.example.com:8883',
    'mqtts://broker.example.com:8883/path',
  ])('rejects unsafe production broker URL %s', (brokerUrl) => {
    expect(() =>
      validate({
        ...productionConfig,
        MQTT_BROKER_URL: brokerUrl,
      }),
    ).toThrow();
  });

  it('rejects unsafe MQTT client identifiers', () => {
    expect(() =>
      validate({
        ...productionConfig,
        MQTT_CLIENT_ID_PREFIX: 'iot api/unsafe',
      }),
    ).toThrow('MQTT_CLIENT_ID_PREFIX contains unsafe characters');
  });

  it('rejects a placeholder MQTT publisher password', () => {
    expect(() =>
      validate({
        ...productionConfig,
        MQTT_PASSWORD: 'your_mqtt_password',
      }),
    ).toThrow('MQTT_PASSWORD must not use a placeholder value');
  });

  it.each([
    ['MQTT_CONNECT_TIMEOUT_MS', '999'],
    ['MQTT_PUBLISH_TIMEOUT_MS', '60001'],
    ['MQTT_KEEPALIVE_SECONDS', '4'],
    ['MQTT_RECONNECT_PERIOD_MS', '0'],
  ])('rejects invalid %s value %s', (key, value) => {
    expect(() =>
      validate({
        ...productionConfig,
        [key]: value,
      }),
    ).toThrow();
  });

  it('rejects a non-positive health check timeout', () => {
    expect(() =>
      validate({
        ...productionConfig,
        HEALTH_CHECK_TIMEOUT_MS: '0',
      }),
    ).toThrow();
  });
});
