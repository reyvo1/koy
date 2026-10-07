import { NextResponse } from 'next/server';
import {
  SessionBackendClient,
  clearSessionCookies,
} from '../../../../lib/session';
import { BackendRequestError, readBackendJson } from '../../../../lib/backend';
type Context = { params: Promise<{ deviceId: string }> };
async function forward(path: string, init: RequestInit) {
  const client = await SessionBackendClient.create();
  try {
    const result = await readBackendJson<unknown>(
      await client.request(path, init),
    );
    const response = NextResponse.json(result);
    client.applySessionUpdate(response);
    return response;
  } catch (error) {
    const status = error instanceof BackendRequestError ? error.status : 503;
    const response = NextResponse.json(
      { message: 'Live view tidak tersedia.' },
      { status },
    );
    if (status === 401) clearSessionCookies(response);
    return response;
  }
}
export async function POST(request: Request, { params }: Context) {
  const { deviceId } = await params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body.sdp !== 'string' || body.sdp.length > 65536)
    return NextResponse.json({ message: 'SDP tidak valid.' }, { status: 400 });
  return forward(
    `/camera-network/devices/${encodeURIComponent(deviceId)}/playback`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sdp: body.sdp }),
    },
  );
}
export async function DELETE(request: Request, { params }: Context) {
  const { deviceId } = await params;
  const id = new URL(request.url).searchParams.get('sessionId') ?? '';
  if (!/^[0-9a-f-]{36}$/.test(id))
    return NextResponse.json({ message: 'Sesi tidak valid.' }, { status: 400 });
  return forward(
    `/camera-network/devices/${encodeURIComponent(deviceId)}/playback/${id}`,
    { method: 'DELETE' },
  );
}
