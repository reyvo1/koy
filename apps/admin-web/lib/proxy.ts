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
    if (status === 401 || status === 403) {
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
