import { proxyBackend } from '@/lib/proxy';

/** GET/POST /api/super/platform-devices — cross-tenant device provisioning. */
export async function GET(request: Request) {
  const tenantId = new URL(request.url).searchParams.get('tenantId');
  const suffix = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : '';
  return proxyBackend(
    (client) => client.request(`/admin/platform-devices${suffix}`),
    { unauthorized: 'Sesi super admin tidak valid.', unavailable: 'Daftar perangkat tidak tersedia' },
  );
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  return proxyBackend(
    (client) =>
      client.request('/admin/platform-devices', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    { unauthorized: 'Sesi super admin tidak valid.', unavailable: 'Gagal provisioning perangkat' },
  );
}
