import { NextResponse } from 'next/server';
import { backendFetch, readBackendJson } from '../../../../lib/backend';
import { parseTokenPair, setSessionCookies, setRoleCookie } from '../../../../lib/session';
import { resolveTenantId } from '../../../../lib/tenant-resolver';

interface LoginBody {
  email: string;
  password: string;
  tenantId: string;
}

const MAX_EMAIL_LENGTH = 320;
const MAX_PASSWORD_LENGTH = 4096;
const MAX_TENANT_ID_LENGTH = 256;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  if (!isLoginBody(body)) {
    return NextResponse.json(
      { message: 'Email, password, and tenant are required' },
      { status: 400 },
    );
  }

  const resolvedTenantId = await resolveTenantId(body.tenantId);
  if (!resolvedTenantId) {
    return NextResponse.json(
      { message: 'Unable to sign in with the supplied credentials' },
      { status: 401 },
    );
  }

  const normalizedBody = {
    email: body.email.trim(),
    password: body.password,
    tenantId: resolvedTenantId,
  };

  const backendResponse = await backendFetch('/auth/login', {
    body: JSON.stringify(normalizedBody),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  }).catch(() => null);

  if (!backendResponse) {
    return NextResponse.json(
      { message: 'The IoT Platform API is currently unreachable' },
      { status: 503 },
    );
  }

  if (!backendResponse.ok) {
    return NextResponse.json(
      { message: 'Unable to sign in with the supplied credentials' },
      { status: backendResponse.status === 429 ? 429 : 401 },
    );
  }

  try {
    const backendJson =
      await readBackendJson<Record<string, unknown>>(backendResponse);
    const tokens = parseTokenPair(backendJson);
    const role =
      typeof backendJson.role === 'string' ? backendJson.role : 'MEMBER';

    if (role !== 'ADMIN' && role !== 'PLATFORM_ADMIN') {
      // Admin Web is intentionally restricted to administrative memberships.
      // Revoke the just-issued backend session best-effort so a rejected admin
      // login does not leave an unused refresh-token family alive.
      await backendFetch('/auth/logout', {
        method: 'POST',
        headers: { authorization: `Bearer ${tokens.accessToken}` },
      }).catch(() => null);
      return NextResponse.json(
        { message: 'Akun ini tidak memiliki akses ke konsol administrator' },
        { status: 403 },
      );
    }

    const response = NextResponse.json({ authenticated: true, role });
    setSessionCookies(response, tokens, normalizedBody.tenantId);
    setRoleCookie(response, role);
    return response;
  } catch {
    return NextResponse.json(
      { message: 'The authentication service returned an invalid response' },
      { status: 502 },
    );
  }
}

function isLoginBody(value: unknown): value is LoginBody {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const body = value as Record<string, unknown>;
  return (
    typeof body.email === 'string' &&
    body.email.trim().length > 0 &&
    body.email.length <= MAX_EMAIL_LENGTH &&
    typeof body.password === 'string' &&
    body.password.length > 0 &&
    body.password.length <= MAX_PASSWORD_LENGTH &&
    typeof body.tenantId === 'string' &&
    body.tenantId.trim().length > 0 &&
    body.tenantId.length <= MAX_TENANT_ID_LENGTH
  );
}
