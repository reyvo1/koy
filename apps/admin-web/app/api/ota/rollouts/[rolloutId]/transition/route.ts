import { NextResponse } from 'next/server';
import { proxyBackend } from '@/lib/proxy';

const ALLOWED_STATUS = ['PUBLISHED', 'IN_PROGRESS', 'ROLLED_BACK'] as const;

/**
 * POST /api/ota/rollouts/[rolloutId]/transition — advance the rollout state machine.
 *
 * Only the three operator-drivable targets are offered here. COMPLETED and DRAFT are not
 * operator choices: COMPLETED is derived by the backend once every target reports, and DRAFT
 * is the creation state. Offering them in the console would advertise transitions the state
 * machine refuses, which is how an operator learns to distrust a status control.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ rolloutId: string }> },
) {
  const { rolloutId } = await params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;

  const status = typeof body?.status === 'string' ? body.status : '';
  if (!(ALLOWED_STATUS as readonly string[]).includes(status)) {
    return NextResponse.json(
      { message: `Status harus salah satu dari: ${ALLOWED_STATUS.join(', ')}` },
      { status: 400 },
    );
  }

  return proxyBackend(
    (client) =>
      client.request(`/ota/rollouts/${encodeURIComponent(rolloutId)}/transition`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status }),
      }),
    { unauthorized: 'Sesi tidak valid.', unavailable: 'Gagal mengubah status rollout' },
  );
}
