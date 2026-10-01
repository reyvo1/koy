import { proxyBackend } from '@/lib/proxy';

/**
 * POST /api/super/commands/dispatch — platform-initiated command dispatch.
 *
 * The backend requires an explicit target tenant, a device that provably belongs to it, and
 * a non-empty reason, and it records the decision in the RBAC audit log. This proxy adds no
 * defaults: it forwards exactly what the operator supplied so a missing field is rejected by
 * the service rather than guessed here.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  return proxyBackend(
    (client) =>
      client.request('/admin/platform-commands/dispatch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      }),
    {
      unauthorized: 'Sesi super admin tidak valid.',
      unavailable: 'Gagal mengirim command platform',
    },
  );
}
