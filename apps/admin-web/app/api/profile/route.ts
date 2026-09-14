import { proxyBackend } from '@/lib/proxy';

/** GET/PATCH /api/profile — user profile read + name update (/users/profile). */
export async function GET() {
  return proxyBackend((client) => client.request('/users/profile'), {
    unauthorized: 'Sesi tidak valid.',
    unavailable: 'Profil tidak tersedia',
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  return proxyBackend(
    (client) =>
      client.request('/users/profile', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    { unauthorized: 'Sesi tidak valid.', unavailable: 'Gagal menyimpan profil' },
  );
}