import { proxyBackend } from '@/lib/proxy';

/** PATCH/DELETE /api/super/tenants/[tenantId] — rename/delete (platform). */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ tenantId: string }> },
) {
  const { tenantId } = await params;
  const body = await request.json().catch(() => null);
  return proxyBackend(
    (client) =>
      client.request(`/admin/tenants/${tenantId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    { unauthorized: 'Sesi super admin tidak valid.', unavailable: 'Gagal mengubah tenant' },
  );
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ tenantId: string }> },
) {
  const { tenantId } = await params;
  return proxyBackend(
    (client) => client.request(`/admin/tenants/${tenantId}`, { method: 'DELETE' }),
    { unauthorized: 'Sesi super admin tidak valid.', unavailable: 'Gagal menghapus tenant' },
  );
}
