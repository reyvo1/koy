import { NextResponse } from 'next/server';
import { proxyBackend } from '@/lib/proxy';

/**
 * GET /api/tenant/dashboards/[dashboardId]/aggregate — the writable dashboard document.
 *
 * The sibling `/api/tenant/dashboards/[dashboardId]` proxies `/resolution`, which is the
 * read model for the grid: which widgets exist and whether they resolve. It carries no
 * layouts, no positions and no bindings, so an editor that loads it gets `layouts: undefined`
 * and cannot render or save anything. The empty state said widgets were added "lewat editor
 * Modul 10"; there was no editor, and no route for one to read from.
 *
 * `/dashboards/:id` is the document the write DTO accepts. It echoes `layoutId` on every
 * layout item and `widgetId` on every binding precisely so a read-modify-write does not have
 * to re-attach parents by hand, which is what makes this round-trippable and the resolution
 * endpoint not.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ dashboardId: string }> },
) {
  const { dashboardId } = await params;
  return proxyBackend(
    (client) => client.request(`/dashboards/${dashboardId}`),
    { unauthorized: 'Sesi tidak valid.', unavailable: 'Workspace tidak tersedia' },
  );
}

/**
 * PUT /api/tenant/dashboards/[dashboardId]/aggregate — replace the whole aggregate.
 *
 * The body is forwarded verbatim, including `expectedRevision`. The backend uses it as an
 * optimistic-concurrency token and answers 409 when the dashboard moved on, and this proxy
 * passes that status through rather than rewriting it, so the editor can tell "someone else
 * saved first" from "your input was invalid". Rewriting a 409 into a 500 or a 200 would make
 * the editor overwrite someone else's widgets.
 *
 * Nothing is validated or defaulted here. The backend owns the aggregate rules, and a
 * half-checked payload forwarded onward would produce a save that looks successful in the UI
 * while the server stored something different.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ dashboardId: string }> },
) {
  const { dashboardId } = await params;

  let body: string;
  try {
    // Serialise here rather than handing `request.json()` to `RequestInit.body`: the client
    // takes a `BodyInit`, and forwarding an already-parsed object would depend on how the
    // fetch wrapper stringifies it. Encoding once, explicitly, keeps the bytes on the wire
    // identical to what the editor sent.
    body = JSON.stringify(await request.json());
  } catch {
    return NextResponse.json(
      {
        statusCode: 400,
        error: { code: 'BAD_REQUEST', message: 'Body workspace harus berupa JSON.' },
      },
      { status: 400 },
    );
  }

  return proxyBackend(
    (client) => client.request(`/dashboards/${dashboardId}`, {
      method: 'PUT',
      body,
      headers: { 'content-type': 'application/json' },
    }),
    // A stale revision arrives as 409 and `proxyBackend` passes the status through
    // untouched, which is what the editor needs: it stops and re-reads instead of retrying
    // with its own token and overwriting someone else's widgets.
    { unauthorized: 'Sesi tidak valid.', unavailable: 'Workspace tidak tersedia' },
  );
}
