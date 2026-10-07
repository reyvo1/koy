import { proxyBackend } from '@/lib/proxy';
export async function GET(
  request: Request,
  { params }: { params: Promise<{ integrationId: string }> },
) {
  const { integrationId } = await params;
  return proxyBackend(
    (client) =>
      client.request(
        `/admin/integrations/${encodeURIComponent(integrationId)}/runtime`,
        { method: 'GET' },
      ),
    {
      unauthorized: 'Sesi tidak valid.',
      unavailable: 'Operasi provider gagal.',
    },
  );
}
