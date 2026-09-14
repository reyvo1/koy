import { proxyBackend } from '@/lib/proxy';

/** GET/POST /api/tenant/device-groups — grup perangkat (ADR-005). */
export async function GET() {
  return proxyBackend((client) => client.request('/device-groups'), {
    unauthorized: 'Sesi tidak valid.',
    unavailable: 'Grup perangkat tidak tersedia',
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  return proxyBackend(
    (client) =>
      client.request('/device-groups', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    { unauthorized: 'Sesi tidak valid.', unavailable: 'Gagal membuat grup' },
  );
}