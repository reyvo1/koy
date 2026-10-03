import { NextRequest, NextResponse } from 'next/server';
import { BackendRequestError, readBackendJson } from '../../../lib/backend';
import { clearSessionCookies, SessionBackendClient } from '../../../lib/session';

export async function GET(request: NextRequest) {
  const client = await SessionBackendClient.create();
  const raw = Number.parseInt(request.nextUrl.searchParams.get('limit') ?? '50', 10);
  const limit = Number.isFinite(raw) ? Math.min(Math.max(raw, 1), 100) : 50;
  try {
    const backend = await client.request(`/analytics/alerts/accessible?limit=${limit}`);
    const payload = await readBackendJson<unknown>(backend);
    const response = NextResponse.json(payload);
    client.applySessionUpdate(response);
    return response;
  } catch (error) {
    if (error instanceof BackendRequestError) {
      const response = NextResponse.json(
        { message: error.status === 401 ? 'Sesi user tidak tersedia.' : 'Alert tidak dapat dimuat.', code: error.code, requestId: error.requestId },
        { status: error.status >= 500 ? 502 : error.status },
      );
      if (error.status === 401) clearSessionCookies(response);
      return response;
    }
    return NextResponse.json({ message: 'IoT Platform API tidak dapat dihubungi.' }, { status: 503 });
  }
}
