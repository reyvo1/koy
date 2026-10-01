import { proxyBackend } from '@/lib/proxy';

/**
 * POST /api/super/noc/findings/:findingId/acknowledge — record that an operator has seen a finding.
 *
 * Per finding, with no bulk variant. A shift handover is a list of what each person took, and an
 * "acknowledge all" button would clear every badge while destroying that record — the console would
 * look clean and the next responder would learn nothing.
 *
 * `tenantId` travels in the body because the backend cannot infer it: this console triages
 * findings across every tenant, while the operator's session belongs to the platform tenant, so
 * resolving the tenant from the session answered 404 for every customer finding. Naming the tenant
 * grants nothing on its own — the backend resolves the finding *inside* that tenant and 404s on a
 * mismatch, so a wrong id cannot acknowledge someone else's finding.
 *
 * The actor is not in the body at all. The backend takes it from the session, and there is no
 * `actor` field here to override, which is the point: an on-call record that could be written in
 * someone else's name would be worthless.
 *
 * The backend refuses to resolve a finding that was never acknowledged, and answers a repeat
 * acknowledgement with the original row rather than an error, so a double click is a no-op instead
 * of a failure an operator learns to avoid clicking.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ findingId: string }> },
) {
  const { findingId } = await params;
  const tenantId = new URL(request.url).searchParams.get('tenantId') ?? '';
  return proxyBackend(
    (client) =>
      client.request(`/admin/platform-noc/findings/${encodeURIComponent(findingId)}/acknowledge`, {
        method: 'POST',
        // The content type is not optional. Nest's `ValidationPipe` only parses the body when the
        // request declares JSON, so a POST carrying `{"tenantId":…}` *without* this header reaches
        // the handler with an undefined body — and the refusal then reads
        // "tenantId is required; NOC routes never guess a tenant", which blames the operator for a
        // header this route failed to send. Found in the browser, not by the probe: the probe talks
        // to the backend directly and always set the header itself.
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tenantId }),
      }),
    {
      unauthorized: 'Sesi super admin tidak valid.',
      unavailable: 'Pemberitahuan temuan tidak dapat disimpan',
    },
  );
}