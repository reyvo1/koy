import { proxyBackend } from '@/lib/proxy';

/** GET /api/super/rbac/audit — recent RBAC decisions. */
export async function GET(request: Request) {
  const search = new URL(request.url).search || '';
  return proxyBackend((client) => client.request(`/admin/platform-rbac/audit${search}`), {
    unauthorized: 'Sesi super admin tidak valid.',
    unavailable: 'Audit RBAC tidak tersedia',
  });
}
