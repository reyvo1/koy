import { proxyBackend } from '@/lib/proxy';

/** GET/POST /api/tenant/automations — automation rule CRUD (Modul 14). */
export async function GET() {
  return proxyBackend((client) => client.request('/automations'), {
    unauthorized: 'Sesi tidak valid.',
    unavailable: 'Otomasi tidak tersedia',
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  return proxyBackend(
    (client) =>
      client.request('/automations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    { unauthorized: 'Sesi tidak valid.', unavailable: 'Gagal membuat otomasi' },
  );
}