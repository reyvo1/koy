import { proxyBackend } from '@/lib/proxy';

/** PATCH /api/devices/[deviceId]/revoke — deactivate a device (tenant scope). */
export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ deviceId: string }> },
) {
  const { deviceId } = await params;
  return proxyBackend(
    (client) => client.request(`/devices/${deviceId}/revoke`, { method: 'PATCH' }),
    { unauthorized: 'Sesi tidak valid.', unavailable: 'Gagal menonaktifkan perangkat' },
  );
}
