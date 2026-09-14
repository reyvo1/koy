import { proxyBackend } from '@/lib/proxy';

/** PATCH /api/super/platform-devices/[deviceId]/revoke — deactivate any device. */
export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ deviceId: string }> },
) {
  const { deviceId } = await params;
  return proxyBackend(
    (client) => client.request(`/admin/platform-devices/${deviceId}/revoke`, { method: 'PATCH' }),
    { unauthorized: 'Sesi super admin tidak valid.', unavailable: 'Gagal menonaktifkan perangkat' },
  );
}
