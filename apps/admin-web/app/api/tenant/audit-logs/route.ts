import { proxyBackend } from '@/lib/proxy';

const FORWARDED = ['resourceType', 'action', 'limit', 'cursor'] as const;

/** GET /api/tenant/audit-logs — tenant-scoped immutable RBAC mutation trail. */
export async function GET(request: Request) {
  const incoming = new URL(request.url).searchParams;
  const query = new URLSearchParams();
  for (const key of FORWARDED) {
    const value = incoming.get(key);
    if (value?.trim()) query.set(key, value.trim());
  }
  const suffix = query.toString();
  return proxyBackend(
    (client) => client.request(`/audit-logs${suffix ? `?${suffix}` : ''}`),
    { unauthorized: 'Sesi tidak valid.', unavailable: 'Log audit tenant tidak dapat dimuat' },
  );
}
