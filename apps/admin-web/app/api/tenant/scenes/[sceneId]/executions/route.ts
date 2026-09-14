import { proxyBackend } from '@/lib/proxy';

/** GET /api/tenant/scenes/[sceneId]/executions — bounded execution history. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ sceneId: string }> },
) {
  const { sceneId } = await params;
  const limit = new URL(request.url).searchParams.get('limit') ?? '10';
  return proxyBackend(
    (client) =>
      client.request(`/scenes/${sceneId}/executions?limit=${encodeURIComponent(limit)}`),
    { unauthorized: 'Sesi tidak valid.', unavailable: 'Riwayat eksekusi tidak tersedia' },
  );
}