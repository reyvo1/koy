import { NextResponse } from 'next/server';
import { proxyBackend } from '@/lib/proxy';

const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/**
 * DELETE /api/admin/webhooks/endpoints/:endpointId — stop delivering to a receiver.
 *
 * The id is shape-checked here because a malformed id reaches the backend as a 404 with a
 * `ORG`-style code the console cannot explain, and "invalid id" and "not yours" are different
 * answers the operator needs to tell apart.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ endpointId: string }> },
) {
  const { endpointId } = await params;
  if (!UUID.test(endpointId)) {
    return NextResponse.json({ message: 'ID endpoint tidak valid' }, { status: 400 });
  }
  return proxyBackend(
    (client) => client.request(`/admin/webhooks/endpoints/${endpointId}`, { method: 'DELETE' }),
    { unauthorized: 'Sesi tidak valid.', unavailable: 'Gagal menghapus endpoint webhook' },
  );
}

/**
 * PATCH /api/admin/webhooks/endpoints/:endpointId — enable or disable a receiver.
 *
 * Disabling rather than deleting is the pause an operator actually needs: a receiver that is
 * down should not have to be re-registered and re-signed when it comes back.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ endpointId: string }> },
) {
  const { endpointId } = await params;
  if (!UUID.test(endpointId)) {
    return NextResponse.json({ message: 'ID endpoint tidak valid' }, { status: 400 });
  }
  const body = (await request.json().catch(() => null)) as { enabled?: unknown } | null;
  if (typeof body?.enabled !== 'boolean') {
    return NextResponse.json(
      { message: 'Field "enabled" harus boolean' },
      { status: 400 },
    );
  }
  return proxyBackend(
    (client) =>
      client.request(`/admin/webhooks/endpoints/${endpointId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: body.enabled }),
      }),
    { unauthorized: 'Sesi tidak valid.', unavailable: 'Gagal mengubah status endpoint webhook' },
  );
}
