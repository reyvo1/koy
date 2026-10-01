import { Transform, Type, plainToInstance } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  Min,
  validateSync,
} from 'class-validator';
import {
  DEFAULT_SENSITIVE_RATE_LIMIT_MAX,
  DEFAULT_SENSITIVE_RATE_LIMIT_WINDOW_MS,
  defaultCorsAllowedOrigins,
  parseCorsAllowedOrigins,
} from '../security/production-security.config';

enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

enum LogLevel {
  Fatal = 'fatal',
  Error = 'error',
  Warn = 'warn',
  Info = 'info',
  Debug = 'debug',
  Trace = 'trace',
  Silent = 'silent',
}

const PRODUCTION_PLACEHOLDER_SECRETS = new Set([
  'change_me_in_production',
  'change-me-in-production',
  'changeme',
  'replace_me',
  'replace-me',
  'your_jwt_secret',
  'your_mqtt_webhook_secret',
  'your_metrics_access_token',
  'your_mqtt_password',
  'your_email_relay_token',
]);

function transformBoolean(value: unknown): unknown {
  if (value === true || value === 'true') {
    return true;
  }

  if (value === false || value === 'false') {
    return false;
  }

  return value;
}

class EnvironmentVariables {
  @IsEnum(Environment)
  NODE_ENV: Environment = Environment.Development;

  @IsString()
  @IsNotEmpty()
  HOST = '0.0.0.0';

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(65535)
  PORT = 3000;

  @Transform(({ value }) => transformBoolean(value))
  @IsBoolean()
  SWAGGER_ENABLED = true;

  @IsOptional()
  @IsEnum(LogLevel)
  LOG_LEVEL?: LogLevel;

  @IsString()
  CORS_ALLOWED_ORIGINS: string;

  @IsOptional()
  @IsString()
  METRICS_ACCESS_TOKEN?: string;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  SENSITIVE_RATE_LIMIT_MAX = DEFAULT_SENSITIVE_RATE_LIMIT_MAX;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  SENSITIVE_RATE_LIMIT_WINDOW_MS = DEFAULT_SENSITIVE_RATE_LIMIT_WINDOW_MS;

  @IsString()
  REDIS_URL = 'redis://localhost:6379';

  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  HEALTH_CHECK_TIMEOUT_MS = 1000;

  @IsOptional()
  @IsString()
  MQTT_BROKER_URL?: string;

  @IsOptional()
  @IsString()
  MQTT_CLIENT_ID_PREFIX?: string;

  @IsOptional()
  @IsString()
  MQTT_USERNAME?: string;

  @IsOptional()
  @IsString()
  MQTT_PASSWORD?: string;

  @IsOptional()
  @IsString()
  MQTT_CA_FILE?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1000)
  @Max(60000)
  MQTT_CONNECT_TIMEOUT_MS = 10000;

  @Type(() => Number)
  @IsInt()
  @Min(1000)
  @Max(60000)
  MQTT_PUBLISH_TIMEOUT_MS = 10000;

  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(300)
  MQTT_KEEPALIVE_SECONDS = 30;

  @Type(() => Number)
  @IsInt()
  @Min(1000)
  @Max(60000)
  MQTT_RECONNECT_PERIOD_MS = 5000;

  @IsString()
  @IsNotEmpty()
  MQTT_WEBHOOK_SECRET: string;

  @IsString()
  @IsNotEmpty()
  JWT_SECRET: string;

  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  COMMAND_ACK_TIMEOUT_MS = 300000;

  @Transform(({ value }) => transformBoolean(value))
  @IsBoolean()
  SCHEDULER_RUNTIME_ENABLED = false;

  @Transform(({ value }) => transformBoolean(value))
  @IsBoolean()
  AUTOMATION_RUNTIME_ENABLED = false;

  @Transform(({ value }) => transformBoolean(value))
  @IsBoolean()
  NOTIFICATION_RUNTIME_ENABLED = false;

  @Type(() => Number)
  @IsInt()
  @Min(30_000)
  @Max(600_000)
  NOTIFICATION_CLAIM_TIMEOUT_MS = 60_000;

  @Type(() => Number)
  @IsInt()
  @Min(1_000)
  @Max(60_000)
  EMAIL_RELAY_TIMEOUT_MS = 10_000;

  @IsOptional()
  @IsString()
  EMAIL_RELAY_URL?: string;

  @IsOptional()
  @IsString()
  EMAIL_RELAY_TOKEN?: string;

  @IsOptional()
  @IsString()
  EMAIL_FROM?: string;

  @Type(() => Number)
  @IsInt()
  @Min(60_000)
  @Max(3_600_000)
  SCHEDULER_CLAIM_TIMEOUT_MS = 300_000;
}

