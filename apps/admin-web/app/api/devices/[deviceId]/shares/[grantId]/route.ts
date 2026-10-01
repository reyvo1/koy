import { proxyBackend } from '@/lib/proxy';

/** DELETE /api/devices/[deviceId]/shares/[grantId] — revoke one grant. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ deviceId: string; grantId: string }> },
) {
  const { deviceId, grantId } = await params;
  return proxyBackend(
    (client) => client.request(`/devices/${deviceId}/shares/${grantId}`, { method: 'DELETE' }),
    { unauthorized: 'Sesi tidak valid.', unavailable: 'Gagal mencabut berbagi perangkat' },
  );
}
