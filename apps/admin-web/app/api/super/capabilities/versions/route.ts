import { proxyBackend } from '@/lib/proxy';

/** GET /api/super/capabilities/versions — observed per-key schema versions and drift. */
export async function GET(request: Request) {
  const search = new URL(request.url).search || '';
  return proxyBackend((client) => client.request(`/admin/platform-capabilities/versions${search}`), {
    unauthorized: 'Sesi super admin tidak valid.',
    unavailable: 'Drift versi capability tidak tersedia',
  });
}