function assertNonBlank(name: string, value: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${name} must not be blank`);
  }
}

/**
 * Floors for a secret that guards authentication or message integrity in production.
 *
 * These are floors, not a password policy. Length plus a distinct-symbol floor rejects the
 * degenerate values that a denylist cannot enumerate — one character, one word repeated, a
 * dictionary word padded with itself — while admitting the shape a generated secret actually
 * has. A 32-character hex string has 16 distinct symbols and passes; demanding full
 * character-class diversity would reject it, and a policy that rejects correctly-generated
 * secrets teaches operators to route around the policy.
 */
const MIN_PRODUCTION_SECRET_LENGTH = 32;
const MIN_PRODUCTION_SECRET_DISTINCT_SYMBOLS = 8;

/**
 * Long enough to clear a length check and still trivially guessable. Padding a common word out
 * to 32 characters is the obvious way to defeat a length-only rule, so the whole value is
 * reduced to a known password before the length floor is applied.
 */
const COMMON_PRODUCTION_SECRETS = new Set([
  'password',
  'passw0rd',
  'secret',
  'supersecret',
  'topsecret',
  'letmein',
  'admin',
  'administrator',
  'default',
  'qwerty',
  'iot',
]);

/**
 * The longest run of one repeated character, as a fraction of the value.
 *
 * `aaaa…` has one distinct symbol and is already caught by the distinct-symbol floor, but the
 * separate check keeps the error message specific instead of a generic "too weak" for the most
 * common accidental value.
 */
function assertProductionSecret(name: string, value: string): void {
  const normalized = value.trim().toLowerCase();

  if (PRODUCTION_PLACEHOLDER_SECRETS.has(normalized)) {
    throw new Error(`${name} must not use a placeholder value in production`);
  }

  if (value.length < MIN_PRODUCTION_SECRET_LENGTH) {
    throw new Error(
      `${name} must be at least ${MIN_PRODUCTION_SECRET_LENGTH} characters in production ` +
        `(got ${value.length}); generate one with \`openssl rand -base64 32\``,
    );
  }

  // Reduce before comparing, so `passwordpasswordpasswordpass` is recognised as the dictionary
  // word it is rather than passing on length alone.
  const collapsed = normalized.replace(/[^a-z0-9]/g, '');
  if (COMMON_PRODUCTION_SECRETS.has(collapsed) || COMMON_PRODUCTION_SECRETS.has(normalized)) {
    throw new Error(`${name} must not be based on a common word in production`);
  }

  const distinctSymbols = new Set(value).size;
  if (distinctSymbols < MIN_PRODUCTION_SECRET_DISTINCT_SYMBOLS) {
    throw new Error(
      `${name} has only ${distinctSymbols} distinct characters in production; at least ` +
        `${MIN_PRODUCTION_SECRET_DISTINCT_SYMBOLS} are required, so a repeated character ` +
        'or a single repeated word cannot pass',
    );
  }
}

