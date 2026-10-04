import { NextResponse } from 'next/server';
import { proxyBackend } from '@/lib/proxy';

/** GET /api/admin/roles — tenant custom roles and current assignments. */
export async function GET() {
  return proxyBackend(
    (client) => client.request('/admin/roles'),
    { unauthorized: 'Sesi admin tenant tidak valid.', unavailable: 'Daftar custom role tidak tersedia' },
  );
}

/** POST /api/admin/roles — create a tenant custom role. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const permissions = Array.isArray(body?.permissions)
    ? body.permissions.filter((value): value is string => typeof value === 'string')
    : [];

  if (name.length < 2 || name.length > 60) {
    return NextResponse.json({ message: 'Nama role harus 2-60 karakter' }, { status: 400 });
  }
  if (permissions.length === 0 || permissions.length > 64) {
    return NextResponse.json({ message: 'Pilih 1-64 permission' }, { status: 400 });
  }
  if (new Set(permissions).size !== permissions.length) {
    return NextResponse.json({ message: 'Permission tidak boleh duplikat' }, { status: 400 });
  }

  return proxyBackend(
    (client) =>
      client.request('/admin/roles', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, permissions }),
      }),
    { unauthorized: 'Sesi admin tenant tidak valid.', unavailable: 'Gagal membuat custom role' },
  );
}
