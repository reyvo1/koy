import { proxyBackend } from '@/lib/proxy';

/** GET/DELETE /api/tenant/dashboards/[dashboardId] — detail + delete. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ dashboardId: string }> },
) {
  const { dashboardId } = await params;
  return proxyBackend(
    (client) => client.request(`/dashboards/${dashboardId}/resolution`),
    { unauthorized: 'Sesi tidak valid.', unavailable: 'Workspace tidak tersedia' },
  );
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ dashboardId: string }> },
) {
  const { dashboardId } = await params;
  return proxyBackend(
    (client) => client.request(`/dashboards/${dashboardId}`, { method: 'DELETE' }),
    { unauthorized: 'Sesi tidak valid.', unavailable: 'Gagal menghapus workspace' },
  );
}