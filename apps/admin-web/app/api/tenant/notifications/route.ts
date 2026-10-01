import { proxyBackend } from '@/lib/proxy';

/**
 * GET /api/tenant/notifications — the delivery log.
 *
 * The notification queue, worker and transports shipped with no HTTP surface, so this
 * proxy had nothing to forward to. The page that used to sit at /tenant/notifikasi
 * redirected to analytics findings, which is a different domain: an operator checking
 * whether an email went out was shown telemetry anomalies instead.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const query = new URLSearchParams();
  const status = params.get('status');
  const limit = params.get('limit');
  if (status) query.set('status', status);
  if (limit) query.set('limit', limit);
  const suffix = query.toString();
  return proxyBackend(
    (client) =>
      client.request(`/notifications${suffix ? `?${suffix}` : ''}`),
    { unauthorized: 'Sesi tidak valid.', unavailable: 'Notifikasi tidak dapat dimuat' },
  );
}
