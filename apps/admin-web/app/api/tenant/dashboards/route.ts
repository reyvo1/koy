import { proxyBackend } from '@/lib/proxy';

/** GET /api/tenant/dashboards — personal + shared dashboards (Modul 18). */
export async function GET(request: Request) {
  const limit = new URL(request.url).searchParams.get('limit') ?? '50';
  return proxyBackend(
    (client) => client.request(`/dashboards?limit=${encodeURIComponent(limit)}`),
    { unauthorized: 'Sesi tidak valid.', unavailable: 'Workspace tidak tersedia' },
  );
}