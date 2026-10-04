import { NextResponse } from 'next/server';
import { proxyBackend } from '@/lib/proxy';

const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ membershipId: string }> },
) {
  const { membershipId } = await params;
  const body = (await request.json().catch(() => null)) as { roleId?: unknown } | null;
  const roleId = typeof body?.roleId === 'string' ? body.roleId.trim() : '';
  if (!UUID.test(membershipId) || !UUID.test(roleId)) {
    return NextResponse.json({ message: 'membershipId dan roleId harus UUID valid' }, { status: 400 });
  }
  return proxyBackend(
    (client) =>
      client.request(`/admin/roles/members/${membershipId}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ roleId }),
      }),
    { unauthorized: 'Sesi admin tenant tidak valid.', unavailable: 'Gagal memberi custom role' },
  );
}
