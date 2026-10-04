import { NextResponse } from 'next/server';
import { proxyBackend } from '@/lib/proxy';

/**
 * GET /api/admin/capability-templates — capability templates and their version lifecycles.
 *
 * The drift panel needs this to decide whether Apply is even available for a key: applying a
 * version that was never published is refused by the backend, so offering the button before the
 * templates are known would present a control that fails on press.
 *
 * `tenantId` is required rather than defaulted. The drift listing spans tenants, while an apply
 * is deliberately scoped to one — so the console has to ask which tenant, and guessing would
 * apply a version to somebody else's fleet.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const tenantId = url.searchParams.get('tenantId')?.trim() ?? '';
  const rawTake = url.searchParams.get('take');
  const take = rawTake && Number.isFinite(Number(rawTake)) ? Number(rawTake) : 100;

  if (!tenantId) {
    return NextResponse.json(
      { message: 'tenantId wajib diisi; route platform tidak menebak tenant' },
      { status: 400 },
    );
  }

  return proxyBackend(
    (client) =>
      client.request(
        `/admin/platform-capability-templates?tenantId=${encodeURIComponent(tenantId)}&take=${take}`,
      ),
    { unauthorized: 'Sesi tidak valid.', unavailable: 'Gagal memuat template capability' },
  );
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const tenantId = typeof body?.tenantId === 'string' ? body.tenantId.trim() : '';
  const key = typeof body?.key === 'string' ? body.key.trim() : '';
  const semanticType = typeof body?.semanticType === 'string' ? body.semanticType.trim() : '';
  const dataType = typeof body?.dataType === 'string' ? body.dataType.trim() : '';

  if (!tenantId) return NextResponse.json({ message: 'tenantId wajib diisi' }, { status: 400 });
  if (!key) return NextResponse.json({ message: 'key wajib diisi' }, { status: 400 });
  if (!semanticType) return NextResponse.json({ message: 'semanticType wajib diisi' }, { status: 400 });
  if (!dataType) return NextResponse.json({ message: 'dataType wajib diisi' }, { status: 400 });

  return proxyBackend(
    (client) => client.request('/admin/platform-capability-templates', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tenantId,
        key,
        semanticType,
        dataType,
        unit: typeof body?.unit === 'string' ? body.unit.trim() : undefined,
        description: typeof body?.description === 'string' ? body.description.trim() : undefined,
      }),
    }),
    { unauthorized: 'Sesi tidak valid.', unavailable: 'Gagal membuat template capability' },
  );
}
