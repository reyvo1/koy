import { NextResponse } from 'next/server';
import { backendFetch } from '../../../../lib/backend';

/**
 * Stateless password-reset completion proxy.
 *
 * The token comes from an emailed link, so it is validated here for shape and length only;
 * its validity is decided by the backend. A rejected token and a malformed token return
 * the same opaque message, so this endpoint cannot be used to probe token material.
 *
 * No session cookie is set: resetting a password must not authenticate the caller. The
 * user signs in with the new password.
 */

interface ResetPasswordBody {
  token: string;
  password: string;
}

const MAX_TOKEN_LENGTH = 4096;
const MAX_PASSWORD_LENGTH = 4096;
const MIN_PASSWORD_LENGTH = 8;
const OPAQUE_FAILURE = {
  message: 'This reset link is invalid or has expired. Request a new one.',
} as const;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  if (!isResetPasswordBody(body)) {
    return NextResponse.json(OPAQUE_FAILURE, { status: 400 });
  }

  const backendResponse = await backendFetch('/auth/reset-password', {
    body: JSON.stringify({
      token: body.token,
      password: body.password,
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
    return NextResponse.json({ reset: true });
  }

  return NextResponse.json(OPAQUE_FAILURE, { status: 400 });
}

function isResetPasswordBody(value: unknown): value is ResetPasswordBody {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const body = value as Record<string, unknown>;
  return (
    typeof body.token === 'string' &&
    body.token.trim().length > 0 &&
    body.token.length <= MAX_TOKEN_LENGTH &&
    typeof body.password === 'string' &&
    body.password.length >= MIN_PASSWORD_LENGTH &&
    body.password.length <= MAX_PASSWORD_LENGTH
  );
}
