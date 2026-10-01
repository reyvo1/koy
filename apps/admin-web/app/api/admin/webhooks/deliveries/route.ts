import { proxyBackend } from '@/lib/proxy';

/**
 * GET /api/admin/webhooks/deliveries — recent delivery attempts.
 *
 * The point of this surface is the failure: a subscriber that stops being delivered to looks
 * identical to a receiver that is simply quiet, and a list with no failures on it is exactly
 * what makes that ambiguity invisible. The console renders the `ok` column, not just the
 * count.
 */
export async function GET() {
  return proxyBackend(
    (client) => client.request('/admin/webhooks/deliveries?limit=25'),
    { unauthorized: 'Sesi tidak valid.', unavailable: 'Gagal memuat riwayat pengiriman webhook' },
  );
}
