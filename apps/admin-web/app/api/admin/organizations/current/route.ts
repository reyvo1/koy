import { proxyBackend } from '@/lib/proxy';

/**
 * GET /api/admin/organizations/current — resolve organization membership from the authenticated
 * tenant. The client never supplies a tenant id or organization id, so this read cannot be used
 * to probe another tenant's organization membership.
 */
export async function GET() {
  return proxyBackend(
    (client) => client.request('/organizations/current'),
    { unauthorized: 'Sesi tidak valid.', unavailable: 'Gagal memuat organisasi tenant' },
  );
}
