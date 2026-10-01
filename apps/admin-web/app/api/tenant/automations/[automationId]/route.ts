import { proxyBackend } from '@/lib/proxy';

/**
 * DELETE /api/tenant/automations/[automationId]
 * GET    /api/tenant/automations/[automationId] — read an automation back.
 * PUT    /api/tenant/automations/[automationId] — replace its definition.
 *
 * GET and PUT were missing because this route previously exported DELETE only, even
 * though the backend has exposed a tenant-owned read and an optimistic-concurrency
 * replace. That left the automation page able to create, activate, deactivate and delete,
 * but never to read an automation back or change its definition.
 *
 * PUT requires an integer `expectedRevision`. The backend rejects a stale revision rather
 * than silently overwriting a concurrent edit, so a form left open elsewhere cannot cause
 * a lost update.
 */

/** DELETE /api/tenant/automations/[automationId]. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ automationId: string }> },
) {
  const { automationId } = await params;
  return proxyBackend(
    (client) => client.request(`/automations/${automationId}`, { method: 'DELETE' }),
    { unauthorized: 'Sesi tidak valid.', unavailable: 'Gagal menghapus otomasi' },
  );
}

/** GET /api/tenant/automations/[automationId]. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ automationId: string }> },
) {
  const { automationId } = await params;
  return proxyBackend(
    (client) => client.request(`/automations/${automationId}`, { method: 'GET' }),
    { unauthorized: 'Sesi tidak valid.', unavailable: 'Gagal memuat otomasi' },
  );
}

/** PUT /api/tenant/automations/[automationId]. */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ automationId: string }> },
) {
  const { automationId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { message: 'expectedRevision is required as an integer, and definition must be an object' },
      { status: 400 },
    );
  }

  if (!isReplaceBody(body)) {
    return Response.json(
      {
        message:
          'expectedRevision is required as an integer, and definition must be an object',
      },
      { status: 400 },
    );
  }

  // Bind after the guard: the narrowing is not carried into the closure below, because
  // `body` is a `let` and TypeScript cannot prove it was not reassigned by then.
  const expectedRevision = body.expectedRevision;
  const definition = body.definition;

  return proxyBackend(
    (client) =>
      client.request(`/automations/${automationId}`, {
        method: 'PUT',
        // Without an explicit JSON content type, Fastify does not parse the body, so
        // `@Body()` arrived empty on the backend and the replace endpoint rejected every
        // save with "expectedRevision wajib angka" — even though the client had sent a
        // valid integer and the proxy's own guard had accepted it. The POST sibling route
        // already sets this header; PUT was the odd one out.
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ expectedRevision, definition }),
      }),
    { unauthorized: 'Sesi tidak valid.', unavailable: 'Gagal memperbarui otomasi' },
  );
}

function isReplaceBody(
  value: unknown,
): value is { expectedRevision: number; definition: Record<string, unknown> } {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const body = value as Record<string, unknown>;
  return (
    Number.isInteger(body.expectedRevision) &&
    typeof body.definition === 'object' &&
    body.definition !== null &&
    !Array.isArray(body.definition)
  );
}
