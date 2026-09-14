import { proxyBackend } from '@/lib/proxy';

/** GET/POST /api/tenant/schedules — list + create schedules (Modul 11). */
export async function GET() {
  return proxyBackend((client) => client.request('/schedules'), {
    unauthorized: 'Sesi tidak valid.',
    unavailable: 'Daftar jadwal tidak tersedia',
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  return proxyBackend(
    (client) =>
      client.request('/schedules', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    { unauthorized: 'Sesi tidak valid.', unavailable: 'Gagal membuat jadwal' },
  );
}