export function validate(config: Record<string, unknown>) {
  const environment = config.NODE_ENV ?? Environment.Development;
  const normalizedConfig = { ...config };

  if (normalizedConfig.SWAGGER_ENABLED === undefined) {
    normalizedConfig.SWAGGER_ENABLED = environment !== Environment.Production;
  }

  if (normalizedConfig.CORS_ALLOWED_ORIGINS === undefined) {
    normalizedConfig.CORS_ALLOWED_ORIGINS = defaultCorsAllowedOrigins(
      String(environment),
    );
  }

  const validatedConfig = plainToInstance(
    EnvironmentVariables,
    normalizedConfig,
    {
      enableImplicitConversion: true,
    },
  );
  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }

  assertNonBlank('HOST', validatedConfig.HOST);
  assertNonBlank('MQTT_WEBHOOK_SECRET', validatedConfig.MQTT_WEBHOOK_SECRET);
  assertNonBlank('JWT_SECRET', validatedConfig.JWT_SECRET);
  const corsAllowedOrigins = parseCorsAllowedOrigins(
    validatedConfig.CORS_ALLOWED_ORIGINS,
  );

  if (validatedConfig.NOTIFICATION_RUNTIME_ENABLED) {
    const emailRequiredValues = {
      EMAIL_RELAY_URL: validatedConfig.EMAIL_RELAY_URL,
      EMAIL_RELAY_TOKEN: validatedConfig.EMAIL_RELAY_TOKEN,
      EMAIL_FROM: validatedConfig.EMAIL_FROM,
    };
    for (const [name, value] of Object.entries(emailRequiredValues)) {
      if (!value) throw new Error(`${name} is required when notification runtime is enabled`);
      assertNonBlank(name, value);
    }

    const relayUrl = new URL(validatedConfig.EMAIL_RELAY_URL!);
    if (relayUrl.protocol !== 'https:' || relayUrl.username || relayUrl.password) {
      throw new Error('EMAIL_RELAY_URL must use credential-free https://');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(validatedConfig.EMAIL_FROM!)) {
      throw new Error('EMAIL_FROM must be a valid email address');
    }
  }

  if (validatedConfig.NODE_ENV === Environment.Production) {
    if (validatedConfig.SWAGGER_ENABLED) {
      throw new Error('SWAGGER_ENABLED must be false in production');
    }

    assertProductionSecret(
      'MQTT_WEBHOOK_SECRET',
      validatedConfig.MQTT_WEBHOOK_SECRET,
    );
    assertProductionSecret('JWT_SECRET', validatedConfig.JWT_SECRET);
    if (validatedConfig.NOTIFICATION_RUNTIME_ENABLED) {
      assertProductionSecret(
        'EMAIL_RELAY_TOKEN',
        validatedConfig.EMAIL_RELAY_TOKEN!,
      );
    }

    const mqttRequiredValues = {
      MQTT_BROKER_URL: validatedConfig.MQTT_BROKER_URL,
      MQTT_CLIENT_ID_PREFIX: validatedConfig.MQTT_CLIENT_ID_PREFIX,
      MQTT_USERNAME: validatedConfig.MQTT_USERNAME,
      MQTT_PASSWORD: validatedConfig.MQTT_PASSWORD,
    };

    for (const [name, value] of Object.entries(mqttRequiredValues)) {
      if (!value) {
        throw new Error(`${name} is required in production`);
      }
      assertNonBlank(name, value);
    }

    const mqttBrokerUrl = new URL(validatedConfig.MQTT_BROKER_URL!);
    if (mqttBrokerUrl.protocol !== 'mqtts:') {
      throw new Error('MQTT_BROKER_URL must use mqtts:// in production');
    }
    if (mqttBrokerUrl.username || mqttBrokerUrl.password) {
      throw new Error('MQTT_BROKER_URL must not embed credentials');
    }
    if (
      !['', '/'].includes(mqttBrokerUrl.pathname) ||
      mqttBrokerUrl.search ||
      mqttBrokerUrl.hash
    ) {
      throw new Error('MQTT_BROKER_URL must contain only broker authority');
    }

    if (
      !/^[A-Za-z0-9][A-Za-z0-9_-]{0,47}$/.test(
        validatedConfig.MQTT_CLIENT_ID_PREFIX!,
      )
    ) {
      throw new Error('MQTT_CLIENT_ID_PREFIX contains unsafe characters');
    }

    assertProductionSecret('MQTT_PASSWORD', validatedConfig.MQTT_PASSWORD!);

    if (validatedConfig.MQTT_CA_FILE) {
      assertNonBlank('MQTT_CA_FILE', validatedConfig.MQTT_CA_FILE);
    }

    if (corsAllowedOrigins.length === 0) {
      throw new Error('CORS_ALLOWED_ORIGINS must not be empty in production');
    }

    if (corsAllowedOrigins.some((origin) => !origin.startsWith('https://'))) {
      throw new Error(
        'CORS_ALLOWED_ORIGINS must use HTTPS origins in production',
      );
    }

    if (!validatedConfig.METRICS_ACCESS_TOKEN) {
      throw new Error('METRICS_ACCESS_TOKEN is required in production');
    }

    assertNonBlank(
      'METRICS_ACCESS_TOKEN',
      validatedConfig.METRICS_ACCESS_TOKEN,
    );
    assertProductionSecret(
      'METRICS_ACCESS_TOKEN',
      validatedConfig.METRICS_ACCESS_TOKEN,
    );
  }

  return validatedConfig;
}
