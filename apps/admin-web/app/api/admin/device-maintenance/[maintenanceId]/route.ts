import { NextResponse } from 'next/server';
import {
  AdminSessionBackendClient,
  clearSessionCookies,
} from '@/lib/session';

/**
 * DELETE /api/admin/device-maintenance/[maintenanceId] — resolve a maintenance window.
 *
 * Split from the collection route so the id lives in the path rather than in a body field. A DELETE
 * that takes its target from a body is a shape that quietly becomes cacheable and replayable.
 */
type RouteContext = { params: Promise<{ maintenanceId: string }> };

export async function DELETE(request: Request, context: RouteContext) {
  const { maintenanceId } = await context.params;

  let resolutionNote = '';
  try {
    const raw = await request.text();
    if (raw.trim().length > 0) {
      const body = JSON.parse(raw) as { resolutionNote?: string };
      resolutionNote = body.resolutionNote ?? '';
    }
  } catch {
    return NextResponse.json(
      { error: { code: 'INVALID_BODY', message: 'Body harus berupa JSON.' } },
      { status: 400 },
    );
  }

  try {
    const client = await AdminSessionBackendClient.create();
    const response = await client.request(
      `/device-maintenance/${encodeURIComponent(maintenanceId)}`,
      {
        method: 'DELETE',
        body: JSON.stringify({ resolutionNote }),
        headers: { 'content-type': 'application/json' },
      },
    );
    const payload = await response.json();
    return NextResponse.json(payload, { status: response.status });
  } catch (cause) {
    const status =
      cause instanceof Error && 'status' in cause
        ? Number((cause as { status: number }).status)
        : 502;
    if (status === 401 || status === 403) {
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