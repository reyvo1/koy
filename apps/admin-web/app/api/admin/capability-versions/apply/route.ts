import { NextResponse } from 'next/server';
import { proxyBackend } from '@/lib/proxy';

/**
 * POST /api/admin/capability-versions/apply — move devices onto a published capability version.
 *
 * The one thing this route must not do is flatten the refusal. `applyVersion` refuses a
 * capability that a dashboard widget or an automation already reads, and returns the counts
 * that caused the refusal, because the operator's next action is to detach those references —
 * a response of "some devices could not be updated" turns a to-do list into a dead end.
 *
 * A 409 from the backend is passed through with its body intact for the same reason. The
 * refusals arrive as a successful 200 with `refused` populated rather than as an error, since a
 * fleet where some devices are bound is a normal outcome, not a failed request.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;

  const tenantId = typeof body?.tenantId === 'string' ? body.tenantId.trim() : '';
  const templateId = typeof body?.templateId === 'string' ? body.templateId.trim() : '';

  if (!tenantId) {
    // Checked here rather than left to the backend's 400 so the operator gets the reason in
    // the console's own language instead of a proxied English message.
    return NextResponse.json(
      { message: 'tenantId wajib diisi; route platform tidak menebak tenant' },
      { status: 400 },
    );
  }
  if (!templateId) {
    return NextResponse.json({ message: 'templateId wajib diisi' }, { status: 400 });
  }

  const maxDevices =
    typeof body?.maxDevices === 'number' && Number.isFinite(body.maxDevices)
      ? body.maxDevices
      : undefined;

  return proxyBackend(
    (client) =>
      client.request('/admin/platform-capability-versions/apply', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          templateId,
          maxDevices,
          // The console always previews before applying: an apply rewrites the capability
          // schema of real devices, and the refusal list is only actionable if the operator has
          // seen it before committing.
          dryRun: body?.dryRun === true,
        }),
      }),
    {
      unauthorized: 'Sesi tidak valid.',
      unavailable: 'Gagal menerapkan versi capability',
    },
  );
}