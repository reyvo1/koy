import { proxyBackend } from '@/lib/proxy';

export async function GET(request: Request) {
  const source = new URL(request.url);
  const params = new URLSearchParams();
  for (const key of ['tenantId', 'deviceId', 'status', 'limit']) {
    const value = source.searchParams.get(key)?.trim();
    if (value) params.set(key, value);
  }
  const encoded = params.toString();
  const suffix = encoded ? `?${encoded}` : '';
  return proxyBackend(
    (client) => client.request(`/admin/platform-commands${suffix}`),
    {
      unauthorized: 'Sesi super admin tidak valid.',
      unavailable: 'Monitor command platform tidak tersedia',
    },
  );
}
