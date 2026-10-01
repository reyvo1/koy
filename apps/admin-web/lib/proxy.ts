import { NextResponse } from 'next/server';
import {
  AdminSessionBackendClient,
  clearSessionCookies,
} from '@/lib/session';

export async function proxyBackend(
  handler: (client: AdminSessionBackendClient) => Promise<Response>,
  messages: { unauthorized: string; unavailable: string },
): Promise<NextResponse> {
  try {
    const client = await AdminSessionBackendClient.create();
    const response = await handler(client);
    const payload = await response.json();
    return NextResponse.json(payload, { status: response.status });
  } catch (cause) {
    const status =
      cause instanceof Error && 'status' in cause
        ? Number((cause as { status: number }).status)
        : 502;
    // A 401 and a 403 are different facts and must not share a remedy.
    //
    // 401 means the session is bad, and clearing the cookie is the correct response. 403 means
    // the session is fine and this one request is not allowed — a tenant admin reading an
    // organization that is not theirs, a MEMBER attempting a write. Answering a 403 by
    // deleting the session signs the operator out of the console for being told they lack a
    // permission they already hold, and it rewrites the reason so the console renders
    // "UNAUTHORIZED" and bounces them to the login screen instead of showing the refusal.
    if (status === 401) {
      const response = NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: messages.unauthorized } },
        { status: 401 },
      );
      clearSessionCookies(response);
      return response;
    }
    return NextResponse.json(
      {
        error: {
          code: 'PROXY_UNAVAILABLE',
          message:
            cause instanceof Error ? cause.message : messages.unavailable,
        },
      },
      { status: status >= 500 ? 502 : status },
    );
  }
}

export function backendError(cause: unknown): {
  status: number;
  message: string;
} {
  const status =
    cause instanceof Error && 'status' in cause
      ? Number((cause as { status: number }).status)
      : 502;
  return {
    status: status >= 500 ? 502 : status,
    message: cause instanceof Error ? cause.message : 'Operasi gagal',
  };
}
