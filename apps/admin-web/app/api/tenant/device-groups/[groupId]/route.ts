import { proxyBackend } from '@/lib/proxy';

/** DELETE /api/tenant/device-groups/[groupId]. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ groupId: string }> },
) {
  const { groupId } = await params;
  return proxyBackend(
    (client) => client.request(`/device-groups/${groupId}`, { method: 'DELETE' }),
    { unauthorized: 'Sesi tidak valid.', unavailable: 'Gagal menghapus grup' },
  );
}