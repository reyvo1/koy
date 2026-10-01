import { proxyBackend } from '@/lib/proxy';

/**
 * DELETE /api/tenant/api-keys/[keyId] — revoke one of the tenant's own keys.
 *
 * The backend already scoped revocation to the caller's tenant
 * (`admin-api-keys.controller.ts` passes the tenant id into the revoke check), so this
 * proxy does not re-derive ownership; a key belonging to another tenant returns 404.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ keyId: string }> },
) {
  const { keyId } = await params;
  return proxyBackend(
    (client) =>
      client.request(`/admin/api-keys/${encodeURIComponent(keyId)}`, {
        method: 'DELETE',
      }),
    { unauthorized: 'Sesi tidak valid.', unavailable: 'Gagal mencabut API key' },
  );
}
