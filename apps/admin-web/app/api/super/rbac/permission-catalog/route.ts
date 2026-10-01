import { proxyBackend } from '@/lib/proxy';

/** GET /api/super/rbac/permission-catalog — the permission set the API actually enforces. */
export async function GET() {
  return proxyBackend((client) => client.request('/admin/platform-rbac/permission-catalog'), {
    unauthorized: 'Sesi super admin tidak valid.',
    unavailable: 'Katalog permission tidak tersedia',
  });
}
