import { NextResponse } from 'next/server';
import { proxyBackend } from '@/lib/proxy';
export async function POST(
  request: Request,
  { params }: { params: Promise<{ integrationId: string }> },
) {
  const { integrationId } = await params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body.deviceId !== 'string')
    return NextResponse.json({ message: 'Pilih perangkat.' }, { status: 400 });
  return proxyBackend(
    (client) =>
      client.request(
        `/admin/integrations/${encodeURIComponent(integrationId)}/sync`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ deviceId: body.deviceId }),
        },
      ),
    {
      unauthorized: 'Sesi tidak valid.',
      unavailable: 'Operasi provider gagal.',
    },
  );
}
