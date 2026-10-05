import { proxyBackend } from '@/lib/proxy';

/**
 * GET /api/tenant/notifications/:notificationId — operator-safe delivery detail.
 *
 * The backend intentionally omits the message body and worker credentials/lease identifiers.
 * Authentication notifications can contain verification/reset tokens in their body, so this
 * BFF must never attempt to fetch or reconstruct them from another source.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ notificationId: string }> },
) {
  const { notificationId } = await params;
  return proxyBackend(
    (client) => client.request(`/notifications/${encodeURIComponent(notificationId)}`),
    { unauthorized: 'Sesi tidak valid.', unavailable: 'Detail notifikasi tidak dapat dimuat' },
  );
}
