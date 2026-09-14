import { proxyBackend } from '@/lib/proxy';

/** GET/POST /api/super/tenants — tenant directory + creation (platform). */
export async function GET() {
  return proxyBackend((client) => client.request('/admin/tenants'), {
    unauthorized: 'Sesi super admin tidak valid.',
    unavailable: 'Daftar tenant tidak tersedia',
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  return proxyBackend(
    (client) =>
      client.request('/admin/tenants', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    { unauthorized: 'Sesi super admin tidak valid.', unavailable: 'Gagal membuat tenant' },
  );
}
