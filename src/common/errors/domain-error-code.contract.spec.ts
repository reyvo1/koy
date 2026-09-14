import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ERROR_CODES } from './error-code';

const TARGETS = [
  'src/auth/auth.service.ts',
  'src/auth/strategies/jwt.strategy.ts',
  'src/users/guards/tenant-context.guard.ts',
  'src/admin-operations/admin-role.guard.ts',
  'src/automation/automation-domain.validator.ts',
  'src/device/device.service.ts',
  'src/device/device-public.controller.ts',
  'src/device/guards/device-auth.guard.ts',
  'src/device/capability.service.ts',
  'src/device/capability.validator.ts',
  'src/device/command.service.ts',
  'src/telemetry/telemetry.service.ts',
  'src/telemetry/telemetry-aggregation.service.ts',
  'src/telemetry/mqtt.webhook.controller.ts',
  'src/mqtt/mqtt.service.ts',
  'src/mqtt/mqtt.webhook.controller.ts',
] as const;

const EXPECTED_CODE_KEYS = [
  'AuthUserAlreadyExists',
  'AuthVerificationTokenInvalid',
  'AuthCredentialsInvalid',
  'AuthRefreshTokenCompromised',
  'AuthRefreshTokenExpired',
  'AuthRefreshTokenInvalid',
  'AuthPasswordResetTokenInvalid',
  'AuthAccessTokenInvalid',
  'TenantContextInvalid',
  'TenantMembershipInvalid',
  'AdminOperationalSummaryAdminRequired',
  'AutomationContractInvalid',
  'DeviceNotFound',
  'DeviceProvisioningTokenInvalid',
  'DeviceCredentialsInvalid',
  'DeviceIdentityMismatch',
  'TenantUserNotFound',
  'CapabilityDeviceNotFound',
  'CapabilityAlreadyExists',
  'CapabilityValidationFailed',
  'CapabilityNotDefined',
  'CapabilityNotReportable',
  'CommandPayloadInvalid',
  'CommandIdempotencyKeyInvalid',
  'CommandDeviceUnavailable',
  'CommandIdempotencyConflict',
  'CommandCapabilityNotDefined',
  'CommandCapabilityNotWritable',
  'CommandPublishFailed',
  'CommandAcknowledgementInvalid',
  'TelemetryPayloadInvalid',
  'TelemetryEventIdRequired',
  'TelemetryPayloadTooLarge',
  'TelemetryDeviceUnauthorized',
  'TelemetryEventConflict',
  'TelemetryHistoryQueryInvalid',
  'TelemetryAggregationQueryInvalid',
  'MqttWebhookUnauthorized',
  'MqttTopicInvalid',
  'MqttPayloadInvalid',
  'MqttCommandIdInvalid',
] as const satisfies readonly (keyof typeof ERROR_CODES)[];

describe('Domain Error Code Contract', () => {
  const sources = TARGETS.map((target) => ({
    target,
    source: readFileSync(resolve(process.cwd(), target), 'utf8'),
  }));
  const combinedSource = sources.map(({ source }) => source).join('\n');

  it('keeps every domain code unique and convention compliant', () => {
    const codes = Object.values(ERROR_CODES);

    expect(new Set(codes).size).toBe(codes.length);

    for (const code of codes) {
      expect(code).toMatch(/^[A-Z][A-Z0-9_]{2,63}$/);
    }
  });

  it.each(TARGETS)(
    '%s does not construct generic Nest HTTP exceptions',
    (target) => {
      const source = sources.find(
        (candidate) => candidate.target === target,
      )!.source;

      expect(source).not.toMatch(
        /new\s+(BadRequestException|UnauthorizedException|ForbiddenException|NotFoundException|ConflictException)\s*\(/,
      );
    },
  );

  it.each(EXPECTED_CODE_KEYS)('uses stable domain code %s', (key) => {
    expect(combinedSource).toContain(`ERROR_CODES.${key}`);
  });
});
