import { proxyBackend } from '@/lib/proxy';
export async function GET() {
  return proxyBackend(
    (client) => client.request('/admin/platform-device-locations'),
    {
      unauthorized: 'Sesi tidak valid.',
      unavailable: 'Lokasi platform gagal dibaca.',
    },
  );
}
