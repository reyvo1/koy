import { proxyBackend } from '@/lib/proxy';

/**
 * GET /api/super/mqtt/management — what the broker itself reports.
 *
 * Under `/api/super/`, so it inherits the platform session and lands behind the same guard as the
 * rest of the observability surface.
 *
 * The broker's own credentials are never involved here. This route forwards to the platform API,
 * which reads the dashboard credentials from configuration and returns only a snapshot; the broker
 * token does not exist on this side of the hop. Proxying the dashboard directly would have been
 * less code and would have handed every platform operator the broker's administrator token, which
 * has far more power than this page.
 *
 * No tenant query parameter: broker state is platform-wide. A per-tenant filter would imply a
 * boundary EMQX does not have, because a client id carries no tenant the broker verifies.
 */
export async function GET() {
  return proxyBackend((client) => client.request('/admin/platform-mqtt/management'), {
    unauthorized: 'Sesi super admin tidak valid.',
    unavailable: 'State broker MQTT tidak dapat diambil',
  });
}