import { proxyBackend } from '@/lib/proxy';

/**
 * /api/devices/[deviceId]/shares — device sharing, the producer side.
 *
 * GET  who currently holds access to this device.
 * POST grant a tenant member VIEW or CONTROL on it.
 *
 * Without the read half an administrator could create a share but not see the existing
 * ones, and revoking needs a grant id they have no way to obtain. Without the write half
 * a share could only be produced by writing directly to `device_share_grants`, because the
 * consuming side (`DeviceAccessService`, which lets a member send a command) had no
 * producer at all.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ deviceId: string }> },
) {
  const { deviceId } = await params;
  return proxyBackend(
    (client) => client.request(`/devices/${deviceId}/shares`),
    { unauthorized: 'Sesi tidak valid.', unavailable: 'Gagal memuat berbagi perangkat' },
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ deviceId: string }> },
) {
  const { deviceId } = await params;
  const body = await request.json().catch(() => null);
  return proxyBackend(
    (client) =>
      client.request(`/devices/${deviceId}/shares`, {
        method: 'POST',
        // Required. Without an explicit content-type the backend body parser yields
        // undefined, and every DTO field then fails validation with an empty field list —
        // a confusing 400 that looks like the payload was wrong when it was never read.
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          grantedToMembershipId: body?.grantedToMembershipId,
          permission: body?.permission,
          expiresAt: body?.expiresAt,
        }),
      }),
    { unauthorized: 'Sesi tidak valid.', unavailable: 'Gagal berbagi perangkat' },
  );
}
