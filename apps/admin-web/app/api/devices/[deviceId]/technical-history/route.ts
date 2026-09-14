import { proxyBackend } from '@/lib/proxy';

/** GET — VIEW-authorized technical/update/findings evidence for Device Detail. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ deviceId: string }> },
) {
  const { deviceId } = await params;
  return proxyBackend(
    (client) =>
      client.request(
        `/devices/${encodeURIComponent(deviceId)}/technical-history`,
      ),
    {
      unauthorized: 'Sesi admin tidak valid.',
      unavailable: 'Riwayat teknis perangkat tidak tersedia',
    },
  );
}
