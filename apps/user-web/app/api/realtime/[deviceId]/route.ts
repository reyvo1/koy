import { NextResponse } from 'next/server';
import { BackendRequestError } from '../../../../lib/backend';
import { clearSessionCookies, SessionBackendClient } from '../../../../lib/session';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ deviceId: string }> }) {
  const { deviceId } = await context.params;
  if (!deviceId || deviceId.length > 128) return NextResponse.json({ message: 'Identitas perangkat tidak valid.' }, { status: 400 });
  const client = await SessionBackendClient.create();
  try {
    const backend = await client.request(`/devices/${encodeURIComponent(deviceId)}/telemetry/stream?intervalSec=2`, {
      headers: { accept: 'text/event-stream' },
    });
    const response = new NextResponse(backend.body, {
      status: backend.status,
      headers: {
        'content-type': backend.headers.get('content-type') ?? 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
      },
    });
    client.applySessionUpdate(response);
    return response;
  } catch (error) {
    if (error instanceof BackendRequestError) {
      const response = NextResponse.json({ message: error.status === 403 ? 'Akun tidak memiliki izin VIEW pada perangkat.' : 'Stream realtime tidak tersedia.', code: error.code }, { status: error.status >= 500 ? 502 : error.status });
      if (error.status === 401) clearSessionCookies(response);
      return response;
    }
    return NextResponse.json({ message: 'IoT Platform API tidak dapat dihubungi.' }, { status: 503 });
  }
}
