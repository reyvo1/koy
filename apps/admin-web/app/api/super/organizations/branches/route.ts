import { NextResponse } from 'next/server';
import { proxyBackend } from '@/lib/proxy';

const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** POST /api/super/organizations/branches — add an unassigned tenant to an owned organization. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const organizationId = typeof body?.organizationId === 'string' ? body.organizationId.trim() : '';
  const tenantId = typeof body?.tenantId === 'string' ? body.tenantId.trim() : '';
  const label = typeof body?.label === 'string' ? body.label.trim() : '';
  if (!UUID.test(organizationId) || !UUID.test(tenantId)) {
    return NextResponse.json({ message: 'Organization dan tenant harus UUID yang valid' }, { status: 400 });
  }
  if (label.length < 2 || label.length > 120) {
    return NextResponse.json({ message: 'Label cabang harus 2-120 karakter' }, { status: 400 });
  }
  return proxyBackend(
    (client) =>
      client.request('/organizations/branches', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ organizationId, tenantId, label }),
      }),
    { unauthorized: 'Sesi Super Admin tidak valid.', unavailable: 'Gagal menambahkan cabang' },
  );
}
