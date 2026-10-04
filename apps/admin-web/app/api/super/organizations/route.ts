import { NextResponse } from 'next/server';
import { proxyBackend } from '@/lib/proxy';

const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** GET /api/super/organizations — bounded platform organization directory. */
export async function GET() {
  return proxyBackend(
    (client) => client.request('/organizations'),
    { unauthorized: 'Sesi Super Admin tidak valid.', unavailable: 'Gagal memuat organisasi' },
  );
}

/** POST /api/super/organizations — create an organization with an existing tenant as first branch. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const firstBranchTenantId =
    typeof body?.firstBranchTenantId === 'string' ? body.firstBranchTenantId.trim() : '';
  const firstBranchLabel =
    typeof body?.firstBranchLabel === 'string' ? body.firstBranchLabel.trim() : '';

  if (name.length < 2 || name.length > 120) {
    return NextResponse.json(
      { message: 'Nama organisasi harus 2-120 karakter' },
      { status: 400 },
    );
  }
  if (!UUID.test(firstBranchTenantId)) {
    return NextResponse.json(
      { message: 'Tenant cabang pertama harus UUID yang valid' },
      { status: 400 },
    );
  }
  if (firstBranchLabel.length < 2 || firstBranchLabel.length > 120) {
    return NextResponse.json(
      { message: 'Label cabang pertama harus 2-120 karakter' },
      { status: 400 },
    );
  }

  return proxyBackend(
    (client) =>
      client.request('/organizations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, firstBranchTenantId, firstBranchLabel }),
      }),
    { unauthorized: 'Sesi Super Admin tidak valid.', unavailable: 'Gagal membuat organisasi' },
  );
}
