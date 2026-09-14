export const ERROR_CODES = {
  ValidationFailed: 'VALIDATION_FAILED',
  BadRequest: 'BAD_REQUEST',
  Unauthorized: 'UNAUTHORIZED',
  Forbidden: 'FORBIDDEN',
  NotFound: 'NOT_FOUND',
  Conflict: 'CONFLICT',
  UnprocessableEntity: 'UNPROCESSABLE_ENTITY',
  TooManyRequests: 'TOO_MANY_REQUESTS',
  ServiceUnavailable: 'SERVICE_UNAVAILABLE',
  InternalError: 'INTERNAL_ERROR',
  HttpError: 'HTTP_ERROR',
  MetricsAccessDenied: 'METRICS_ACCESS_DENIED',
  AuthRateLimitExceeded: 'AUTH_RATE_LIMIT_EXCEEDED',
  RateLimitUnavailable: 'RATE_LIMIT_UNAVAILABLE',

  AuthUserAlreadyExists: 'AUTH_USER_ALREADY_EXISTS',
  AuthVerificationTokenInvalid: 'AUTH_VERIFICATION_TOKEN_INVALID',
  AuthCredentialsInvalid: 'AUTH_CREDENTIALS_INVALID',
  AuthAccessTokenInvalid: 'AUTH_ACCESS_TOKEN_INVALID',
  AuthRefreshTokenCompromised: 'AUTH_REFRESH_TOKEN_COMPROMISED',
  AuthRefreshTokenExpired: 'AUTH_REFRESH_TOKEN_EXPIRED',
  AuthRefreshTokenInvalid: 'AUTH_REFRESH_TOKEN_INVALID',
  AuthPasswordResetTokenInvalid: 'AUTH_PASSWORD_RESET_TOKEN_INVALID',
  AuthAccountLocked: 'AUTH_ACCOUNT_LOCKED',

  TenantContextInvalid: 'TENANT_CONTEXT_INVALID',
  TenantMembershipInvalid: 'TENANT_MEMBERSHIP_INVALID',
  AdminOperationalSummaryAdminRequired:
    'ADMIN_OPERATIONAL_SUMMARY_ADMIN_REQUIRED',

  PlatformAdminRequired: 'PLATFORM_ADMIN_REQUIRED',
  RbacPermissionDenied: 'RBAC_PERMISSION_DENIED',

  DashboardInvalidInput: 'DASHBOARD_PERSISTENCE_INVALID_INPUT',
  DashboardMembershipInvalid: 'DASHBOARD_MEMBERSHIP_INVALID',
  DashboardNotFound: 'DASHBOARD_NOT_FOUND',
  DashboardRevisionConflict: 'DASHBOARD_REVISION_CONFLICT',
  DashboardBindingTargetInvalid: 'DASHBOARD_BINDING_TARGET_INVALID',
  DashboardSharedAdminRequired: 'DASHBOARD_SHARED_ADMIN_REQUIRED',
  DashboardWidgetResolutionInvalid: 'DASHBOARD_WIDGET_RESOLUTION_INVALID',
  DashboardWidgetNotFound: 'DASHBOARD_WIDGET_NOT_FOUND',

  AutomationContractInvalid: 'AUTOMATION_CONTRACT_INVALID',

  DeviceNotFound: 'DEVICE_NOT_FOUND',
  DeviceProvisioningTokenInvalid: 'DEVICE_PROVISIONING_TOKEN_INVALID',
  DeviceCredentialsInvalid: 'DEVICE_CREDENTIALS_INVALID',
  DeviceIdentityMismatch: 'DEVICE_IDENTITY_MISMATCH',
  TenantUserNotFound: 'TENANT_USER_NOT_FOUND',

  CapabilityDeviceNotFound: 'CAPABILITY_DEVICE_NOT_FOUND',
  CapabilityAlreadyExists: 'CAPABILITY_ALREADY_EXISTS',
  CapabilityValidationFailed: 'CAPABILITY_VALIDATION_FAILED',
  CapabilityNotDefined: 'CAPABILITY_NOT_DEFINED',
  CapabilityNotReportable: 'CAPABILITY_NOT_REPORTABLE',
  CapabilityNotWritable: 'CAPABILITY_NOT_WRITABLE',

  TelemetryPayloadInvalid: 'TELEMETRY_PAYLOAD_INVALID',
  TelemetryEventIdRequired: 'TELEMETRY_EVENT_ID_REQUIRED',
  TelemetryPayloadTooLarge: 'TELEMETRY_PAYLOAD_TOO_LARGE',
  TelemetryDeviceUnauthorized: 'TELEMETRY_DEVICE_UNAUTHORIZED',
  TelemetryEventConflict: 'TELEMETRY_EVENT_CONFLICT',
  TelemetryHistoryQueryInvalid: 'TELEMETRY_HISTORY_QUERY_INVALID',
  TelemetryAggregationQueryInvalid: 'TELEMETRY_AGGREGATION_QUERY_INVALID',

  CommandPayloadInvalid: 'COMMAND_PAYLOAD_INVALID',
  CommandIdempotencyKeyInvalid: 'COMMAND_IDEMPOTENCY_KEY_INVALID',
  CommandDeviceUnavailable: 'COMMAND_DEVICE_UNAVAILABLE',
  CommandIdempotencyConflict: 'COMMAND_IDEMPOTENCY_CONFLICT',
  CommandCapabilityNotDefined: 'COMMAND_CAPABILITY_NOT_DEFINED',
  CommandCapabilityNotWritable: 'COMMAND_CAPABILITY_NOT_WRITABLE',
  CommandPublishFailed: 'COMMAND_PUBLISH_FAILED',
  CommandAcknowledgementInvalid: 'COMMAND_ACKNOWLEDGEMENT_INVALID',
  CommandNotFound: 'COMMAND_NOT_FOUND',

  MqttWebhookUnauthorized: 'MQTT_WEBHOOK_UNAUTHORIZED',
  MqttTopicInvalid: 'MQTT_TOPIC_INVALID',
  MqttPayloadInvalid: 'MQTT_PAYLOAD_INVALID',
  MqttCommandIdInvalid: 'MQTT_COMMAND_ID_INVALID',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

const STATUS_CODE_MAP: Readonly<Record<number, ErrorCode>> = {
  400: ERROR_CODES.BadRequest,
  401: ERROR_CODES.Unauthorized,
  403: ERROR_CODES.Forbidden,
  404: ERROR_CODES.NotFound,
  409: ERROR_CODES.Conflict,
  422: ERROR_CODES.UnprocessableEntity,
  429: ERROR_CODES.TooManyRequests,
  500: ERROR_CODES.InternalError,
  503: ERROR_CODES.ServiceUnavailable,
};

export function errorCodeForStatus(statusCode: number): ErrorCode {
  return STATUS_CODE_MAP[statusCode] ?? ERROR_CODES.HttpError;
}
