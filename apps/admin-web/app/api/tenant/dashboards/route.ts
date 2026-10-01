import { NextResponse } from 'next/server';
import { proxyBackend } from '@/lib/proxy';

/** GET /api/tenant/dashboards — personal + shared dashboards (Modul 18). */
export async function GET(request: Request) {
  const limit = new URL(request.url).searchParams.get('limit') ?? '50';
  return proxyBackend(
    (client) => client.request(`/dashboards?limit=${encodeURIComponent(limit)}`),
    { unauthorized: 'Sesi tidak valid.', unavailable: 'Workspace tidak tersedia' },
  );
}

const MAX_NAME_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 500;

/**
 * POST /api/tenant/dashboards — create a dashboard.
 *
 * This route existed on the backend from the start, but the proxy only exported GET, so
 * the Workspace screen had no way to create anything. It rendered "Belum ada workspace"
 * with no create control at all, which made the page permanently empty by construction
 * rather than by data. Input is narrowed to the three operator-chosen fields; the
 * aggregate's widget/binding arrays start empty and are filled by the editor; the layout
 * array gets one DESKTOP grid, because a dashboard with no layout cannot hold a widget.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    name?: unknown;
    description?: unknown;
    audience?: unknown;
  } | null;

  if (!body || typeof body.name !== 'string' || body.name.trim().length === 0) {
    return NextResponse.json(
      { message: 'Nama workspace wajib diisi' },
      { status: 400 },
    );
  }
  if (body.name.length > MAX_NAME_LENGTH) {
    return NextResponse.json(
      { message: `Nama workspace maksimal ${MAX_NAME_LENGTH} karakter` },
      { status: 400 },
    );
  }
  if (
    body.description !== undefined &&
    (typeof body.description !== 'string' ||
      body.description.length > MAX_DESCRIPTION_LENGTH)
  ) {
    return NextResponse.json(
      { message: `Deskripsi maksimal ${MAX_DESCRIPTION_LENGTH} karakter` },
      { status: 400 },
    );
  }

  // TENANT_SHARED requires tenant admin server-side; a member creating one gets a
  // truthful 403 rather than a silently downgraded personal board.
  const audience = body.audience === 'TENANT_SHARED' ? 'TENANT_SHARED' : 'PERSONAL';

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const description =
    typeof body.description === 'string' ? body.description.trim() : '';

  return proxyBackend(
    (client) =>
      client.request('/dashboards', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name,
          audience,
          ...(description ? { description } : {}),
          // One DESKTOP layout, not an empty array. A layout item must name its parent
          // layout, and an aggregate with no layout has nowhere to place a widget — so
          // `layouts: []` produced a workspace the editor could open and not use. The
          // defaults match the DTO bounds and the 12-column grid the read-only view renders.
          layouts: [
            {
              id: crypto.randomUUID(),
              breakpoint: 'DESKTOP',
              columns: 12,
              rowHeight: 8,
              gap: 12,
            },
          ],
          widgets: [],
          layoutItems: [],
          bindings: [],
        }),
      }),
    { unauthorized: 'Sesi tidak valid.', unavailable: 'Workspace tidak dapat dibuat' },
  );
}