import { proxyBackend } from '@/lib/proxy';

/**
 * GET /api/super/noc/acknowledgements — the duty log for a tenant.
 *
 * Read alongside the findings rather than instead of them: an acknowledged finding stays in the
 * alert list with its actor, so this is context, not a filter.
 *
 * `tenantId` is named, and deliberately so. This console lists findings across every tenant, so
 * the tenant being triaged is a fact about the findings rather than about the operator's session —
 * and the backend's session-derived tenant was the platform's own, which made the duty log read
 * back a tenant nobody was looking at. It grants nothing by itself: the backend resolves the
 * finding and the log inside the tenant named.
 */
export async function GET(request: Request) {
  const tenantId = new URL(request.url).searchParams.get('tenantId') ?? '';
  return proxyBackend(
    (client) =>
      client.request(
        `/admin/platform-noc/acknowledgements?tenantId=${encodeURIComponent(tenantId)}`,
      ),
    {
      unauthorized: 'Sesi super admin tidak valid.',
      unavailable: 'Catatan tugas NOC tidak dapat diambil',
    },
  );
}