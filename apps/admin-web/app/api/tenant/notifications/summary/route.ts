import { proxyBackend } from '@/lib/proxy';

/**
 * GET /api/tenant/notifications/summary — per-status counts.
 *
 * Kept as a separate route from the list so the screen's headline numbers cannot be
 * derived by counting a truncated page: the list is bounded, the summary is not.
 */
export async function GET() {
  return proxyBackend(
    (client) => client.request('/notifications/summary'),
    { unauthorized: 'Sesi tidak valid.', unavailable: 'Ringkasan tidak dapat dimuat' },
  );
}
