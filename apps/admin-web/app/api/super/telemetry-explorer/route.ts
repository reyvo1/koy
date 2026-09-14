import { proxyBackend } from '@/lib/proxy';

export async function GET(request: Request) {
  const source = new URL(request.url);
  const params = new URLSearchParams();
  for (const key of ['deviceId', 'capability', 'from', 'to', 'limit']) {
    const value = source.searchParams.get(key)?.trim();
    if (value) params.set(key, value);
  }
  return proxyBackend(
    (client) => client.request(`/admin/platform-telemetry/explorer?${params.toString()}`),
    {
      unauthorized: 'Sesi super admin tidak valid.',
      unavailable: 'Telemetry explorer tidak tersedia',
    },
  );
}
