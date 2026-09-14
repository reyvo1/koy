export const MAX_MOBILE_TOKEN_LENGTH = 16 * 1024;
export const MAX_MOBILE_TENANT_ID_LENGTH = 256;
export const MAX_MOBILE_EMAIL_LENGTH = 320;
export const MAX_MOBILE_PASSWORD_LENGTH = 4096;

export interface MobileTokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface MobileSessionRecord extends MobileTokenPair {
  tenantId: string;
}

export interface MobileSessionSummary {
  authenticated: true;
  tenantId: string;
}

export interface MobileLoginCredentials {
  email: string;
  password: string;
  tenantId: string;
}

export class MobileSessionValidationError extends Error {
  constructor() {
    super('Mobile session data is invalid.');
    this.name = 'MobileSessionValidationError';
  }
}

export function normalizeLoginCredentials(
  value: MobileLoginCredentials,
): MobileLoginCredentials {
  const email = value.email.trim();
  const tenantId = value.tenantId.trim();

  if (
    email.length === 0 ||
    email.length > MAX_MOBILE_EMAIL_LENGTH ||
    value.password.length === 0 ||
    value.password.length > MAX_MOBILE_PASSWORD_LENGTH ||
    tenantId.length === 0 ||
    tenantId.length > MAX_MOBILE_TENANT_ID_LENGTH
  ) {
    throw new MobileSessionValidationError();
  }

  return {
    email,
    password: value.password,
    tenantId,
  };
}

export function parseMobileTokenPair(value: unknown): MobileTokenPair {
  if (!isRecord(value)) {
    throw new MobileSessionValidationError();
  }

  if (
    !isBoundedNonEmptyString(value.accessToken, MAX_MOBILE_TOKEN_LENGTH) ||
    !isBoundedNonEmptyString(value.refreshToken, MAX_MOBILE_TOKEN_LENGTH)
  ) {
    throw new MobileSessionValidationError();
  }

  return {
    accessToken: value.accessToken,
    refreshToken: value.refreshToken,
  };
}

export function parseMobileSessionRecord(value: unknown): MobileSessionRecord {
  if (!isRecord(value)) {
    throw new MobileSessionValidationError();
  }

  const tokens = parseMobileTokenPair(value);
  if (!isBoundedNonEmptyString(value.tenantId, MAX_MOBILE_TENANT_ID_LENGTH)) {
    throw new MobileSessionValidationError();
  }

  return {
    ...tokens,
    tenantId: value.tenantId,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isBoundedNonEmptyString(
  value: unknown,
  maximumLength: number,
): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maximumLength
  );
}
