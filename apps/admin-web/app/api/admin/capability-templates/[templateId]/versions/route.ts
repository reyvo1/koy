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
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    return NextResponse.json({ message: 'version wajib MAJOR.MINOR.PATCH' }, { status: 400 });
  }

  return proxyBackend(
    (client) => client.request(`/admin/platform-capability-templates/${encodeURIComponent(templateId)}/versions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tenantId,
        version,
        constraints: body?.constraints,
        semanticType: typeof body?.semanticType === 'string' ? body.semanticType : undefined,
        isReadable: typeof body?.isReadable === 'boolean' ? body.isReadable : undefined,
        isWritable: typeof body?.isWritable === 'boolean' ? body.isWritable : undefined,
        isReportable: typeof body?.isReportable === 'boolean' ? body.isReportable : undefined,
        supersede: body?.supersede === true,
        rollback: body?.rollback === true,
      }),
    }),
    { unauthorized: 'Sesi tidak valid.', unavailable: 'Gagal memublikasikan versi capability' },
  );
}
