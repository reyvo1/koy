import { proxyBackend } from '@/lib/proxy';

/** GET /api/super/runtime-signals — recorded metric families and worker liveness contract. */
export async function GET() {
  return proxyBackend((client) => client.request('/admin/platform-runtime-signals'), {
    unauthorized: 'Sesi super admin tidak valid.',
    unavailable: 'Sinyal runtime tidak tersedia',
  });
}
