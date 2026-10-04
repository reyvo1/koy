import { NextResponse } from 'next/server';
import {
  AdminSessionBackendClient,
  clearSessionCookies,
  finalizeAdminSessionResponse,
} from '@/lib/session';

/**
 * GET /api/admin/device-health?deviceId= — proxies the backend's per-device health check.
 *
 * This endpoint existed and was reachable, but no UI called it. The technician page and
 * the device detail page both re-derived "healthy" from `lastHeartbeatAt` in the browser,
 * which duplicates the backend's five-minute rule in a second place. Any change to that
 * threshold would silently apply to the API and not to the console, so the console could
 * disagree with the system it reports on.
 *
 * The UI should use this and stop re-deriving the verdict. This route is the thin
 * pass-through that lets it do so; it deliberately adds no client-side caching, because a
 * cached health verdict is exactly the staleness this endpoint exists to avoid.
 */
export async function GET(request: Request) {
  const deviceId = new URL(request.url).searchParams.get('deviceId');
  if (!deviceId) {
    return NextResponse.json(
      { error: { code: 'MISSING_ID', message: 'deviceId wajib' } },
      { status: 400 },
    );
  }

  try {
    const client = await AdminSessionBackendClient.create();
    const response = await client.request(
      `/devices/${encodeURIComponent(deviceId)}/health`,
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
      { error: { code: 'DEVICE_HEALTH_UNAVAILABLE', message: String(cause) } },
      { status: status >= 500 ? 502 : status },
    );
  }
}
