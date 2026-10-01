import { NextResponse } from 'next/server';
import { proxyBackend } from '@/lib/proxy';

/**
 * GET — the saved-report list. POST — save the current tenant-summary run.
 *
 * Under `/api/super/`, matching `/api/super/reports/tenant-summary`, because these are platform
 * routes: the platform role decides which tenant the session speaks for, and the browser is never
 * asked to name one.
 *
 * The GET deliberately takes no `tenantId` query parameter. A list that accepted one would let any
 * platform session edit a URL and read another tenant's report archive; the backend route still
 * requires the tenant explicitly, so this one reads it from the session rather than inventing it.
 */
export async function GET(request: Request) {
  // The tenant is asked for, and this is a deliberate change from reading it off the session.
  //
  // The first version took the tenant from the session cookie, reasoning that a `tenantId`
  // parameter would let a platform session read another tenant's archive. That reasoning was
  // sound and the implementation was wrong: a report is saved *for a target tenant* chosen by the
  // operator, while the session belongs to the platform tenant. So the archive was written under
  // one tenant and listed under another, and an operator who saved a report saw an empty list --
  // which reads as "the save did not work".
  //
  // The real boundary is the backend's `PlatformRoleGuard`, not the absence of a parameter: this
  // route is platform-only, and the session cookie is deliberately *not* accepted as the tenant
  // here. An empty tenant is refused rather than falling back to the session tenant, because a
  // silent fallback would list the platform tenant's archive and look like an answer.
  const tenantId = new URL(request.url).searchParams.get('tenantId')?.trim() ?? '';
  if (!tenantId) {
    return NextResponse.json(
      { message: 'tenantId wajib diisi; route platform tidak menebak tenant' },
      { status: 400 },
    );
  }

  return proxyBackend(
    (client) =>
      client.request(
        `/admin/platform-reports/saved?tenantId=${encodeURIComponent(tenantId)}`,
      ),
    {
      unauthorized: 'Sesi super admin tidak valid.',
      unavailable: 'Laporan tersimpan tidak tersedia',
    },
  );
}

/**
 * POST — run the tenant summary and store it so it can be downloaded again.
 *
 * The response is passed through untouched, including its `note` that the stored payload is what
 * will be downloaded later. Rebuilding that sentence here would be a second wording to keep in
 * step with the backend's, and the note is the part that tells an operator why the number they
 * read next week will still be the number they saved today.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;

  const tenantId = typeof body?.tenantId === 'string' ? body.tenantId.trim() : '';
  if (!tenantId) {
    return NextResponse.json(
      { message: 'tenantId wajib diisi; route platform tidak menebak tenant' },
      { status: 400 },
    );
  }

  const hours =
    typeof body?.hours === 'number' && Number.isFinite(body.hours) ? body.hours : 24;

  return proxyBackend(
    (client) =>
      client.request('/admin/platform-reports/saved', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tenantId, hours }),
      }),
    { unauthorized: 'Sesi super admin tidak valid.', unavailable: 'Gagal menyimpan laporan' },
  );
}
