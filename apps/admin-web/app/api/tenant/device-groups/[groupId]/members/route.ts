import { proxyBackend } from '@/lib/proxy';

/** POST /api/tenant/device-groups/[groupId]/members — tambah anggota. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ groupId: string }> },
) {
  const { groupId } = await params;
  const body = await request.json().catch(() => null);
  return proxyBackend(
    (client) =>
      client.request(`/device-groups/${groupId}/members`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    { unauthorized: 'Sesi tidak valid.', unavailable: 'Gagal menambah anggota' },
  );
}