import { NextResponse } from 'next/server';
import { proxyBackend } from '@/lib/proxy';

/** GET /api/tenant/dashboards/[dashboardId] — widget resolution for one workspace. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ dashboardId: string }> },
) {
  const { dashboardId } = await params;
  return proxyBackend(
    (client) => client.request(`/dashboards/${dashboardId}/resolution`),
    { unauthorized: 'Sesi tidak valid.', unavailable: 'Workspace tidak tersedia' },
  );
}

/**
 * GET /api/tenant/dashboards/[dashboardId]/aggregate — the writable document.
 *
 * `GET /api/tenant/dashboards/:id` proxies `/resolution`, which is the read model for the
 * grid: which widgets a dashboard has and whether they resolve. It carries no layouts, no
 * positions and no bindings, so it cannot be edited — the editor asked for it and got
 * `layouts: undefined`.
 *
 * The aggregate is the document the write DTO accepts, and it deliberately echoes the parent
 * ids (`layoutId` on every item, `widgetId` on every binding) so a read-modify-write does not
 * have to re-attach them. That makes this the endpoint an editor loads, and it is what
 * `PUT` below takes back.
 */

/**
 * DELETE /api/tenant/dashboards/[dashboardId] — delete a workspace aggregate.
 *
 * `expectedRevision` is required and is forwarded verbatim. The backend enforces it as an
 * optimistic-concurrency token (`@Query('expectedRevision', ParseIntPipe)`), and this route
 * used to send no query string at all, so every delete failed with HTTP 400
 * "numeric string is expected" — the delete button on the Workspace screen had never
 * worked, and the failure was indistinguishable from a permissions problem in the UI.
 *
 * The token is not defaulted here. Inventing a revision would defeat the only thing it
 * protects: a dashboard that changed since the operator's list was rendered must not be
 * deleted by a click aimed at the version they saw. A missing or malformed value is
 * rejected here with the same 400 shape the backend would produce, so the operator sees a
 * truthful error rather than a delete that quietly succeeds against whatever is current.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ dashboardId: string }> },
) {
  const { dashboardId } = await params;
  const raw = new URL(request.url).searchParams.get('expectedRevision');

  if (raw === null || !/^\d+$/.test(raw) || Number(raw) < 1) {
    return NextResponse.json(
      {
        statusCode: 400,
        error: {
          code: 'BAD_REQUEST',
          message: 'expectedRevision wajib diisi sebagai bilangan bulat positif.',
        },
      },
      { status: 400 },
    );
  }

  return proxyBackend(
    (client) =>
      client.request(
        `/dashboards/${encodeURIComponent(
          dashboardId,
        )}?expectedRevision=${encodeURIComponent(raw)}`,
        { method: 'DELETE' },
      ),
    { unauthorized: 'Sesi tidak valid.', unavailable: 'Gagal menghapus workspace' },
  );
}