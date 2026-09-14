import { proxyBackend } from '@/lib/proxy';

export async function GET(request: Request) {
  const tenantId = new URL(request.url).searchParams.get('tenantId')?.trim();
  const suffix = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : '';
  return proxyBackend(
    (client) => client.request(`/admin/platform-device-credentials${suffix}`),
    {
      unauthorized: 'Sesi super admin tidak valid.',
      unavailable: 'Metadata kredensial perangkat tidak tersedia',
    },
  );
}
