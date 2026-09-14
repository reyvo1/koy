import { NextResponse } from 'next/server';
import {
  AdminSessionBackendClient,
  clearSessionCookies,
} from '@/lib/session';

/** GET /api/super/users — bounded user directory proxy. */
export async function GET() {
  try {
    const client = await AdminSessionBackendClient.create();
    const response = await client.request('/admin/users');
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
          code: 'USERS_UNAVAILABLE',
          message:
            cause instanceof Error ? cause.message : 'daftar pengguna tidak tersedia',
        },
      },
      { status: status >= 500 ? 502 : status },
    );
  }
}
