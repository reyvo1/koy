import { NextResponse } from 'next/server';
import {
  AdminSessionBackendClient,
  clearSessionCookies,
} from '@/lib/session';

/** GET /api/admin/directory/tenants — bounded tenant directory proxy. */
export async function GET() {
  try {
    const client = await AdminSessionBackendClient.create();
    const response = await client.request('/admin/tenants');
    const payload = await response.json();
    return NextResponse.json(payload, { status: response.status });
  } catch (cause) {
    const status =
      cause instanceof Error && 'status' in cause
        ? Number((cause as { status: number }).status)
        : 502;
    if (status === 401 || status === 403) {
      const response = NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Sesi tidak valid.' } },
        { status: 401 },
      );
      clearSessionCookies(response);
      return response;
    }
    return NextResponse.json(
      {
        error: {
          code: 'TENANTS_UNAVAILABLE',
          message:
            cause instanceof Error ? cause.message : 'direktori tenant tidak tersedia',
        },
      },
      { status: status >= 500 ? 502 : status },
    );
  }
}
