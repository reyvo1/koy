import { NextResponse } from 'next/server';
import {
  AdminSessionBackendClient,
  clearSessionCookies,
  finalizeAdminSessionResponse,
} from '@/lib/session';

/**
 * GET /api/admin/devices — proxies the tenant device list.
 */
export async function GET() {
  try {
    const client = await AdminSessionBackendClient.create();
    const response = await client.request('/devices?limit=100');
    const payload = await response.json();
    const next = NextResponse.json(payload, { status: response.status });
    return finalizeAdminSessionResponse(client, next, response.status);
  } catch (cause) {
    const status =
      cause instanceof Error && 'status' in cause
        ? Number((cause as { status: number }).status)
        : 502;
    if (status === 401) {
      const response = NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Sesi admin tidak valid.' } },
        { status: 401 },
      );
      clearSessionCookies(response);
      return response;
    }
    return NextResponse.json(
      {
        error: {
          code: 'DEVICES_UNAVAILABLE',
          message:
            cause instanceof Error
              ? cause.message
              : 'daftar perangkat tidak tersedia',
        },
      },
      { status: status >= 500 ? 502 : status },
    );
  }
}
