import { NextResponse } from 'next/server';
import { proxyBackend } from '@/lib/proxy';

const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** DELETE /api/super/organizations/:organizationId/branches/:tenantId — detach a non-primary branch. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ organizationId: string; tenantId: string }> },
) {
  const { organizationId, tenantId } = await params;
  if (!UUID.test(organizationId) || !UUID.test(tenantId)) {
    return NextResponse.json(
      { message: 'Organization dan tenant harus UUID yang valid' },
      { status: 400 },
    );
  }
  return proxyBackend(
    (client) =>
      client.request(
        `/organizations/${encodeURIComponent(organizationId)}/branches/${encodeURIComponent(tenantId)}`,
        { method: 'DELETE' },
      ),
    { unauthorized: 'Sesi Super Admin tidak valid.', unavailable: 'Gagal menghapus cabang organisasi' },
  );
}
