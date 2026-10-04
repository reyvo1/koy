import { NextResponse } from 'next/server';
import { proxyBackend } from '@/lib/proxy';

const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/**
 * POST /api/admin/webhooks/endpoints/:endpointId/rotate-secret
 *
 * The backend returns the new signing secret exactly once. This BFF preserves that one-time
 * response and never stores it server-side. Listing endpoints still has no secret field.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ endpointId: string }> },
) {
  const { endpointId } = await params;
  if (!UUID.test(endpointId)) {
    return NextResponse.json({ message: 'ID endpoint tidak valid' }, { status: 400 });
  }
  return proxyBackend(
    (client) =>
      client.request(`/admin/webhooks/endpoints/${endpointId}/rotate-secret`, {
        method: 'POST',
      }),
    {
      unauthorized: 'Sesi tidak valid.',
      unavailable: 'Gagal merotasi signing secret webhook',
    },
  );
}
