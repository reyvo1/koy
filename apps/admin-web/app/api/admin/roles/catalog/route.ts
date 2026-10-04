import { proxyBackend } from '@/lib/proxy';

/** GET /api/admin/roles/catalog — exact permission strings enforced by the backend. */
export async function GET() {
  return proxyBackend(
    (client) => client.request('/admin/roles/catalog'),
    { unauthorized: 'Sesi admin tenant tidak valid.', unavailable: 'Katalog permission tidak tersedia' },
  );
}
