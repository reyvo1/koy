import { proxyBackend } from '@/lib/proxy';

export async function GET(request: Request) {
  const hours = new URL(request.url).searchParams.get('hours')?.trim();
  const suffix = hours ? `?hours=${encodeURIComponent(hours)}` : '';
  return proxyBackend(
    (client) => client.request(`/admin/platform-reports/tenant-summary${suffix}`),
    {
      unauthorized: 'Sesi super admin tidak valid.',
      unavailable: 'Laporan operasional platform tidak tersedia',
    },
  );
}
