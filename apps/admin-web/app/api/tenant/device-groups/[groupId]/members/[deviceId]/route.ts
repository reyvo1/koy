import { proxyBackend } from '@/lib/proxy';

/** DELETE /api/tenant/device-groups/[groupId]/members/[deviceId]. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ groupId: string; deviceId: string }> },
) {
  const { groupId, deviceId } = await params;
  return proxyBackend(
    (client) =>
      client.request(`/device-groups/${groupId}/members/${deviceId}`, { method: 'DELETE' }),
    { unauthorized: 'Sesi tidak valid.', unavailable: 'Gagal mengeluarkan anggota' },
  );
}