import { proxyBackend } from '@/lib/proxy';

/** DELETE /api/tenant/integrations/:integrationId — remove one tenant-owned registry row. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ integrationId: string }> },
) {
  const { integrationId } = await params;
  return proxyBackend(
    (client) =>
      client.request(`/admin/integrations/${encodeURIComponent(integrationId)}`, {
        method: 'DELETE',
      }),
    { unauthorized: 'Sesi tidak valid.', unavailable: 'Gagal menghapus integrasi' },
  );
}
