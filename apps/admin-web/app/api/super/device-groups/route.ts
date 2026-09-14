import { proxyBackend } from '@/lib/proxy';

export async function GET(request: Request) {
  const tenantId = new URL(request.url).searchParams.get('tenantId')?.trim();
  const suffix = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : '';
  return proxyBackend(
    (client) => client.request(`/admin/platform-device-groups${suffix}`),
    {
      unauthorized: 'Sesi super admin tidak valid.',
      unavailable: 'Direktori device group platform tidak tersedia',
    },
  );
}
