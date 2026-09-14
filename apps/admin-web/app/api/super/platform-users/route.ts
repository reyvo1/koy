import { NextResponse } from 'next/server';
import {
  AdminSessionBackendClient,
  clearSessionCookies,
} from '@/lib/session';

/** GET /api/super/platform-users — all-tenant user directory proxy. */
export async function GET() {
  return proxyPlatformUsers(() => null);
}

/** POST /api/super/platform-users — create a user in any tenant. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  return proxyPlatformUsers(() => JSON.stringify(body));
}

async function proxyPlatformUsers(makeBody: () => string | null) {
  try {
    const client = await AdminSessionBackendClient.create();
    const init: RequestInit = {};
    const body = makeBody();
    if (body !== null) {
      init.body = body;
      init.headers = { 'content-type': 'application/json' };
      init.method = 'POST';
    }
    const response = await client.request('/admin/platform-users', init);
    const payload = await response.json();
    return NextResponse.json(payload, { status: response.status });
  } catch (cause) {
    const status =
      cause instanceof Error && 'status' in cause
        ? Number((cause as { status: number }).status)
        : 502;
    if (status === 401 || status === 403) {
      const response = NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Sesi super admin tidak valid.' } },
        { status: 401 },
      );
      clearSessionCookies(response);
      return response;
    }
    return NextResponse.json(
      {
        error: {
          code: 'PLATFORM_USERS_UNAVAILABLE',
          message:
            cause instanceof Error ? cause.message : 'operasi pengguna gagal',
        },
      },
      { status: status >= 500 ? 502 : status },
    );
  }
}
