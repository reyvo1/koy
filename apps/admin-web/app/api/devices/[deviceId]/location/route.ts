import { NextResponse } from 'next/server';
import { proxyBackend } from '@/lib/proxy';
type Context = { params: Promise<{ deviceId: string }> };
export async function GET(_request: Request, context: Context) {
  const { deviceId } = await context.params;
  return proxyBackend(
    (client) =>
      client.request(
        `/devices/${encodeURIComponent(deviceId)}/location?limit=50`,
      ),
    { unauthorized: 'Sesi tidak valid.', unavailable: 'Lokasi gagal dibaca.' },
  );
}
export async function POST(request: Request, context: Context) {
  const { deviceId } = await context.params;
  const body = await request.json().catch(() => null);
  if (
    !body ||
    typeof body.latitude !== 'number' ||
    typeof body.longitude !== 'number' ||
    !Number.isFinite(body.latitude) ||
    !Number.isFinite(body.longitude) ||
    body.tenantId !== undefined
  )
    return NextResponse.json(
      { message: 'Koordinat tidak valid.' },
      { status: 400 },
    );
  return proxyBackend(
    (client) =>
      client.request(`/devices/${encodeURIComponent(deviceId)}/location`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    {
      unauthorized: 'Sesi tidak valid.',
      unavailable: 'Lokasi gagal disimpan.',
    },
  );
}
