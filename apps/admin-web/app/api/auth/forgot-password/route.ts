import { NextResponse } from 'next/server';
import { backendFetch } from '../../../../lib/backend';
import { resolveTenantId } from '../../../../lib/tenant-resolver';

/**
 * Stateless password-reset request proxy.
 *
 * The response is **always** the same 202, whether or not the account exists. This is the
 * whole security property of a forgot-password endpoint: if it answered "no such user",
 * it would become an account-enumeration oracle for anonymous callers. The backend's own
 * response body is discarded rather than forwarded for the same reason.
 *
 * Delivery requires the notification runtime, which is off by default, so a successful
 * call here does not guarantee an email was sent. The UI must not claim otherwise.
 */

interface ForgotPasswordBody {
  email: string;
  tenantId: string;
}

const MAX_EMAIL_LENGTH = 320;
const MAX_TENANT_ID_LENGTH = 256;
const GENERIC_ACCEPTED = { accepted: true } as const;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  if (!isForgotPasswordBody(body)) {
    return NextResponse.json(
      { message: 'Email and tenant are required' },
      { status: 400 },
    );
  }

  const resolvedTenantId = await resolveTenantId(body.tenantId);
  if (!resolvedTenantId) {
    // Even an unresolvable tenant gets the generic acceptance. Returning 400 here would
    // reveal which tenant ids exist.
    return NextResponse.json(GENERIC_ACCEPTED, { status: 202 });
  }

  // Best-effort. A backend failure is intentionally not surfaced to the caller, because
  // distinguishing "backend down" from "account not found" leaks account existence.
  await backendFetch('/auth/forgot-password', {
    body: JSON.stringify({
      email: body.email.trim(),
      tenantId: resolvedTenantId,
    }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  }).catch(() => null);

  return NextResponse.json(GENERIC_ACCEPTED, { status: 202 });
}

function isForgotPasswordBody(value: unknown): value is ForgotPasswordBody {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const body = value as Record<string, unknown>;
  return (
    typeof body.email === 'string' &&
    body.email.trim().length > 0 &&
    body.email.length <= MAX_EMAIL_LENGTH &&
    typeof body.tenantId === 'string' &&
    body.tenantId.trim().length > 0 &&
    body.tenantId.length <= MAX_TENANT_ID_LENGTH
  );
}
