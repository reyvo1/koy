import { proxyBackend } from '@/lib/proxy';

/** GET /api/super/rbac/custom-roles — custom roles and the members holding them. */
export async function GET(request: Request) {
  const search = new URL(request.url).search || '';
  return proxyBackend((client) => client.request(`/admin/platform-rbac/custom-roles${search}`), {
    unauthorized: 'Sesi super admin tidak valid.',
    unavailable: 'Daftar custom role tidak tersedia',
  });
}
