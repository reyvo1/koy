import { proxyBackend } from '@/lib/proxy';

/** POST /api/tenant/automations/[automationId]/deactivate. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ automationId: string }> },
) {
  const { automationId } = await params;
  const body = await request.json().catch(() => null);
  return proxyBackend(
    (client) =>
      client.request(`/automations/${encodeURIComponent(automationId)}/deactivate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    { unauthorized: 'Sesi tidak valid.', unavailable: 'Gagal menonaktifkan otomasi' },
  );
}
