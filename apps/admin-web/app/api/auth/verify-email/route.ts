import { NextResponse } from 'next/server';
import { backendFetch } from '../../../../lib/backend';

/**
 * Stateless email-verification proxy.
 *
 * The token normally arrives as a query parameter on a link in the verification email.
 * This accepts it either from the URL or from a POST body so the same route serves both
 * the link landing and an explicit resubmit.
 *
 * No session cookie is set. Verification proves control of an address; it does not sign
 * the user in, and must not leave an authenticated session behind.
 */

const MAX_TOKEN_LENGTH = 4096;
const OPAQUE_FAILURE = {
  message: 'This verification link is invalid or has expired.',
} as const;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const token = readToken(body);
  if (!token) {
    return NextResponse.json(OPAQUE_FAILURE, { status: 400 });
  }

  const backendResponse = await backendFetch('/auth/verify-email', {
    body: JSON.stringify({ token }),
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
    return NextResponse.json({ verified: true });
  }

  return NextResponse.json(OPAQUE_FAILURE, { status: 400 });
}

/** GET form: the link landing, where the token arrives in the query string. */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token');
  if (!token || token.length > MAX_TOKEN_LENGTH) {
    return NextResponse.json(OPAQUE_FAILURE, { status: 400 });
  }

  const backendResponse = await backendFetch('/auth/verify-email', {
    body: JSON.stringify({ token }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  }).catch(() => null);

  if (!backendResponse?.ok) {
    return NextResponse.json(OPAQUE_FAILURE, { status: 400 });
  }

  return NextResponse.json({ verified: true });
}

function readToken(body: unknown): string | null {
  if (!body || typeof body !== 'object') {
    return null;
  }
  const value = (body as Record<string, unknown>).token;
  if (typeof value !== 'string') {
    return null;
  }
  const token = value.trim();
  if (token.length === 0 || token.length > MAX_TOKEN_LENGTH) {
    return null;
  }
  return token;
}
