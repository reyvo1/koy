import { NextResponse } from 'next/server';
import {
  AdminSessionBackendClient,
  clearSessionCookies,
  finalizeAdminSessionResponse,
} from '@/lib/session';

/**
 * GET  /api/admin/device-maintenance     — list this tenant's maintenance windows
 * POST /api/admin/device-maintenance     — open a window (`{ deviceId, reason }`)
 *
 * Resolving is a separate route at `[maintenanceId]`, because a DELETE that takes its target from a
 * body is a shape that quietly becomes cacheable and replayable.
 *
 * The pass-through the technician tab needs. It was not here before: the page said, truthfully
 * for its day, that maintenance had no persistent domain, and pointed elsewhere. Now the domain
 * exists, and a tab that still says so would be telling an operator something false.
 *
 * The tenant is carried by the admin session, never by a body field, so this route cannot be used
 * to address another tenant's windows.
 */

async function forward(
  request: Request,
  path: string,
  init: RequestInit,
): Promise<NextResponse> {
  try {
    const client = await AdminSessionBackendClient.create();
    const response = await client.request(path, init);
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
      { error: { code: 'DEVICE_MAINTENANCE_UNAVAILABLE', message: String(cause) } },
      { status: status >= 500 ? 502 : status },
    );
  }
}

export async function GET(request: Request) {
  const query = new URL(request.url).search;
  return forward(request, `/device-maintenance${query}`, { method: 'GET' });
}

export async function POST(request: Request) {
  let body: { deviceId?: string; reason?: string };
  try {
    body = (await request.json()) as { deviceId?: string; reason?: string };
  } catch {
    return NextResponse.json(
      { error: { code: 'INVALID_BODY', message: 'Body harus berupa JSON.' } },
      { status: 400 },
    );
  }

  const deviceId = body.deviceId?.trim();
  if (!deviceId) {
    return NextResponse.json(
      { error: { code: 'MISSING_DEVICE_ID', message: 'deviceId wajib' } },
      { status: 400 },
    );
  }

  // The reason is forwarded but not defaulted here. A window opened without one tells the next
  // technician nothing, and the backend refuses it — this route exists to pass that refusal on,
  // not to invent a reason so the request succeeds.
  return forward(
    request,
    `/device-maintenance/devices/${encodeURIComponent(deviceId)}`,
    {
      method: 'POST',
      body: JSON.stringify({ reason: body.reason ?? '' }),
      headers: { 'content-type': 'application/json' },
    },
  );
}
