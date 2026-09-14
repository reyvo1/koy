import { proxyBackend } from '@/lib/proxy';

/** PATCH/DELETE /api/tenant/schedules/[scheduleId] — enable/disable, delete. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ scheduleId: string }> },
) {
  const { scheduleId } = await params;
  const body = await request.json().catch(() => ({}));
  return proxyBackend(
    (client) =>
      client.request(`/schedules/${scheduleId}/enable`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    { unauthorized: 'Sesi tidak valid.', unavailable: 'Gagal mengubah jadwal' },
  );
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ scheduleId: string }> },
) {
  const { scheduleId } = await params;
  return proxyBackend(
    (client) => client.request(`/schedules/${scheduleId}`, { method: 'DELETE' }),
    { unauthorized: 'Sesi tidak valid.', unavailable: 'Gagal menghapus jadwal' },
  );
}
