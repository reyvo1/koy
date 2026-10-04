import { NextResponse } from 'next/server';
import { proxyBackend } from '@/lib/proxy';

export async function POST(
  request: Request,
  context: { params: Promise<{ templateId: string }> },
) {
  const { templateId } = await context.params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const tenantId = typeof body?.tenantId === 'string' ? body.tenantId.trim() : '';
  const version = typeof body?.version === 'string' ? body.version.trim() : '';
  if (!tenantId) return NextResponse.json({ message: 'tenantId wajib diisi' }, { status: 400 });
  if (!templateId?.trim()) return NextResponse.json({ message: 'templateId wajib diisi' }, { status: 400 });
  if (!version) return NextResponse.json({ message: 'version wajib diisi' }, { status: 400 });

  return proxyBackend(
    (client) => client.request(`/admin/platform-capability-templates/${encodeURIComponent(templateId)}/deprecate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tenantId,
        version,
        reason: typeof body?.reason === 'string' ? body.reason.trim() : undefined,
      }),
    }),
    { unauthorized: 'Sesi tidak valid.', unavailable: 'Gagal mendeprekasi versi capability' },
  );
}
