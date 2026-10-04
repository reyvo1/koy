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
  DeviceMaintenanceNotFound: 'DEVICE_MAINTENANCE_NOT_FOUND',
  DeviceMaintenanceConflict: 'DEVICE_MAINTENANCE_CONFLICT',
  DeviceProvisioningTokenInvalid: 'DEVICE_PROVISIONING_TOKEN_INVALID',
  DeviceCredentialsInvalid: 'DEVICE_CREDENTIALS_INVALID',
  DeviceIdentityMismatch: 'DEVICE_IDENTITY_MISMATCH',
  TenantUserNotFound: 'TENANT_USER_NOT_FOUND',

  // Device sharing (Module 18). These mirror the `code` that DeviceShareService attaches
  // to the plain Error it throws; the REST controller translates them into domain
  // exceptions so a client mistake is never reported as a 500.
  ShareIdentityInvalid: 'SHARE_IDENTITY_INVALID',
  ShareExpiryInvalid: 'SHARE_EXPIRY_INVALID',
  ShareSelfGrantInvalid: 'SHARE_SELF_GRANT_INVALID',
  ShareDeviceNotFound: 'SHARE_DEVICE_NOT_FOUND',
  ShareActiveLimitExceeded: 'SHARE_ACTIVE_LIMIT_EXCEEDED',
  ShareGrantNotActive: 'SHARE_GRANT_NOT_ACTIVE',

  // Organization & branch (Module 19). These mirror the `code` that OrganizationService
  // attaches to the plain Error it throws; the REST controller translates them into domain
  // exceptions so an ownership or conflict problem is never reported as a 500.
  OrgAlreadyExists: 'ORG_ALREADY_EXISTS',
  OrgNotOwner: 'ORG_NOT_OWNER',
  OrgNotAMember: 'ORG_NOT_A_MEMBER',
  OrgNotFound: 'ORG_NOT_FOUND',
  OrgBranchTenantConflict: 'ORG_BRANCH_TENANT_CONFLICT',
  OrgBranchTenantNotFound: 'ORG_BRANCH_TENANT_NOT_FOUND',
  OrgBranchAlreadyMember: 'ORG_BRANCH_ALREADY_MEMBER',
  OrgBranchNotFound: 'ORG_BRANCH_NOT_FOUND',
  OrgPrimaryBranchRemovalForbidden: 'ORG_PRIMARY_BRANCH_REMOVAL_FORBIDDEN',

  // Firmware & OTA (Module 15). These mirror the `code` that OtaRolloutRepository and
  // OtaDomainValidator attach to the plain Error / OtaDomainError they throw; the REST
  // controller translates them into domain exceptions so an operator mistake is never
  // reported as a 500.
  OtaVersionInvalid: 'OTA_VERSION_INVALID',
  OtaUrlInvalid: 'OTA_URL_INVALID',
  OtaSha256Invalid: 'OTA_SHA256_INVALID',
  OtaSizeInvalid: 'OTA_SIZE_INVALID',
  OtaModelsInvalid: 'OTA_MODELS_INVALID',
  OtaTargetsInvalid: 'OTA_TARGETS_INVALID',
  OtaStatusTransitionInvalid: 'OTA_STATUS_TRANSITION_INVALID',
  OtaInvalidIdentity: 'OTA_INVALID_IDENTITY',
  OtaRolloutNotFound: 'OTA_ROLLOUT_NOT_FOUND',
  OtaTransitionConflict: 'OTA_TRANSITION_CONFLICT',
  OtaRolloutNotInProgress: 'OTA_ROLLOUT_NOT_IN_PROGRESS',
  OtaTargetsNotInTenant: 'OTA_TARGETS_NOT_IN_TENANT',
  OtaVersionAlreadyExists: 'OTA_VERSION_ALREADY_EXISTS',

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
  // Billing: the tenant is not entitled to what it asked for. 402, not 403 — the request was
  // correct, the account simply has no right to it.
  BillingDeviceQuotaExceeded: 'BILLING_DEVICE_QUOTA_EXCEEDED',
  // Wave 8. 409, not 502: the request was well-formed and the platform acted on it, but the payment
  // provider refused or was unreachable. The invoice row exists and is FAILED, so this is a conflict
  // with a real recorded attempt, not a transient gateway fault to retry blindly.
  BillingPaymentUnavailable: 'BILLING_PAYMENT_UNAVAILABLE',
  // 404. A webhook arrived for an order id this tenant has no invoice for. Distinct from 403 on
  // purpose: a signed webhook for an unknown order is a genuine discrepancy worth surfacing.
  BillingInvoiceNotFound: 'BILLING_INVOICE_NOT_FOUND',
  // 404. An integration id that is not in this tenant, or does not exist. Named so that a caller can
  // distinguish "no such integration" from "the provider is down" — the previous registry made both
  // look identical by ignoring the row count of its update.
  IntegrationNotFound: 'INTEGRATION_NOT_FOUND',
  // 400. A tenant with no active subscription has nothing to bill. Named so the billing cycle can
  // refuse before an invoice row exists, rather than leaving a PENDING invoice nobody agreed to.
  BillingPlanNotFound: 'BILLING_PLAN_NOT_FOUND',
  // 401. A payment notification whose signature does not verify. Its own code so a forgery attempt
  // is countable in logs rather than being folded into a generic auth failure.
  BillingSignatureInvalid: 'BILLING_SIGNATURE_INVALID',
  // 409. A genuine notification reporting a different gross amount than the invoice. A discrepancy
  // for a human; a 200 here would bury it.
  BillingAmountMismatch: 'BILLING_AMOUNT_MISMATCH',
  // 409. A period was billed again after its invoice was already settled or failed. Refusing is the
  // point: a retry that re-charges a settled period is how a tenant gets billed twice.
  BillingInvoiceAlreadyFinal: 'BILLING_INVOICE_ALREADY_FINAL',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

const STATUS_CODE_MAP: Readonly<Record<number, ErrorCode>> = {
  400: ERROR_CODES.BadRequest,
  401: ERROR_CODES.Unauthorized,
  403: ERROR_CODES.Forbidden,
  404: ERROR_CODES.NotFound,
  402: ERROR_CODES.BillingDeviceQuotaExceeded,
  409: ERROR_CODES.Conflict,
  422: ERROR_CODES.UnprocessableEntity,
  429: ERROR_CODES.TooManyRequests,
  500: ERROR_CODES.InternalError,
  503: ERROR_CODES.ServiceUnavailable,
};

export function errorCodeForStatus(statusCode: number): ErrorCode {
  return STATUS_CODE_MAP[statusCode] ?? ERROR_CODES.HttpError;
}
