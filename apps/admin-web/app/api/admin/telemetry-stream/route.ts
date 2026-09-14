import { NextResponse } from 'next/server';
import { AdminSessionBackendClient } from '@/lib/session';

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
  try {
    const client = await AdminSessionBackendClient.create();
    backendResponse = await client.request(
      `/devices/${deviceId}/telemetry/stream`,
    );
  } catch (cause) {
    return NextResponse.json(
      { error: { code: 'STREAM_UNAVAILABLE', message: String(cause) } },
      { status: 502 },
    );
  }

  if (!backendResponse.ok || !backendResponse.body) {
    // Fail-closed: no stream, UI falls back to polling.
    return NextResponse.json(
      { error: { code: 'STREAM_NOT_READY', message: 'stream belum tersedia' } },
      { status: 503 },
    );
  }

  const { readable, writable } = new TransformStream();
  backendResponse.body!.pipeTo(writable).catch(() => undefined);

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
