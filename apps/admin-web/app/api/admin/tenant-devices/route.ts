import { proxyBackend } from '@/lib/proxy';

/** GET/POST /api/admin/tenant-devices — active-tenant device provisioning. */
export async function GET() {
  return proxyBackend(
    (client) => client.request('/admin/tenant-devices'),
    { unauthorized: 'Sesi admin tenant tidak valid.', unavailable: 'Daftar perangkat tidak tersedia' },
  );
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  return proxyBackend(
    (client) =>
      client.request('/admin/tenant-devices', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    { unauthorized: 'Sesi admin tenant tidak valid.', unavailable: 'Gagal provisioning perangkat' },
  );
}
