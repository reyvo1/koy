import { NextResponse } from 'next/server';
import { proxyBackend } from '@/lib/proxy';

/**
 * GET /api/super/reports/saved/download?id= — the stored payload, for download.
 *
 * The id comes from the query, the tenant from the session. That pairing is the whole reason this
 * route exists separately from the list: an operator picks a report from their own archive, and
 * the backend lookup is `where: { id, tenantId }`, so a guessed id from another tenant finds
 * nothing rather than somebody else's report.
 *
 * The payload is passed through untouched. Regenerating it here -- recomputing the summary on
 * download -- would make the stored artifact a stored *query* and the numbers would move between
 * saving and re-reading, which is the failure this feature exists to remove.
 */
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('id')?.trim() ?? '';
  if (!id) {
    return NextResponse.json({ message: 'id laporan wajib diisi' }, { status: 400 });
  }

  // Asked for, not read off the session: a saved report belongs to a target tenant the operator
  // chose, while the session belongs to the platform tenant. The list route above had the same
  // bug and the effect was an empty list after a successful save. See the comment there.
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
        `/admin/platform-reports/saved/${encodeURIComponent(id)}?tenantId=${encodeURIComponent(tenantId)}`,
      ),
    {
      unauthorized: 'Sesi super admin tidak valid.',
      // "Tidak tersedia" rather than "tidak ditemukan": an expired report is refused with 404 from
      // the backend and the operator needs to know whether it is gone or merely past its window.
      unavailable: 'Laporan tersimpan tidak tersedia',
    },
  );
}
