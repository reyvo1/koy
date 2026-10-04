import { NextResponse } from 'next/server';
import {
  AdminSessionBackendClient,
  clearSessionCookies,
  finalizeAdminSessionResponse,
} from '@/lib/session';

/**
 * GET /api/admin/device-log?deviceId= — proxies the backend's per-device command log.
 *
 * Until now the technician page's log tab said no endpoint existed and sent the operator to
 * Realtime. That was true of the log and false of the underlying data: `DeviceCommand` records every
 * command the platform issued and whether the device acknowledged it. This route is the thin
 * pass-through, following the same shape as `device-health` — no client-side caching, because a
 * cached command verdict is exactly the staleness the surface exists to avoid.
 */
export async function GET(request: Request) {
  const deviceId = new URL(request.url).searchParams.get('deviceId');
  if (!deviceId) {
    return NextResponse.json(
      { error: { code: 'MISSING_ID', message: 'deviceId wajib' } },
      { status: 400 },
    );
  }

  const limit = new URL(request.url).searchParams.get('limit');

  try {
    const client = await AdminSessionBackendClient.create();
    const query = limit ? `?limit=${encodeURIComponent(limit)}` : '';
    const response = await client.request(
      `/devices/${encodeURIComponent(deviceId)}/command-log${query}`,
    );
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
      { error: { code: 'DEVICE_LOG_UNAVAILABLE', message: String(cause) } },
      { status: status >= 500 ? 502 : status },
    );
  }
}