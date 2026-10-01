import { NextResponse } from 'next/server';
import { proxyBackend } from '@/lib/proxy';

const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/**
 * GET /api/admin/organizations/:organizationId/branches
 *
 * The backend answers 403 for an organization the caller has no claim to, and that refusal
 * carries no branch data. It is relayed as a 403 rather than flattened into a 401, because
 * flattening it would both sign the operator out and hide the reason — the defect
 * `test/admin-web-proxy-session.contract.spec.ts` now pins.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ organizationId: string }> },
) {
  const { organizationId } = await params;
  if (!UUID.test(organizationId)) {
    return NextResponse.json({ message: 'ID organisasi tidak valid' }, { status: 400 });
  }
  return proxyBackend(
    (client) => client.request(`/organizations/${organizationId}/branches`),
    { unauthorized: 'Sesi tidak valid.', unavailable: 'Gagal memuat cabang organisasi' },
  );
}
