import { proxyBackend } from '@/lib/proxy';

/** GET /api/super/capabilities — capability registry across tenants. */
export async function GET() {
  return proxyBackend((client) => client.request('/admin/platform-capabilities'), {
    unauthorized: 'Sesi super admin tidak valid.',
    unavailable: 'Registry capability tidak tersedia',
  });
}