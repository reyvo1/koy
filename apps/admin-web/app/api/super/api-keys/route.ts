import { proxyBackend } from '@/lib/proxy';

/** GET/POST /api/super/api-keys — cross-tenant API key management (platform). */
export async function GET() {
  return proxyBackend((client) => client.request('/admin/platform-api-keys'), {
    unauthorized: 'Sesi super admin tidak valid.',
    unavailable: 'Daftar API key tidak tersedia',
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  return proxyBackend(
    (client) =>
      client.request('/admin/platform-api-keys', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    { unauthorized: 'Sesi super admin tidak valid.', unavailable: 'Gagal membuat API key' },
  );
}
