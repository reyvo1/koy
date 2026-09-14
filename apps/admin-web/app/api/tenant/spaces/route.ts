import { proxyBackend } from '@/lib/proxy';

/** GET/POST /api/tenant/spaces — hierarchy list + create node (Modul 7). */
export async function GET() {
  return proxyBackend((client) => client.request('/spaces'), {
    unauthorized: 'Sesi tidak valid.',
    unavailable: 'Struktur lokasi tidak tersedia',
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  return proxyBackend(
    (client) =>
      client.request('/spaces', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    { unauthorized: 'Sesi tidak valid.', unavailable: 'Gagal membuat lokasi' },
  );
}
