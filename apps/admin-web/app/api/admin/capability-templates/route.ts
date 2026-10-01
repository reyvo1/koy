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