import { NextResponse } from 'next/server';
import { proxyBackend } from '@/lib/proxy';

const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** DELETE /api/super/organizations/:organizationId — delete grouping; tenants remain intact. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ organizationId: string }> },
) {
  const { organizationId } = await params;
  if (!UUID.test(organizationId)) {
    return NextResponse.json({ message: 'Organization harus UUID yang valid' }, { status: 400 });
  }
  return proxyBackend(
    (client) =>
      client.request(`/organizations/${encodeURIComponent(organizationId)}`, { method: 'DELETE' }),
    { unauthorized: 'Sesi Super Admin tidak valid.', unavailable: 'Gagal menghapus organisasi' },
  );
}
