import { proxyBackend } from '@/lib/proxy';
export async function POST(
  request: Request,
  { params }: { params: Promise<{ integrationId: string }> },
) {
  const { integrationId } = await params;
  return proxyBackend(
    (client) =>
      client.request(
        `/admin/integrations/${encodeURIComponent(integrationId)}/connect`,
        { method: 'POST' },
      ),
    {
      unauthorized: 'Sesi tidak valid.',
      unavailable: 'Operasi provider gagal.',
    },
  );
}
