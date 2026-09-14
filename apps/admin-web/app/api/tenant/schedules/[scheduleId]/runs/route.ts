import { proxyBackend } from '@/lib/proxy';

/** GET /api/tenant/schedules/[scheduleId]/runs — bounded run history. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ scheduleId: string }> },
) {
  const { scheduleId } = await params;
  const limit = new URL(request.url).searchParams.get('limit') ?? '10';
  return proxyBackend(
    (client) =>
      client.request(`/schedules/${scheduleId}/runs?limit=${encodeURIComponent(limit)}`),
    { unauthorized: 'Sesi tidak valid.', unavailable: 'Riwayat run tidak tersedia' },
  );
}