import { proxyBackend } from '@/lib/proxy';

/** GET /api/super/findings — analytics findings across tenants. */
export async function GET(request: Request) {
  const limit = new URL(request.url).searchParams.get('limit');
  const suffix = limit ? `?limit=${encodeURIComponent(limit)}` : '';
  return proxyBackend(
    (client) => client.request(`/admin/platform-findings${suffix}`),
    { unauthorized: 'Sesi super admin tidak valid.', unavailable: 'Temuan analitik tidak tersedia' },
  );
}
