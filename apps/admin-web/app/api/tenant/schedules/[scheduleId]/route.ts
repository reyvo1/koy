import { proxyBackend } from '@/lib/proxy';

/** PATCH/DELETE /api/tenant/schedules/[scheduleId] — enable/disable, delete. */
/**
 * Toggles a schedule's enabled flag. Despite the PATCH verb, this is not a general update:
 * the backend exposes no PATCH /schedules/:id, only POST /schedules/:id/enable, so this route
 * adapts the UI's PATCH onto that endpoint and forwards the body unchanged. The backend
 * rejects anything that is not a boolean `enabled`, so a caller expecting a general update
 * fails loudly rather than silently writing nothing.
 */
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
