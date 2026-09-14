import { proxyBackend } from '@/lib/proxy';

/** POST /api/admin/tenant-users/[userId]/reset-password. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId } = await params;
  const body = await request.json().catch(() => null);
  return proxyBackend(
    (client) =>
      client.request(`/admin/tenant-users/${userId}/reset-password`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    { unauthorized: 'Sesi admin tenant tidak valid.', unavailable: 'Gagal reset password' },
  );
}
