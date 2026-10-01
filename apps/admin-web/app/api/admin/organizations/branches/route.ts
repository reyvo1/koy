import { NextResponse } from 'next/server';
import { proxyBackend } from '@/lib/proxy';

const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/**
 * POST /api/admin/organizations/branches — attach a tenant to an organization.
 *
 * Owner-only, enforced by the service, and the refusal is a 403 that reaches the console as a
 * 403 — `proxyBackend` clears the session on 401 only, so an admin refused here stays signed
 * in and is told the truth.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const organizationId = typeof body?.organizationId === 'string' ? body.organizationId : '';
  const tenantId = typeof body?.tenantId === 'string' ? body.tenantId : '';
  const label = typeof body?.label === 'string' ? body.label.trim() : '';

  if (!UUID.test(organizationId) || !UUID.test(tenantId)) {
    return NextResponse.json(
      { message: 'organizationId dan tenantId harus UUID yang valid' },
      { status: 400 },
    );
  }
  if (!label) {
    return NextResponse.json({ message: 'Label cabang wajib diisi' }, { status: 400 });
  }

  return proxyBackend(
    (client) =>
      client.request('/organizations/branches', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ organizationId, tenantId, label }),
      }),
    { unauthorized: 'Sesi tidak valid.', unavailable: 'Gagal menambah cabang organisasi' },
  );
}
