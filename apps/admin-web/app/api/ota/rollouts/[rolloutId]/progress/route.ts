import { NextResponse } from 'next/server';
import { proxyBackend } from '@/lib/proxy';

const MAX_REPORTS = 500;

/**
 * POST /api/ota/rollouts/[rolloutId]/progress — report per-device OTA outcomes.
 *
 * A rollout is only finalised once every target has reported, so an operator reporting one
 * device at a time is the normal case and both lists default to empty. The response is passed
 * through unchanged on purpose: it carries `status: ROLLED_BACK` when any device failed, and
 * the console must be able to show that rather than infer success from a 200.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ rolloutId: string }> },
) {
  const { rolloutId } = await params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;

  const ids = (value: unknown): string[] =>
    Array.isArray(value)
      ? value.filter((d): d is string => typeof d === 'string').slice(0, MAX_REPORTS)
      : [];

  const succeededDeviceIds = ids(body?.succeededDeviceIds);
  const failedDeviceIds = ids(body?.failedDeviceIds);
  if (succeededDeviceIds.length === 0 && failedDeviceIds.length === 0) {
    return NextResponse.json(
      { message: 'Laporkan minimal satu perangkat yang berhasil atau gagal' },
      { status: 400 },
    );
  }

  return proxyBackend(
    (client) =>
      client.request(`/ota/rollouts/${encodeURIComponent(rolloutId)}/progress`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ succeededDeviceIds, failedDeviceIds }),
      }),
    { unauthorized: 'Sesi tidak valid.', unavailable: 'Gagal mencatat progres rollout' },
  );
}
