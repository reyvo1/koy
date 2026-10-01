import { proxyBackend } from '@/lib/proxy';

/**
 * GET /api/admin/telemetry-history — raw reading history, newest first.
 *
 * The historical screen only called `/api/admin/telemetry-chart`, which returns 1-hour
 * bucket aggregates. That is the right view for a trend line, but it cannot answer "what
 * exactly did this device report at 14:07, and did it report anything at all between two
 * samples" — a question that matters when a spike or a dropout is being investigated.
 * The backend has exposed `GET /devices/:deviceId/telemetry/history` (limit + cursor)
 * with no consumer, so this wires it up.
 *
 * `limit` and `cursor` are passed through rather than hardcoded, so a caller can page
 * through history instead of only ever seeing the first page. The backend owns the bound.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const deviceId = params.get('deviceId');
  if (!deviceId) {
    return Response.json({ message: 'deviceId wajib diisi' }, { status: 400 });
  }

  const query = new URLSearchParams();
  const limit = params.get('limit');
  const cursor = params.get('cursor');
  if (limit) query.set('limit', limit);
  if (cursor) query.set('cursor', cursor);
  const suffix = query.toString();

  return proxyBackend(
    (client) =>
      client.request(
        `/devices/${encodeURIComponent(deviceId)}/telemetry/history${suffix ? `?${suffix}` : ''}`,
      ),
    {
      unauthorized: 'Sesi tidak valid.',
      unavailable: 'Riwayat telemetri tidak dapat dimuat',
    },
  );
}
