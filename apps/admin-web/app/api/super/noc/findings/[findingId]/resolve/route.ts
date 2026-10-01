import { proxyBackend } from '@/lib/proxy';

/**
 * DELETE /api/super/noc/findings/:findingId/resolve — close an incident.
 *
 * DELETE, matching the backend's `@Delete('platform-noc/findings/:findingId/resolve')`. A POST
 * proxy here answers 404 against the running API, which reads as a broken route rather than as a
 * mismatched verb, and the console would silently never be able to close anything.
 *
 * No body, and therefore no content-type. The backend takes only the path parameter, the query's
 * tenant and the session; a body here could only be a second way to name the actor, which is the
 * one thing an on-call record must not permit.
 *
 * Refused when the finding was never acknowledged, and that refusal is the point: it is what stops
 * "resolved" from being reachable by whoever happens to close the ticket.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ findingId: string }> },
) {
  const { findingId } = await params;
  const tenantId = new URL(request.url).searchParams.get('tenantId') ?? '';
  return proxyBackend(
    (client) =>
      client.request(
        `/admin/platform-noc/findings/${encodeURIComponent(findingId)}/resolve?tenantId=${encodeURIComponent(tenantId)}`,
        { method: 'DELETE' },
      ),
    {
      unauthorized: 'Sesi super admin tidak valid.',
      unavailable: 'Insiden tidak dapat ditutup',
    },
  );
}