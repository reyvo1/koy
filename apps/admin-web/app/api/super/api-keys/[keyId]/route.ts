import { proxyBackend } from '@/lib/proxy';

/** DELETE /api/super/api-keys/[keyId] — revoke any API key (platform). */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ keyId: string }> },
) {
  const { keyId } = await params;
  return proxyBackend(
    (client) => client.request(`/admin/platform-api-keys/${keyId}`, { method: 'DELETE' }),
    { unauthorized: 'Sesi super admin tidak valid.', unavailable: 'Gagal mencabut API key' },
  );
}
