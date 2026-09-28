import { NextResponse } from 'next/server';
import { backendFetch } from '../../../../lib/backend';
import { resolveTenantId } from '../../../../lib/tenant-resolver';

/**
 * Stateless self-service registration proxy.
 *
 * Intentionally does not set any session cookie: registering is not signing in. The
 * caller must still authenticate normally after verifying their email, so a compromised
 * registration request cannot leave an authenticated session behind.
 *
 * The backend response is reduced to a coarse outcome on purpose. A signup form must not
 * become a tenant-enumeration oracle — telling an anonymous caller "this tenant does not
 * exist" discloses which tenants are provisioned on the platform.
 */

interface RegisterBody {
  email: string;
  password: string;
  tenantId: string;
}

const MAX_EMAIL_LENGTH = 320;
const MAX_PASSWORD_LENGTH = 4096;
const MAX_TENANT_ID_LENGTH = 256;
const MIN_PASSWORD_LENGTH = 8;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  if (!isRegisterBody(body)) {
    return NextResponse.json(
      { message: 'Email, password (min 8 characters), and tenant are required' },
      { status: 400 },
    );
  }

  const resolvedTenantId = await resolveTenantId(body.tenantId);
  if (!resolvedTenantId) {
    // Same opaque message as a rejected registration, so an anonymous caller cannot
    // probe which tenant ids exist.
    return NextResponse.json(
      { message: 'Registration could not be completed with the supplied details' },
      { status: 400 },
    );
  }

  const backendResponse = await backendFetch('/auth/register', {
    body: JSON.stringify({
      email: body.email.trim(),
      password: body.password,
      tenantId: resolvedTenantId,
    }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  }).catch(() => null);

  if (!backendResponse) {
    return NextResponse.json(
      { message: 'The IoT Platform API is currently unreachable' },
      { status: 503 },
    );
  }

  if (backendResponse.ok) {
    return NextResponse.json({ registered: true }, { status: 201 });
  }

  if (backendResponse.status === 429) {
    return NextResponse.json(
      { message: 'Too many attempts. Please wait before trying again.' },
      { status: 429 },
    );
  }

  // Duplicate email, unknown tenant, or any backend validation failure collapse into one
  // opaque outcome on purpose; see the note above.
  return NextResponse.json(
    { message: 'Registration could not be completed with the supplied details' },
    { status: 400 },
  );
}

function isRegisterBody(value: unknown): value is RegisterBody {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const body = value as Record<string, unknown>;
  return (
    typeof body.email === 'string' &&
    body.email.trim().length > 0 &&
    body.email.length <= MAX_EMAIL_LENGTH &&
    typeof body.password === 'string' &&
    body.password.length >= MIN_PASSWORD_LENGTH &&
    body.password.length <= MAX_PASSWORD_LENGTH &&
    typeof body.tenantId === 'string' &&
    body.tenantId.trim().length > 0 &&
    body.tenantId.length <= MAX_TENANT_ID_LENGTH
  );
}
