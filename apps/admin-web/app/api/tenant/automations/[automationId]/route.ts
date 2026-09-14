import { proxyBackend } from '@/lib/proxy';

/** DELETE /api/tenant/automations/[automationId]. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ automationId: string }> },
) {
  const { automationId } = await params;
  return proxyBackend(
    (client) => client.request(`/automations/${automationId}`, { method: 'DELETE' }),
    { unauthorized: 'Sesi tidak valid.', unavailable: 'Gagal menghapus otomasi' },
  );
}