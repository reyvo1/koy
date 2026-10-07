import { proxyBackend } from '@/lib/proxy';
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ planId: string }> },
) {
  const { planId } = await params;
  const body = await request.json().catch(() => null);
  return proxyBackend(
    (client) =>
      client.request(
        `/device-maintenance/plans/${encodeURIComponent(planId)}`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        },
      ),
    { unauthorized: 'Sesi tidak valid.', unavailable: 'Jadwal gagal diubah.' },
  );
}
