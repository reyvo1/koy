import { proxyBackend } from '@/lib/proxy';
export async function GET() {
  return proxyBackend((client) => client.request('/device-maintenance/plans'), {
    unauthorized: 'Sesi tidak valid.',
    unavailable: 'Jadwal gagal dibaca.',
  });
}
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  return proxyBackend(
    (client) =>
      client.request('/device-maintenance/plans', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    {
      unauthorized: 'Sesi tidak valid.',
      unavailable: 'Jadwal gagal disimpan.',
    },
  );
}
