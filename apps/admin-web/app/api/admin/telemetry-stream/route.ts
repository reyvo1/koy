import { NextResponse } from 'next/server';
import {
  AdminSessionBackendClient,
  clearSessionCookies,
  finalizeAdminSessionResponse,
} from '@/lib/session';

/**
 * GET /api/admin/telemetry-stream?deviceId=&intervalSec= — SSE proxy.
 * Streams backend SSE frames to the browser session (ADR-002).
 */

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const deviceId = new URL(request.url).searchParams.get('deviceId');
  if (!deviceId) {
    return NextResponse.json(
      { error: { code: 'MISSING_ID', message: 'deviceId wajib' } },
      { status: 400 },
    );
  }

  let backendResponse: Response;
  let client: AdminSessionBackendClient;
  try {
    client = await AdminSessionBackendClient.create();
    backendResponse = await client.request(
      `/devices/${deviceId}/telemetry/stream`,
    );
  } catch (cause) {
    const status =
      cause instanceof Error && 'status' in cause
        ? Number((cause as { status: number }).status)
        : 502;
    const response = NextResponse.json(
      { error: { code: status === 401 ? 'UNAUTHORIZED' : 'STREAM_UNAVAILABLE', message: String(cause) } },
      { status: status >= 500 ? 502 : status },
    );
    if (status === 401) clearSessionCookies(response);
    return response;
  }

  if (!backendResponse.ok) {
    const payload = await backendResponse.json().catch(() => null);
    const next = NextResponse.json(
      payload ?? {
        error: { code: 'STREAM_NOT_READY', message: 'stream belum tersedia' },
      },
      { status: backendResponse.status },
    );
    return finalizeAdminSessionResponse(client, next, backendResponse.status);
  }
  if (!backendResponse.body) {
    const next = NextResponse.json(
      { error: { code: 'STREAM_NOT_READY', message: 'stream belum tersedia' } },
      { status: 503 },
    );
    return finalizeAdminSessionResponse(client, next, backendResponse.status);
  }

  const { readable, writable } = new TransformStream();
  backendResponse.body!.pipeTo(writable).catch(() => undefined);

  const response = new NextResponse(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
  return finalizeAdminSessionResponse(client, response, backendResponse.status);
}
