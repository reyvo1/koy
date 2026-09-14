import { proxyBackend } from '@/lib/proxy';

/** POST /api/tenant/automations/[automationId]/activate. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ automationId: string }> },
) {
  const { automationId } = await params;
  const body = await request.json().catch(() => null);
  return proxyBackend(
    (client) =>
      client.request(`/automations/${encodeURIComponent(automationId)}/activate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    { unauthorized: 'Sesi tidak valid.', unavailable: 'Gagal mengaktifkan otomasi' },
  );
}
