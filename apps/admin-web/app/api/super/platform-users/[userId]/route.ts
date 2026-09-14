import { proxyBackend } from '@/lib/proxy';

/** PATCH/DELETE /api/super/platform-users/[userId] — platform user management. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId } = await params;
  const body = await request.json().catch(() => null);
  return proxyBackend(
    (client) =>
      client.request(`/admin/platform-users/${userId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    { unauthorized: 'Sesi super admin tidak valid.', unavailable: 'Gagal memperbarui pengguna' },
  );
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId } = await params;
  const tenantId = new URL(request.url).searchParams.get('tenantId') ?? '';
  return proxyBackend(
    (client) =>
      client.request(
        `/admin/platform-users/${userId}?tenantId=${encodeURIComponent(tenantId)}`,
        { method: 'DELETE' },
      ),
    { unauthorized: 'Sesi super admin tidak valid.', unavailable: 'Gagal menghapus pengguna' },
  );
}
