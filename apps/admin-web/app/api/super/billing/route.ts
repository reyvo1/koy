import { proxyBackend } from '@/lib/proxy';

/** GET /api/super/billing — tenant subscriptions, plans, usage proxy. */
export async function GET() {
  return proxyBackend(
    (client) => client.request('/admin/billing/subscriptions'),
    { unauthorized: 'Sesi super admin tidak valid.', unavailable: 'Data billing tidak tersedia' },
  );
}
