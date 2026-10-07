import { NextResponse } from 'next/server';
import { proxyBackend } from '@/lib/proxy';
type Context = { params: Promise<{ deviceId: string }> };
export async function POST(request: Request, { params }: Context) {
  const { deviceId } = await params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body.sdp !== 'string' || body.sdp.length > 65536)
    return NextResponse.json({ message: 'SDP tidak valid.' }, { status: 400 });
  return proxyBackend(
    (client) =>
      client.request(
        `/camera-network/devices/${encodeURIComponent(deviceId)}/playback`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sdp: body.sdp }),
        },
      ),
    {
      unauthorized: 'Sesi tidak valid.',
      unavailable: 'Live view tidak tersedia.',
    },
  );
}
export async function DELETE(request: Request, { params }: Context) {
  const { deviceId } = await params;
  const id = new URL(request.url).searchParams.get('sessionId') ?? '';
  if (!/^[0-9a-f-]{36}$/.test(id))
    return NextResponse.json({ message: 'Sesi tidak valid.' }, { status: 400 });
  return proxyBackend(
    (client) =>
      client.request(
        `/camera-network/devices/${encodeURIComponent(deviceId)}/playback/${id}`,
        { method: 'DELETE' },
      ),
    { unauthorized: 'Sesi tidak valid.', unavailable: 'Sesi gagal ditutup.' },
  );
}
