import { proxyBackend } from '@/lib/proxy';

/** DELETE /api/tenant/spaces/[spaceId] — delete a space node. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ spaceId: string }> },
) {
  const { spaceId } = await params;
  return proxyBackend(
    (client) => client.request(`/spaces/${spaceId}`, { method: 'DELETE' }),
    { unauthorized: 'Sesi tidak valid.', unavailable: 'Gagal menghapus lokasi' },
  );
}
