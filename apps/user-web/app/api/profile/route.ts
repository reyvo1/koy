import { NextRequest, NextResponse } from 'next/server';
import { BackendRequestError, readBackendJson } from '../../../lib/backend';
import { clearSessionCookies, SessionBackendClient } from '../../../lib/session';

async function handle(method: 'GET' | 'POST', request?: NextRequest) {
  const client = await SessionBackendClient.create();
  try {
    const init: RequestInit = { method };
    if (method === 'POST') {
      const body = await request?.json().catch(() => null);
      const name = typeof body?.name === 'string' ? body.name.trim() : '';
      if (!name || name.length > 120) return NextResponse.json({ message: 'Nama wajib diisi dan maksimal 120 karakter.' }, { status: 400 });
      init.headers = { 'content-type': 'application/json' };
      init.body = JSON.stringify({ name });
    }
    const backend = await client.request('/users/profile', init);
    const payload = await readBackendJson<unknown>(backend);
    const response = NextResponse.json(payload);
    client.applySessionUpdate(response);
    return response;
  } catch (error) {
    if (error instanceof BackendRequestError) {
      const response = NextResponse.json(
        { message: error.status === 401 ? 'Sesi user tidak tersedia.' : 'Profil tidak dapat diproses.', code: error.code, requestId: error.requestId },
        { status: error.status >= 500 ? 502 : error.status },
      );
      if (error.status === 401) clearSessionCookies(response);
      return response;
    }
    return NextResponse.json({ message: 'IoT Platform API tidak dapat dihubungi.' }, { status: 503 });
  }
}

export async function GET() { return handle('GET'); }
export async function POST(request: NextRequest) { return handle('POST', request); }
