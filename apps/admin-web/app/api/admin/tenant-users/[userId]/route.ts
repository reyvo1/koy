import { proxyBackend } from '@/lib/proxy';

/** PATCH/DELETE /api/admin/tenant-users/[userId] — tenant member management. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId } = await params;
  const body = await request.json().catch(() => null);
  return proxyBackend(
    (client) =>
      client.request(`/admin/tenant-users/${userId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    { unauthorized: 'Sesi admin tenant tidak valid.', unavailable: 'Gagal memperbarui anggota' },
  );
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId } = await params;
  return proxyBackend(
    (client) => client.request(`/admin/tenant-users/${userId}`, { method: 'DELETE' }),
    { unauthorized: 'Sesi admin tenant tidak valid.', unavailable: 'Gagal menghapus anggota' },
  );
}
