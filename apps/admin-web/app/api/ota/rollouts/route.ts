import { NextResponse } from 'next/server';
import { proxyBackend } from '@/lib/proxy';

const MAX_TARGETS = 500;

/**
 * POST /api/ota/rollouts — create a DRAFT rollout.
 *
 * Targets are bounded to the same 1..500 the domain validator enforces, so an operator
 * cannot submit a list that would be refused after the request has already left the console.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;

  const firmwareId = typeof body?.firmwareId === 'string' ? body.firmwareId : '';
  if (!/^[0-9a-fA-F-]{36}$/.test(firmwareId)) {
    return NextResponse.json({ message: 'Pilih artefak firmware yang valid' }, { status: 400 });
  }

  const targetDeviceIds = Array.isArray(body?.targetDeviceIds)
    ? body.targetDeviceIds.filter((d): d is string => typeof d === 'string')
    : [];
  if (targetDeviceIds.length === 0) {
    return NextResponse.json(
      { message: 'Pilih minimal satu perangkat target' },
      { status: 400 },
    );
  }
  if (targetDeviceIds.length > MAX_TARGETS) {
    return NextResponse.json(
      { message: `Maksimal ${MAX_TARGETS} perangkat per rollout` },
      { status: 400 },
    );
  }

  return proxyBackend(
    (client) =>
      client.request('/ota/rollouts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ firmwareId, targetDeviceIds }),
      }),
    { unauthorized: 'Sesi tidak valid.', unavailable: 'Gagal membuat rollout' },
  );
}
