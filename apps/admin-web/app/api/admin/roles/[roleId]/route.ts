import { NextResponse } from 'next/server';
import { proxyBackend } from '@/lib/proxy';

const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ roleId: string }> },
) {
  const { roleId } = await params;
  if (!UUID.test(roleId)) {
    return NextResponse.json({ message: 'ID role tidak valid' }, { status: 400 });
  }
  return proxyBackend(
    (client) => client.request(`/admin/roles/${roleId}`, { method: 'DELETE' }),
    { unauthorized: 'Sesi admin tenant tidak valid.', unavailable: 'Gagal menghapus custom role' },
  );
}
