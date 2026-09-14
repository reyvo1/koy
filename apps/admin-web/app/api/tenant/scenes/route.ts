import { proxyBackend } from '@/lib/proxy';

/** GET/POST /api/tenant/scenes — list + create scenes (Modul 12). */
export async function GET() {
  return proxyBackend((client) => client.request('/scenes'), {
    unauthorized: 'Sesi tidak valid.',
    unavailable: 'Daftar scene tidak tersedia',
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  return proxyBackend(
    (client) =>
      client.request('/scenes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    { unauthorized: 'Sesi tidak valid.', unavailable: 'Gagal membuat scene' },
  );
}
