import { NextResponse } from 'next/server';
import { backendFetch, readBackendJson } from '../../../../lib/backend';
import { setSessionCookies } from '../../../../lib/session';

interface LoginBody {
  email: string;
  password: string;
  tenantId: string;
}

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  if (!isLoginBody(body)) {
    return NextResponse.json(
      { message: 'Email, password, and tenant are required' },
      { status: 400 },
    );
  }

  const normalizedBody = {
    email: body.email.trim(),
    password: body.password,
    tenantId: body.tenantId.trim(),
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

  const tokens = await readBackendJson<TokenPair>(backendResponse);
  const response = NextResponse.json({ authenticated: true });
  setSessionCookies(response, tokens, normalizedBody.tenantId);
  return response;
}

function isLoginBody(value: unknown): value is LoginBody {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const body = value as Record<string, unknown>;
  return (
    typeof body.email === 'string' &&
    body.email.trim().length > 0 &&
    typeof body.password === 'string' &&
    body.password.length > 0 &&
    typeof body.tenantId === 'string' &&
    body.tenantId.trim().length > 0
  );
}
